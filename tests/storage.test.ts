import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { environment, fixtureChat, repository } from "./helpers.ts";
import { jobs, receipts } from "../src/server/storage/schema.ts";
import { openStore, SCHEMA_VERSION } from "../src/server/storage/database.ts";
import { BotService } from "../src/server/domain/bot.ts";
import type { Repository } from "../src/server/storage/repository.ts";

const opened: Repository[] = [];
afterEach(() => { for (const item of opened.splice(0)) if (item.store.sqlite.open) item.store.close(); });
function setup() {
  const context = environment();
  const repo = repository(context.config);
  opened.push(repo);
  return { ...context, repo };
}

describe("real SQLite persistence", () => {
  it("migrates, uses durable settings, and preserves them after reopening", () => {
    const { repo, config } = setup();
    expect(repo.store.sqlite.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(repo.store.sqlite.pragma("synchronous", { simple: true })).toBe(2);
    repo.set("proof", "survives restart");
    repo.store.close();
    const reopened = repository(config); opened.push(reopened);
    expect(reopened.setting("proof")).toBe("survives restart");
  });

  it("commits a unique receipt and its job together, suppressing replay", () => {
    const { repo, config } = setup();
    expect(repo.acceptReceipt("delivery", "chat.message.sent", fixtureChat())).toBe(true);
    expect(repo.acceptReceipt("delivery", "chat.message.sent", fixtureChat())).toBe(false);
    expect(repo.store.orm.select().from(receipts).all()).toHaveLength(1);
    expect(repo.store.orm.select().from(jobs).all()).toHaveLength(1);
    const job = repo.claim()!;
    new BotService(repo, config).event(job);
    expect(repo.store.orm.select().from(jobs).where(eq(jobs.id, "reply:delivery")).get()?.status).toBe("pending");
    expect(repo.claim()?.kind).toBe("kick.reply");
  });

  it("rolls back the receipt if enqueueing fails", () => {
    const { repo } = setup();
    repo.store.sqlite.exec("CREATE TRIGGER fail_jobs BEFORE INSERT ON jobs BEGIN SELECT RAISE(ABORT,'test'); END");
    expect(() => repo.acceptReceipt("delivery", "chat.message.sent", fixtureChat())).toThrow();
    expect(repo.store.orm.select().from(receipts).all()).toHaveLength(0);
  });

  it("recovers expired local jobs but marks abandoned sends uncertain", () => {
    const { repo } = setup();
    repo.enqueue("local", "proof.record", {}, 0);
    const abandoned = repo.claim(100, 10)!;
    const recovered = repo.claim(111, 10)!;
    expect(recovered.id).toBe(abandoned.id);
    expect(recovered.leaseOwner).not.toBe(abandoned.leaseOwner);
    expect(() => repo.finish(abandoned, "succeeded")).toThrow("job_lease_lost");
    repo.finish(recovered, "succeeded");
    repo.enqueue("send", "kick.reply", {}, 0);
    repo.claim(200, 10);
    expect(repo.claim(211)).toBeUndefined();
    expect(repo.store.orm.select().from(jobs).where(eq(jobs.id, "send")).get()?.status).toBe("uncertain");
  });

  it("refuses a different key, fixture/live mixing, and newer schemas", () => {
    const { repo, config } = setup();
    repo.store.close();
    expect(() => openStore({ ...config, key: Buffer.alloc(32, 4) })).toThrow("encryption_key_does_not_match_database");
    expect(() => openStore({ ...config, mode: "live" })).toThrow("database_mode_mismatch");
    const reopened = repository(config); opened.push(reopened);
    reopened.set("schema_version", String(SCHEMA_VERSION + 1)); reopened.store.close();
    expect(() => openStore(config)).toThrow("unsupported_schema_version");
  });

  it("retains pending work while removing old chat text and expired state", () => {
    const { repo, config } = setup();
    const now = Date.now();
    repo.acceptReceipt("old", "chat.message.sent", fixtureChat(), now - 8 * 86400000);
    new BotService(repo, config).event(repo.claim()!);
    repo.acceptReceipt("pending", "chat.message.sent", fixtureChat(), now - 31 * 86400000);
    repo.retain(now);
    expect(repo.store.orm.select().from(receipts).where(eq(receipts.id, "old")).get()?.payload).toBeNull();
    expect(repo.store.orm.select().from(receipts).where(eq(receipts.id, "pending")).get()?.payload).not.toBeNull();
  });
});
