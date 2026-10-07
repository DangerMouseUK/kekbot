import { afterEach, expect, it } from "vitest";
import { readFileSync, rmSync } from "node:fs";
import { AuthService } from "../src/server/auth.ts";
import { BotService } from "../src/server/domain/bot.ts";
import { Runtime } from "../src/server/runtime.ts";
import { environment, repository } from "./helpers.ts";

const cleanup: (() => void)[] = [];
afterEach(() => { for (const fn of cleanup.splice(0).reverse()) fn(); });
async function setup() {
  const env = environment(); cleanup.push(() => rmSync(env.root, { recursive: true, force: true }));
  const repo = repository(env.config); cleanup.push(() => repo.store.close());
  const auth = new AuthService(repo), bot = new BotService(repo, env.config);
  const login = await auth.setup(readFileSync(env.config.setupTokenFile, "utf8").trim(), { username: "owner", password: "a strong fixture password" });
  return { ...env, repo, bot, auth, owner: auth.session(login.token) };
}
const message = (content: string, id: string) => ({ content, message_id: id, broadcaster: { user_id: 123 }, sender: { user_id: 456 } });

it("scopes configurable escalation to the matching rule and time window", async () => {
  const { bot, owner, repo } = await setup();
  const rule = bot.state.save(owner, "rule", "escalation", { name: "Phrase", type: "phrase", patterns: ["spam"], escalation: true, escalationAfter: 1, escalationWindowSeconds: 60, escalationAction: "delete" });
  repo.store.sqlite.prepare("INSERT INTO incidents(id,viewer,rule,action,reason,at) VALUES('unrelated','456','other','warn','other',?)").run(Date.now());
  bot.moderation.inspect(message("spam", "first"), "first");
  bot.moderation.inspect(message("spam", "second"), "second");
  expect(repo.store.sqlite.prepare("SELECT action FROM incidents WHERE id='moderation:first'").get()).toEqual({ action: "warn" });
  expect(repo.store.sqlite.prepare("SELECT action FROM incidents WHERE id='moderation:second'").get()).toEqual({ action: "delete" });
  repo.store.sqlite.prepare("UPDATE incidents SET at=? WHERE rule=?").run(Date.now() - 61000, rule.id);
  bot.moderation.inspect(message("spam", "later"), "later");
  expect(repo.store.sqlite.prepare("SELECT action FROM incidents WHERE id='moderation:later'").get()).toEqual({ action: "warn" });
});

it("temporary incident presets require permission/review, survive restart, expire and respect emergency pause", async () => {
  const { bot, owner, repo, config, auth } = await setup();
  const invite = auth.invite(owner, "readonly"), login = await auth.acceptInvite(invite.token, { username: "reader", password: "a strong readonly password" });
  await expect(bot.action(auth.session(login.token), "moderation.incident.start", { preset: "links", minutes: 15, acknowledge: true }, "denied")).rejects.toThrow("permission_denied");
  await expect(bot.action(owner, "moderation.incident.start", { preset: "links", minutes: 15 }, "unreviewed")).rejects.toThrow();
  expect(repo.setting("incident_mode")).toBeUndefined();
  await bot.action(owner, "moderation.incident.start", { preset: "combined", minutes: 15, acknowledge: true }, "reviewed");
  const restarted = new BotService(repo, config);
  expect(restarted.moderation.inspect(message("https://spam.example", "active"), "active")).toBe(true);
  expect(restarted.state.snapshot(owner).incidentMode).toMatchObject({ preset: "combined" });
  await restarted.action(owner, "moderation.pause", {}, "pause");
  expect(restarted.moderation.inspect(message("https://spam.example", "paused"), "paused")).toBe(false);
  await restarted.action(owner, "moderation.resume", {}, "resume");
  repo.set("incident_mode", JSON.stringify({ preset: "combined", endsAt: Date.now() - 1 }));
  expect(restarted.moderation.inspect(message("https://spam.example", "expired"), "expired")).toBe(false);
  expect(restarted.state.snapshot(owner).incidentMode).toBeNull();
  expect(restarted.state.list("rule")).toEqual([]);
  await restarted.action(owner, "moderation.incident.stop", {}, "stop");
  expect(repo.setting("incident_mode")).toBe("null");
});

