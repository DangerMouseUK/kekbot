import { afterEach, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AuthService } from "../src/server/auth.ts";
import { BotService } from "../src/server/domain/bot.ts";
import { digest } from "../src/server/crypto.ts";
import { backup, recoverOwner, restore } from "../src/server/maintenance.ts";
import { seedFixture } from "../src/server/fixture-seed.ts";
import { openStore, SCHEMA_VERSION } from "../src/server/storage/database.ts";
import { environment, repository } from "./helpers.ts";
const cleanup: (() => void)[] = [];
afterEach(() => { for (const fn of cleanup.splice(0).reverse()) fn(); });
function setup() { const context = environment(); cleanup.push(() => rmSync(context.root, { recursive: true, force: true })); return context; }

it("upgrades the actual v1 schema while preserving records and refuses a future schema", () => {
  const { config } = setup(), directory = join(config.directory, "legacy"), database = join(directory, "kekbot.sqlite");
  mkdirSync(directory); const legacy = new Database(database);
  legacy.exec(readFileSync("drizzle/0000_dizzy_grandmaster.sql", "utf8"));
  legacy.exec("CREATE TABLE __drizzle_migrations(id INTEGER PRIMARY KEY,hash TEXT NOT NULL,created_at NUMERIC)");
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
  legacy.prepare("INSERT INTO __drizzle_migrations(hash,created_at) VALUES(?,?)").run("historical-migration", journal.entries[0].when);
  for (const [key, value] of [["schema_version", "1"], ["mode", "fixture"], ["key_fingerprint", digest(config.key)], ["preserved", "original value"]]) legacy.prepare("INSERT INTO settings(key,value) VALUES(?,?)").run(key, value);
  legacy.close();
  const upgraded = openStore({ ...config, directory, database, assets: join(directory, "assets") });
  try {
    expect(upgraded.sqlite.prepare("SELECT value FROM settings WHERE key='preserved'").get()).toEqual({ value: "original value" });
    expect(upgraded.sqlite.prepare("SELECT value FROM settings WHERE key='schema_version'").get()).toEqual({ value: String(SCHEMA_VERSION) });
    expect(upgraded.sqlite.prepare("SELECT count(*) AS n FROM accounts").get()).toEqual({ n: 0 });
  } finally { upgraded.close(); }
});

it("recovers an owner only on a stopped host and preserves all module state through backup/restore", async () => {
  const { config, root } = setup();
  await seedFixture(config);
  let repo = repository(config), auth = new AuthService(repo);
  const credentials = JSON.parse(readFileSync(join(config.directory, "secrets", "fixture-account.json"), "utf8"));
  const session = await auth.login(credentials), owner = auth.session(session.token), bot = new BotService(repo, config);
  const token = bot.presentation.issueToken(owner, "API", "api", ["read"]);
  repo.acquireLease("running"); repo.store.close();
  const passwordFile = join(root, "recovery-password"); writeFileSync(passwordFile, "a replacement fixture password", { mode: 0o600 });
  await expect(recoverOwner(config, "fixture-owner", passwordFile)).rejects.toThrow("instance_already_running_or_in_maintenance");
  repo = repository(config); repo.releaseLease("running"); repo.store.close();
  await recoverOwner(config, "fixture-owner", passwordFile);
  repo = repository(config); auth = new AuthService(repo);
  expect(() => auth.session(session.token)).toThrow("login_required");
  expect(() => new BotService(repo, config).presentation.token(token.token, "api", "read")).toThrow("invalid_or_revoked_access_token");
  await auth.login({ username: "fixture-owner", password: "a replacement fixture password" });
  const before = repo.store.sqlite.prepare("SELECT count(*) AS n FROM documents").get(); repo.store.close();
  const snapshot = join(root, "snapshot"); await backup(config, snapshot);
  const target = { ...config, directory: join(root, "restored"), database: join(root, "restored", "kekbot.sqlite"), assets: join(root, "restored", "assets") };
  restore(target, snapshot);
  const restored = repository(target);
  try {
    expect(restored.store.sqlite.prepare("SELECT count(*) AS n FROM documents").get()).toEqual(before);
    expect(new BotService(restored, target).engagement.balance("456")).toBe(100);
    expect(restored.store.sqlite.prepare("SELECT count(*) AS n FROM accounts WHERE role='owner'").get()).toEqual({ n: 1 });
  } finally { restored.store.close(); }
});

it("retention and viewer erasure preserve durable balances and queue state", async () => {
  const { config } = setup(); await seedFixture(config); const repo = repository(config);
  try {
    const owner = repo.store.sqlite.prepare("SELECT id,role FROM accounts WHERE role='owner'").get() as { id: string; role: "owner" };
    const actor = { ...owner, permissions: [] }, bot = new BotService(repo, config);
    repo.acceptReceipt("old", "chat.message.sent", { sender: { user_id: 456 }, content: "personal fixture text" }, Date.now() - 10 * 86400000);
    const job = repo.claim()!; repo.finish(job, "succeeded");
    bot.operations.retain();
    expect(repo.store.sqlite.prepare("SELECT payload FROM receipts WHERE id='old'").get()).toEqual({ payload: null });
    bot.operations.eraseViewer(actor, "456"); expect(bot.engagement.balance("456")).toBe(100);
    repo.acceptReceipt("pending", "chat.message.sent", { sender: { user_id: 456 }, content: "pending text" });
    expect(() => bot.operations.eraseViewer(actor, "456")).toThrow("privacy_processing_pending_retry_after_jobs_complete");
    repo.finish(repo.claim()!, "succeeded");
    const settings = bot.state.document("instance")!;
    bot.state.save(actor, "settings", "instance", { ...settings.data, chatDays: 0 }, settings.version);
    repo.acceptReceipt("no-history", "chat.message.sent", { sender: { user_id: 456 }, broadcaster: { user_id: 123 }, message_id: "no-history", content: "ordinary message" });
    bot.event(repo.claim()!);
    expect(repo.store.sqlite.prepare("SELECT payload FROM receipts WHERE id='no-history'").get()).toEqual({ payload: null });
    expect(JSON.stringify(bot.operations.support(actor))).not.toContain("Fixture viewer");
  } finally { repo.store.close(); }
});
