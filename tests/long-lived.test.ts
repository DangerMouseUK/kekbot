import { afterEach, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { BotService } from "../src/server/domain/bot.ts";
import { decrypt, digest } from "../src/server/crypto.ts";
import { SCHEMA_VERSION } from "../src/server/storage/database.ts";
import { environment, repository } from "./helpers.ts";

const cleanup: (() => void)[] = [];
afterEach(() => { vi.useRealTimers(); for (const fn of cleanup.splice(0).reverse()) fn(); });
function setup() {
  const env = environment(); cleanup.push(() => rmSync(env.root, { recursive: true, force: true }));
  const repo = repository(env.config); cleanup.push(() => repo.store.close());
  const bot = new BotService(repo, env.config), owner = { id: "owner", role: "owner" as const, permissions: [] };
  repo.store.sqlite.prepare("INSERT INTO accounts(id,username,password,role,created_at) VALUES('owner','owner','not-a-login','owner',?)").run(Date.now());
  return { ...env, repo, bot, owner };
}

it("keeps a full active queue visible after years of history and paginates tied timestamps without duplicates", () => {
  const { bot, owner, repo } = setup();
  const add = repo.store.sqlite.prepare("INSERT INTO media(id,video_id,requester,status,position,created_at) VALUES(?,'abcdefghijk','456',?,?,?)");
  repo.store.sqlite.transaction(() => {
    for (let i = 0; i < 1200; i++) add.run(`history-${String(i).padStart(4, "0")}`, "completed", i, 100);
    for (let i = 0; i < 500; i++) add.run(`active-${i}`, "approved", 1200 + i, 200);
  })();
  const active = bot.state.snapshot(owner).media as { id: string }[];
  expect(active).toHaveLength(500); expect(active.every(row => row.id.startsWith("active-"))).toBe(true);
  bot.media.reorder(owner, active.map(row => row.id).reverse());
  expect((bot.state.snapshot(owner).media[0] as { id: string }).id).toBe("active-499");
  const seen: string[] = []; let cursor: string | undefined;
  do { const page = bot.media.history({ limit: "100", cursor }); seen.push(...page.items.map(row => row.id)); cursor = page.nextCursor ?? undefined; } while (cursor);
  expect(seen).toHaveLength(1200); expect(new Set(seen).size).toBe(1200);
  expect(() => bot.media.history({ limit: "101" })).toThrow();
  expect(() => bot.media.history({ cursor: "modified" })).toThrow("invalid_media_history_cursor");
  const first = bot.media.history({ limit: "10" }); add.run("new-history", "failed", 1, 300);
  expect(bot.media.history({ cursor: first.nextCursor!, limit: "10" }).items.some(row => first.items.some(old => old.id === row.id))).toBe(false);
  // Intake permits 128-character delivery IDs; media adds its own prefix.
  add.run(`request:${"x".repeat(128)}`, "failed", 1, 400);
  const longIdPage = bot.media.history({ limit: "1" });
  expect(bot.media.history({ cursor: longIdPage.nextCursor!, limit: "1" }).items[0].id).toBe("new-history");
});

it("scrubs expired failed/successful payloads, keeps audit metadata and encrypts uncertain delivery without retry", () => {
  const { repo, bot, config } = setup(), now = Date.now();
  for (const status of ["succeeded", "failed", "pending", "running", "uncertain"]) {
    repo.enqueue(status, "kick.reply", { text: "synthetic private text", viewer: "456" });
    repo.store.sqlite.prepare("UPDATE jobs SET status=?,created_at=?,payload_expires_at=? WHERE id=?").run(status, now - 100 * 86400000, now - 1, status);
  }
  bot.operations.retain(now);
  const rows = repo.store.sqlite.prepare("SELECT id,payload,payload_state FROM jobs").all() as { id: string; payload: string; payload_state: string }[];
  for (const id of ["succeeded", "failed"]) expect(rows.find(row => row.id === id)).toMatchObject({ payload: "{}", payload_state: "scrubbed" });
  for (const id of ["pending", "running"]) expect(rows.find(row => row.id === id)?.payload).toContain("synthetic private text");
  const uncertain = rows.find(row => row.id === "uncertain")!;
  expect(uncertain.payload).not.toContain("synthetic private text");
  expect(decrypt(uncertain.payload, config.key, "job:uncertain")).toContain("synthetic private text");
  repo.store.sqlite.prepare("UPDATE jobs SET status='succeeded' WHERE id IN ('pending','running')").run();
  expect(repo.claim()).toBeUndefined();
  bot.operations.retain(now + 400 * 86400000);
  expect(repo.store.sqlite.prepare("SELECT id FROM jobs").all()).toEqual([{ id: "uncertain" }]);
});

it("viewer erasure blocks pending derived replies and scrubs their resolved payloads without touching balances", () => {
  const { repo, bot, owner } = setup();
  bot.state.save(owner, "command", "echo", { name: "Echo", trigger: "!echo", responses: ["{args}"], cooldown: 0, userCooldown: 0 });
  repo.acceptReceipt("one", "chat.message.sent", { message_id: "one", content: "!echo synthetic private text", sender: { user_id: 456 }, broadcaster: { user_id: 123 } });
  bot.event(repo.claim()!);
  bot.engagement.adjust(owner, "456", 100, "Synthetic balance");
  expect(() => bot.operations.eraseViewer(owner, "456")).toThrow("privacy_processing_pending");
  repo.finish(repo.claim()!, "failed");
  bot.operations.eraseViewer(owner, "456");
  expect(repo.store.sqlite.prepare("SELECT payload,payload_state FROM jobs WHERE id='reply:one'").get()).toEqual({ payload: "{}", payload_state: "scrubbed" });
  expect(bot.engagement.balance("456")).toBe(100);
});

it("zero chat retention scrubs terminal jobs immediately and expired delivery leases become encrypted uncertainty", () => {
  const { repo, bot, owner, config } = setup();
  bot.state.save(owner, "settings", "instance", { chatDays: 0 });
  repo.enqueue("complete", "kick.reply", { text: "private" }); repo.finish(repo.claim()!, "succeeded");
  expect(repo.store.sqlite.prepare("SELECT payload FROM jobs WHERE id='complete'").get()).toEqual({ payload: "{}" });
  repo.enqueue("crashed", "kick.reply", { text: "private" });
  const job = repo.claim()!; repo.claim(job.leaseUntil! + 1);
  const saved = repo.store.sqlite.prepare("SELECT status,payload FROM jobs WHERE id='crashed'").get() as { status: string; payload: string };
  expect(saved.status).toBe("uncertain"); expect(decrypt(saved.payload, config.key, "job:crashed")).toContain("private");
});

it("expires temporary settings across restart while protecting deferred Discord results", () => {
  const { repo, bot } = setup(); vi.useFakeTimers(); const now = Date.now();
  repo.set("login:synthetic", JSON.stringify({ count: 8, until: now + 900000 }));
  repo.set("cooldown:command:456", String(now)); repo.set("utility:456:!points", String(now));
  repo.set("sent:synthetic", String(now)); repo.set("request:456", String(now));
  repo.enqueue("discord:500", "discord.interaction", { encrypted: "fixture" });
  repo.set("discord_result:500", "Already processed");
  vi.setSystemTime(now + 31 * 86400000);
  const reopened = repository(bot.state.config);
  try {
    expect(reopened.setting("login:synthetic")).toBeUndefined();
    expect(reopened.setting("discord_result:500")).toBe("Already processed");
    new BotService(reopened, bot.state.config).operations.retain();
    expect(reopened.store.sqlite.prepare("SELECT key FROM settings WHERE expires_at IS NOT NULL").all()).toEqual([{ key: "discord_result:500" }]);
    const job = reopened.claim()!; reopened.finish(job, "succeeded");
    new BotService(reopened, bot.state.config).operations.retain();
    expect(reopened.setting("discord_result:500")).toBeUndefined();
  } finally { reopened.store.close(); }
});

it("upgrades real schema-2 jobs and preserves receipt associations and expiring cooldowns", () => {
  const { config, root } = setup(), directory = join(root, "schema-two"); mkdirSync(directory);
  const database = join(directory, "kekbot.sqlite"), db = new Database(database);
  db.exec(readFileSync("drizzle/0000_dizzy_grandmaster.sql", "utf8")); db.exec(readFileSync("drizzle/0001_brainy_the_watchers.sql", "utf8"));
  db.exec("CREATE TABLE __drizzle_migrations(id INTEGER PRIMARY KEY,hash TEXT NOT NULL,created_at NUMERIC)");
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
  for (const entry of journal.entries.slice(0, 2)) db.prepare("INSERT INTO __drizzle_migrations(hash,created_at) VALUES('synthetic',?)").run(entry.when);
  for (const [key, value] of [["schema_version", "2"], ["mode", "fixture"], ["key_fingerprint", digest(config.key)], ["cooldown:legacy:456", String(Date.now())]]) db.prepare("INSERT INTO settings(key,value) VALUES(?,?)").run(key, value);
  db.prepare("INSERT INTO receipts(id,event_type,payload,received_at) VALUES('legacy','chat.message.sent',?,?)").run(JSON.stringify({ sender: { user_id: 456 }, content: "private" }), Date.now());
  db.prepare("INSERT INTO jobs(id,kind,payload,status,due_at,created_at) VALUES('reply:legacy','kick.reply',?,'failed',?,?)").run(JSON.stringify({ text: "private" }), Date.now(), Date.now()); db.close();
  const legacy = new Database(database);
  legacy.prepare("INSERT INTO receipts(id,event_type,payload,received_at) VALUES('follow','channel.followed',?,?)").run(JSON.stringify({ follower: { user_id: 789, username: "Synthetic follower" } }), Date.now());
  legacy.prepare("INSERT INTO jobs(id,kind,payload,status,due_at,created_at) VALUES('discord:follow:guild','discord.send',?,'failed',?,?)").run(JSON.stringify({ text: "Synthetic follower" }), Date.now(), Date.now()); legacy.close();
  const upgraded = repository({ ...config, directory, database, assets: join(directory, "assets") });
  try {
    expect(upgraded.setting("schema_version")).toBe(String(SCHEMA_VERSION));
    expect(upgraded.store.sqlite.prepare("SELECT viewer_ids FROM jobs WHERE id='reply:legacy'").get()).toEqual({ viewer_ids: '["456"]' });
    upgraded.scrubViewer("456"); expect(upgraded.store.sqlite.prepare("SELECT payload FROM jobs WHERE id='reply:legacy'").get()).toEqual({ payload: "{}" });
    upgraded.scrubViewer("789"); expect(upgraded.store.sqlite.prepare("SELECT payload FROM jobs WHERE id='discord:follow:guild'").get()).toEqual({ payload: "{}" });
    upgraded.retain(); expect(upgraded.setting("cooldown:legacy:456")).toBeDefined();
    expect(upgraded.store.sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
  } finally { upgraded.store.close(); }
});