it("validation commits one final chat status with metadata and exposes only the requester name to OBS", async () => {
  const { bot, owner, repo } = await setup();
  bot.state.save(owner, "settings", "instance", { mediaEnabled: true, requestCooldown: 0 });
  repo.store.sqlite.prepare("INSERT INTO viewers(id,name,role,last_seen) VALUES('456','Fixture requester','viewer',?)").run(Date.now());
  const item = bot.media.request("abcdefghijk", "456");
  await bot.media.validate(item.id, false); await bot.media.validate(item.id, false);
  const result = repo.store.sqlite.prepare("SELECT payload FROM jobs WHERE id=?").get(`media-result:${item.id}`) as { payload: string };
  expect(JSON.parse(result.payload).text).toContain("awaiting moderator approval");
  bot.media.decide(owner, item.id, bot.media.item(item.id)!.version, "approve");
  bot.media.control(owner, "resume", bot.media.player.version);
  bot.state.save(owner, "widget", "playing", { name: "Now playing", type: "nowplaying" });
  const publicState = bot.presentation.widget("playing").data as { current: Record<string, unknown> };
  expect(publicState.current).toMatchObject({ title: "Fixture video abcdefghijk", requesterName: "Fixture requester" });
  expect(publicState.current).not.toHaveProperty("requester");
  bot.operations.eraseViewer(owner, "456");
  expect((bot.presentation.widget("playing").data as typeof publicState).current.requesterName).toBe("Erased viewer");
});

it("failed validation reports the reason once and moderator additions do not spam chat", async () => {
  const { bot, owner, repo } = await setup();
  bot.state.save(owner, "settings", "instance", { mediaEnabled: true, maxDuration: 60, requestCooldown: 0 });
  const item = bot.media.request("abcdefghijk", "456");
  await bot.media.validate(item.id, false); await bot.media.validate(item.id, false);
  expect(JSON.parse((repo.store.sqlite.prepare("SELECT payload FROM jobs WHERE id=?").get(`media-result:${item.id}`) as { payload: string }).payload).text).toContain("video_duration_rejected");
  const manual = bot.media.request("lmnopqrstuv", owner.id, "manual", true);
  await bot.media.validate(manual.id, true);
  expect(repo.store.sqlite.prepare("SELECT 1 FROM jobs WHERE id='media-result:manual'").get()).toBeUndefined();
});

it("rechecks queued timer effects after pause, offline, edits and restart rather than sending stale reminders", async () => {
  const { bot, owner, repo, config } = await setup(), runtime = new Runtime(config);
  const timer = bot.state.save(owner, "timer", "delivery-timer", { name: "Reminder", messages: ["Reminder"], interval: 60, minMessages: 0 });
  let sequence = 0;
  const queue = () => {
    repo.set("stream_is_live", "true");
    const now = Date.now(); bot.automation.recoverTimers(now - 61000 + sequence++);
    bot.automation.timers(now);
    return repo.claim()!;
  };
  try {
    const eligible = queue(); await runtime.execute(eligible);
    expect(repo.setting("fixture_last_reply")).toBe(eligible.id);
    const paused = queue(); await bot.action(owner, "timers.pause", {}, "pause"); await runtime.execute(paused);
    await bot.action(owner, "timers.resume", {}, "resume");
    const offline = queue(); repo.set("stream_is_live", "false"); await runtime.execute(offline);
    const restarted = queue(); runtime.bot.automation.recoverTimers(); await runtime.execute(restarted);
    const edited = queue(); bot.state.save(owner, "timer", timer.id, { ...timer.data, messages: ["New reminder"] }, timer.version); await runtime.execute(edited);
    for (const job of [paused, offline, restarted, edited]) expect(repo.store.sqlite.prepare("SELECT status,last_error FROM jobs WHERE id=?").get(job.id)).toEqual({ status: "failed", last_error: "timer_no_longer_eligible" });
    expect(repo.setting("fixture_last_reply")).toBe(eligible.id);
  } finally { await runtime.stop(); }
});
