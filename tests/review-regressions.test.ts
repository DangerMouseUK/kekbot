import { afterEach, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { control } from "../src/server/control.ts";
import { Runtime } from "../src/server/runtime.ts";
import { Repository } from "../src/server/storage/repository.ts";
import { BotService } from "../src/server/domain/bot.ts";
import { environment } from "./helpers.ts";

const cleanup: (() => void)[] = [];
afterEach(() => { vi.useRealTimers(); for (const fn of cleanup.splice(0).reverse()) fn(); });
function setup() {
  const env = environment(); cleanup.push(() => rmSync(env.root, { recursive: true, force: true }));
  const app = new Runtime(env.config); cleanup.push(() => app.repository.store.close());
  const bot = app.bot, repo = app.repository, db = bot.state.db;
  const owner = { id: "owner", role: "owner" as const, permissions: [] };
  db.prepare("INSERT INTO accounts(id,username,password,role,created_at) VALUES('owner','owner','not-a-login','owner',?)").run(Date.now());
  return { ...env, app, bot, repo, db, owner };
}

it("advances retained versions across replacement imports, including swapped command triggers", () => {
  const { bot, owner } = setup();
  let first = bot.state.save(owner, "command", "first", { name: "First", trigger: "!first", responses: ["Original"] });
  first = bot.state.save(owner, "command", first.id, { ...first.data, responses: ["Edited"] }, first.version);
  const second = bot.state.save(owner, "command", "second", { name: "Second", trigger: "!second", responses: ["Other"] });
  bot.state.save(owner, "timer", "removed", { name: "Removed", interval: 60, messages: ["Old"] });
  const bundle = bot.operations.exportConfig(owner);
  bundle.documents = bundle.documents.filter(doc => doc.id !== "removed").map(doc => ({ ...doc, data: { ...doc.data, trigger: doc.id === "first" ? "!second" : "!first" } }));
  bot.operations.importConfig(owner, bundle, "replace", true);
  expect(bot.state.document(first.id)).toMatchObject({ version: first.version + 1, data: { trigger: "!second" } });
  expect(bot.state.document(second.id)?.version).toBe(second.version + 1);
  expect(bot.state.document("removed")).toBeUndefined();
  expect(() => bot.state.save(owner, "command", first.id, first.data, first.version)).toThrow("configuration_changed_reload");
  expect(() => bot.state.remove(owner, second.id, second.version)).toThrow("configuration_changed_reload");
  bot.operations.importConfig(owner, bundle, "replace", true);
  expect(bot.state.document(first.id)?.version).toBe(first.version + 2);
  bot.operations.importConfig(owner, bundle, "merge", true);
  expect(bot.state.document(first.id)?.version).toBe(first.version + 2);
});

it("reconciles a generated goal notification ID without resending or widening document IDs", async () => {
  const { app, bot, repo, db, owner } = setup();
  bot.state.save(owner, "guild", undefined, { name: "Guild", guildId: "100", channelId: "200", events: ["goal"] });
  bot.state.save(owner, "goal", undefined, { name: "Goal", metric: "follow", target: 1 });
  bot.presentation.goal("follow", 1, "01J00000000000000000000100");
  const job = repo.claim()!;
  expect(job.kind).toBe("discord.send"); expect(job.id.length).toBeGreaterThan(100);
  repo.finish(job, "uncertain", "fixture_delivery_unknown");
  db.prepare("INSERT INTO accounts(id,username,password,role,created_at) VALUES('reader','reader','not-a-login','readonly',?)").run(Date.now());
  await expect(control(app, { id: "reader", role: "readonly", permissions: [] }, { action: "job.resolve", input: { id: job.id, result: "confirmed" } })).rejects.toThrow("owner_required");
  await expect(control(app, owner, { action: "job.resolve", input: { id: job.id, result: "confirmed" } })).resolves.toEqual({ reconciled: true });
  expect(db.prepare("SELECT status,payload,payload_state,attempts FROM jobs WHERE id=?").get(job.id)).toEqual({ status: "succeeded", payload: "{}", payload_state: "scrubbed", attempts: 1 });
  expect(repo.claim()).toBeUndefined();
  await expect(control(app, owner, { action: "job.resolve", input: { id: job.id, result: "failed" } })).rejects.toThrow("job_not_uncertain");
  await expect(control(app, owner, { action: "job.resolve", input: { id: "x".repeat(1025), result: "failed" } })).rejects.toThrow();
  await expect(control(app, owner, { action: "config.save", input: { kind: "command", id: "x".repeat(101), data: { name: "Long", trigger: "!long", responses: ["Test"] } } })).rejects.toThrow();
});

it.each(["uncertain-jobs", "pending-redemptions"] as const)("keeps every %s item discoverable beyond newer history with bounded, stable pages", view => {
  const { bot, repo, db, owner } = setup();
  const add = view === "uncertain-jobs"
    ? db.prepare("INSERT INTO jobs(id,kind,payload,status,due_at,created_at) VALUES(?,'kick.reply','{}',?,0,?)")
    : db.prepare("INSERT INTO redemptions(id,viewer,reward,cost,status,created_at) VALUES(?,'456','reward',10,?,?)");
  db.transaction(() => {
    for (let i = 0; i < 125; i++) add.run(`waiting-${String(i).padStart(3, "0")}`, view === "uncertain-jobs" ? "uncertain" : "pending", 100);
    for (let i = 0; i < 150; i++) add.run(`history-${i}`, view === "uncertain-jobs" ? "succeeded" : "completed", 200);
  })();
  const snapshot = bot.state.snapshot(owner);
  const first = view === "uncertain-jobs" ? snapshot.uncertainJobs : snapshot.pendingRedemptions;
  expect(first.items).toHaveLength(50);
  expect((view === "uncertain-jobs" ? snapshot.jobs : snapshot.redemptions).every(row => String((row as { id: string }).id).startsWith("history-"))).toBe(true);
  const seen: string[] = []; let cursor: string | undefined;
  do { const page = bot.state.workQueue(view, { cursor, limit: "50" }); seen.push(...page.items.map(row => row.id)); cursor = page.nextCursor ?? undefined; } while (cursor);
  expect(seen).toHaveLength(125); expect(new Set(seen).size).toBe(125);
  add.run("new-waiting", view === "uncertain-jobs" ? "uncertain" : "pending", 300);
  const second = bot.state.workQueue(view, { cursor: first.nextCursor! });
  expect(second.items.every(row => !first.items.some(old => old.id === row.id))).toBe(true);
  expect(() => bot.state.workQueue(view, { limit: "101" })).toThrow();
  expect(() => bot.state.workQueue(view, { cursor: "modified" })).toThrow("invalid_work_queue_cursor");
  const other = view === "uncertain-jobs" ? "pending-redemptions" : "uncertain-jobs";
  expect(() => bot.state.workQueue(other, { cursor: first.nextCursor! })).toThrow("invalid_work_queue_cursor");
  // Uncertain jobs remain excluded from automatic delivery throughout browsing.
  if (view === "uncertain-jobs") expect(repo.claim()).toBeUndefined();
});

it("fulfills an old pending redemption after hundreds of newer decisions, with one refund", async () => {
  const { app, bot, db, owner } = setup();
  bot.state.save(owner, "settings", "instance", { pointsEnabled: true });
  const reward = bot.state.save(owner, "reward", undefined, { name: "Reward", cost: 10 });
  bot.engagement.adjust(owner, "456", 2000, "fixture opening balance");
  bot.engagement.redeem("456", reward.id, "old-pending");
  db.prepare("UPDATE redemptions SET created_at=100 WHERE id='old-pending'").run();
  for (let i = 0; i < 110; i++) {
    bot.engagement.redeem("456", reward.id, `new-${i}`);
    bot.engagement.fulfill(owner, `new-${i}`, "complete");
  }
  expect(bot.state.snapshot(owner).redemptions.some(row => (row as { id: string }).id === "old-pending")).toBe(false);
  expect(bot.state.snapshot(owner).pendingRedemptions.items[0].id).toBe("old-pending");
  const balance = bot.engagement.balance("456");
  await control(app, owner, { action: "reward.reject", input: { target: "old-pending" } });
  await expect(control(app, owner, { action: "reward.reject", input: { target: "old-pending" } })).rejects.toThrow("redemption_already_decided");
  expect(bot.engagement.balance("456")).toBe(balance + 10);
  expect(bot.state.workQueue("pending-redemptions").items).toEqual([]);
});

it.each([false, true])("erases gift recipients and guards related work, including legacy associations=%s", legacy => {
  const { bot, repo, db, owner } = setup();
  const payload = { broadcaster: { user_id: 123 }, gifter: { user_id: null, username: null }, giftees: [{ user_id: 456, username: "Synthetic recipient" }, { user_id: 789, username: "Other recipient" }] };
  expect(Repository.viewerIds(payload)).toEqual(["456", "789"]);
  repo.acceptReceipt("gift", "channel.subscription.gifts", payload);
  repo.acceptReceipt("unrelated", "channel.followed", { follower: { user_id: 999, username: "Unrelated viewer" } });
  bot.state.save(owner, "guild", "guild", { name: "Guild", guildId: "100", channelId: "200", events: ["goal"] });
  bot.state.save(owner, "goal", "gift-goal", { name: "Gift goal", metric: "subscription", target: 1 });
  if (legacy) db.prepare("UPDATE jobs SET viewer_ids='[]' WHERE id='event:gift'").run();
  expect(() => bot.operations.eraseViewer(owner, "456")).toThrow("privacy_processing_pending_retry_after_jobs_complete");
  bot.event(repo.claim()!);
  // Another unrelated pending receipt must not block erasing this recipient.
  const derived = "discord:goal:gift-goal:gift:guild";
  if (legacy) db.prepare("UPDATE jobs SET viewer_ids='[]' WHERE id=?").run(derived);
  expect(() => bot.operations.eraseViewer(owner, "456")).toThrow("privacy_processing_pending_retry_after_jobs_complete");
  db.prepare("UPDATE jobs SET status='succeeded' WHERE id=?").run(derived);
  bot.operations.eraseViewer(owner, "456");
  expect(db.prepare("SELECT payload FROM receipts WHERE id='gift'").get()).toEqual({ payload: null });
  expect(db.prepare("SELECT payload,payload_state FROM jobs WHERE id=?").get(derived)).toEqual({ payload: "{}", payload_state: "scrubbed" });
  expect((db.prepare("SELECT payload FROM receipts WHERE id='unrelated'").get() as { payload: string }).payload).toContain("Unrelated viewer");
});

it.each(["!skip", "!sr invalid"])("throttles error replies for %s across restart without consuming another viewer's cooldown", content => {
  const { bot, repo, db, owner, config } = setup();
  bot.state.save(owner, "settings", "instance", { mediaEnabled: true });
  vi.useFakeTimers(); vi.setSystemTime(200000);
  const chat = (service: BotService, id: string, viewer = 456) => service.automation.chat({ content, message_id: id, broadcaster: { user_id: 123 }, sender: { user_id: viewer } }, id);
  for (let i = 0; i < 10; i++) chat(bot, `burst-${i}`);
  expect(db.prepare("SELECT count(*) AS n FROM jobs WHERE kind='kick.reply'").get()).toEqual({ n: 1 });
  const restarted = new BotService(repo, config);
  chat(restarted, "restart"); chat(restarted, "other-viewer", 789);
  expect(db.prepare("SELECT count(*) AS n FROM jobs WHERE kind='kick.reply'").get()).toEqual({ n: 2 });
  vi.setSystemTime(205000); chat(restarted, "after-cooldown");
  expect(db.prepare("SELECT count(*) AS n FROM jobs WHERE kind='kick.reply'").get()).toEqual({ n: 3 });
  expect(db.prepare("SELECT count(*) AS n FROM jobs WHERE kind!='kick.reply'").get()).toEqual({ n: 0 });
  bot.state.save(owner, "command", "custom", { name: "Custom", trigger: "!custom", responses: ["Hello"], cooldown: 0, userCooldown: 0 });
  for (let i = 0; i < 2; i++) bot.automation.chat({ content: "!custom", message_id: `custom-${i}`, broadcaster: { user_id: 123 }, sender: { user_id: 456 } }, `custom-${i}`);
  expect(db.prepare("SELECT count(*) AS n FROM jobs WHERE kind='kick.reply'").get()).toEqual({ n: 5 });
});
