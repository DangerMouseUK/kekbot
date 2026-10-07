import { afterEach, describe, expect, it } from "vitest";
import { generateKeyPairSync, sign, randomBytes } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { AuthService, type Actor } from "../src/server/auth.ts";
import { BotService } from "../src/server/domain/bot.ts";
import { configSchemas } from "../src/server/domain/catalog.ts";
import { evaluateRule } from "../src/server/domain/moderation.ts";
import { videoId } from "../src/server/domain/media.ts";
import { csv } from "../src/server/domain/operations.ts";
import { DiscordService } from "../src/server/providers/discord.ts";
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
describe("shared module services with real SQLite", () => {
  it("applies commands, role restrictions and persistent cooldowns through committed receipts", async () => {
    const { bot, owner, repo } = await setup();
    const command = bot.state.save(owner, "command", undefined, { name: "Greeting", trigger: "!hello", aliases: ["!hi"], responses: ["Hello {user} #{counter}"], counter: true });
    const receive = (id: string, content: string) => { repo.acceptReceipt(id, "chat.message.sent", { content, message_id: id, sender: { user_id: 456, username: "Fixture viewer" }, broadcaster: { user_id: 123 } }); bot.event(repo.claim()!); };
    receive("one", "!hi");
    expect(JSON.parse((repo.store.sqlite.prepare("SELECT payload FROM jobs WHERE id='reply:one'").get() as { payload: string }).payload).text).toBe("Hello Fixture viewer #1");
    // Finish the outgoing reply before taking the next event job.
    repo.finish(repo.claim()!, "succeeded"); receive("two", "!hello");
    expect(repo.store.sqlite.prepare("SELECT 1 FROM jobs WHERE id='reply:two'").get()).toBeUndefined();
    bot.state.save(owner, "command", command.id, { ...command.data, roles: ["moderator"], cooldown: 0, userCooldown: 0 }, command.version);
    receive("three", "!hi"); expect(repo.store.sqlite.prepare("SELECT 1 FROM jobs WHERE id='reply:three'").get()).toBeUndefined();
    expect(repo.acceptReceipt("one", "chat.message.sent", {})).toBe(false);
  });
  it("reschedules timers after restart, offline and pause without catchup sends", async () => {
    const { bot, owner, repo } = await setup();
    const timer = bot.state.save(owner, "timer", undefined, { name: "Reminder", messages: ["Hello"], interval: 60, minMessages: 0 });
    bot.automation.recoverTimers(100000); bot.automation.timers(200000);
    expect(repo.store.sqlite.prepare("SELECT count(*) AS n FROM jobs").get()).toEqual({ n: 0 });
    repo.set("stream_is_live", "true"); bot.automation.timers(261000);
    expect(repo.store.sqlite.prepare("SELECT count(*) AS n FROM jobs WHERE kind='kick.reply'").get()).toEqual({ n: 1 });
    bot.automation.recoverTimers(999000); bot.automation.timers(999001);
    expect(repo.store.sqlite.prepare("SELECT count(*) AS n FROM jobs WHERE kind='kick.reply'").get()).toEqual({ n: 1 });
    expect(JSON.parse(repo.setting(`timer:${timer.id}`)!).next).toBeGreaterThan(999001);
  });
  it("rejects conflicting command aliases and stale edits", async () => {
    const { bot, owner } = await setup();
    const doc = bot.state.save(owner, "command", undefined, { name: "First", trigger: "!first", aliases: ["!alias"], responses: ["Hi"] });
    expect(() => bot.state.save(owner, "command", undefined, { name: "Second", trigger: "!alias", responses: ["Hi"] })).toThrow("command_trigger_conflict");
    expect(() => bot.state.save(owner, "command", doc.id, doc.data, 99)).toThrow("configuration_changed_reload");
  });
  it("validates a request, races approvals, and advances once with one active player", async () => {
    const { bot, owner } = await setup();
    bot.state.save(owner, "settings", "instance", { mediaEnabled: true, requestCooldown: 0 });
    const first = bot.media.request("https://youtu.be/abcdefghijk", "456", "first");
    await bot.media.validate(first.id, false); const pending = bot.media.item(first.id)!;
    expect(pending.status).toBe("pending"); bot.media.decide(owner, first.id, pending.version, "approve");
    expect(() => bot.media.decide(owner, first.id, pending.version, "approve")).toThrow("media_changed_reload");
    const second = bot.media.request("lmnopqrstuv", "789", "second"); await bot.media.validate(second.id, true);
    bot.media.control(owner, "resume", bot.media.player.version);
    const lease = bot.media.lease("credential-one");
    expect(() => bot.media.lease("credential-two")).toThrow("another_player_is_active");
    const version = bot.media.player.version;
    bot.media.acknowledge("credential-one", lease.lease!, first.id, version, "ended");
    expect(bot.media.player.current).toBe(second.id);
    expect(() => bot.media.acknowledge("credential-one", lease.lease!, first.id, version, "ended")).toThrow("stale_player_acknowledgement");
    bot.media.recover(); expect(bot.media.player.current).toBe(second.id); expect(bot.media.player.state).toBe("paused");
    bot.media.control(owner, "resume", bot.media.player.version); const nextLease = bot.media.lease("credential-one");
    bot.media.acknowledge("credential-one", nextLease.lease!, second.id, bot.media.player.version, "error", "150");
    expect(bot.media.player.current).toBe(second.id); expect(bot.media.player.state).toBe("paused");
  });
  it("rejects invalid duration and non-YouTube origins without inventing metadata", async () => {
    const { bot, owner } = await setup();
    expect(() => videoId("https://youtube.com.evil.example/watch?v=abcdefghijk")).toThrow("invalid_youtube_url");
    bot.state.save(owner, "settings", "instance", { mediaEnabled: true, maxDuration: 60 });
    const item = bot.media.request("abcdefghijk", "456"); await bot.media.validate(item.id, false);
    expect(bot.media.item(item.id)?.error).toBe("video_duration_rejected");
  });
  it("records missing keys, quota rejection and embedding restrictions using isolated official metadata responses", async () => {
    const { repo, config, owner } = await setup();
    const bot = new BotService(repo, { ...config, mode: "live" });
    bot.state.save(owner, "settings", "instance", { mediaEnabled: true, requestCooldown: 0 });
    let item = bot.media.request("abcdefghijk", "456");
    await bot.media.validate(item.id, false, async () => { throw new Error("Missing key must not make a request"); });
    expect(bot.media.item(item.id)?.error).toBe("youtube_key_missing");
    bot.state.saveSecret(owner, "youtube", { key: randomBytes(24).toString("base64url") });
    item = bot.media.request("abcdefghijk", "456");
    await bot.media.validate(item.id, false, async url => { expect(new URL(String(url)).origin).toBe("https://www.googleapis.com"); return new Response("{}", { status: 403 }); });
    expect(bot.media.item(item.id)?.error).toBe("youtube_quota_or_key_rejected");
    item = bot.media.request("abcdefghijk", "456");
    await bot.media.validate(item.id, false, async () => Response.json({ items: [{ snippet: { title: "Test", channelTitle: "Fixture creator" }, contentDetails: { duration: "PT3M" }, status: { embeddable: false, privacyStatus: "public" } }] }));
    expect(bot.media.item(item.id)?.error).toBe("youtube_embedding_disabled");
  });
  it("preserves ledger integrity under repeated accrual, overspending and duplicate refunds", async () => {
    const { bot, owner, repo } = await setup();
    bot.state.save(owner, "settings", "instance", { pointsEnabled: true, pointsAmount: 10, pointsInterval: 60 });
    repo.set("stream_is_live", "true"); repo.store.sqlite.prepare("INSERT INTO viewers(id,name,role,last_seen) VALUES('456','Viewer','viewer',?)").run(Date.now());
    bot.engagement.accrue(); bot.engagement.accrue(); expect(bot.engagement.balance("456")).toBe(10);
    const reward = bot.state.save(owner, "reward", undefined, { name: "Reward", cost: 10 });
    bot.engagement.redeem("456", reward.id, "redeem-one");
    expect(() => bot.engagement.redeem("456", reward.id, "redeem-two")).toThrow("insufficient_points");
    bot.engagement.fulfill(owner, "redeem-one", "reject");
    expect(() => bot.engagement.fulfill(owner, "redeem-one", "reject")).toThrow("redemption_already_decided");
    expect(bot.engagement.balance("456")).toBe(10);
    repo.set("stream_is_live", "false"); bot.engagement.accrue(Date.now() + 120000); expect(bot.engagement.balance("456")).toBe(10);
  });
  it("stores one vote and raffle entry per identity; closed draws are audited", async () => {
    const { bot, owner, repo } = await setup();
    const poll = bot.state.save(owner, "poll", undefined, { name: "Poll", options: ["A", "B"], endsAt: Date.now() + 60000 });
    bot.engagement.vote(poll.id, "456", 1); bot.engagement.vote(poll.id, "456", 1);
    expect(() => bot.engagement.vote(poll.id, "456", 2)).toThrow("vote_already_cast");
    const raffle = bot.state.save(owner, "raffle", undefined, { name: "Raffle", endsAt: Date.now() + 60000 });
    bot.engagement.enter(raffle.id, "456", "viewer"); bot.engagement.enter(raffle.id, "456", "viewer");
    bot.engagement.close(owner, raffle.id); expect(bot.engagement.draw(owner, raffle.id).winner).toBe("456");
    expect(() => bot.engagement.draw(owner, raffle.id)).toThrow("close_raffle_before_draw");
    expect(repo.store.sqlite.prepare("SELECT count(*) AS n FROM participation WHERE activity=?").get(raffle.id)).toEqual({ n: 1 });
  });
  it("separates widget/player credentials, revokes immediately and protects assets in use", async () => {
    const { bot, owner } = await setup();
    const widget = bot.state.save(owner, "widget", undefined, { name: "Source", type: "chat" });
    const token = bot.presentation.issueToken(owner, "OBS", "widget", [`widget:${widget.id}`]);
    expect(() => bot.presentation.token(token.token, "player", `widget:${widget.id}`)).toThrow("invalid_or_revoked_access_token");
    bot.presentation.revoke(owner, token.id); expect(() => bot.presentation.token(token.token, "widget", `widget:${widget.id}`)).toThrow("invalid_or_revoked_access_token");
    expect(() => bot.presentation.upload(owner, "unsafe.svg", Buffer.from("<svg onload=alert(1)></svg>").toString("base64"))).toThrow("unsupported_asset_format");
    const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), Buffer.alloc(32)]);
    const asset = bot.presentation.upload(owner, "fixture.png", png.toString("base64"));
    bot.state.save(owner, "alert", undefined, { name: "Follow", event: "channel.followed", template: "Hi {user}", image: asset.id });
    expect(() => bot.presentation.deleteAsset(owner, asset.id)).toThrow("asset_in_use");
  });
  it("keeps previews out of history and makes goal increments idempotent", async () => {
    const { bot, owner, repo } = await setup();
    bot.state.save(owner, "alert", undefined, { name: "Follow", event: "channel.followed", template: "Hi {user}" });
    bot.presentation.alert("channel.followed", { user: "Preview" }, "preview", true);
    expect(repo.setting("alert_queue")).toBeUndefined();
    const goal = bot.state.save(owner, "goal", undefined, { name: "Goal", metric: "follow", target: 1 });
    bot.presentation.goal("follow", 1, "receipt"); bot.presentation.goal("follow", 1, "receipt");
    expect(bot.state.document(goal.id)?.data.value).toBe(1);
  });
  it("evaluates moderation without effects and requires irreversible acknowledgement", async () => {
    const { bot, owner, repo } = await setup();
    const rule = configSchemas.rule.parse({ name: "Link", type: "link", allowedDomains: ["kick.com"] });
    expect(evaluateRule(rule, "https://kick.com/channel", "viewer", [])).toBe(false);
    expect(evaluateRule(rule, "https://evil.example", "viewer", [])).toBe(true);
    expect(evaluateRule(rule, "https://evil.example", "moderator", [])).toBe(false);
    bot.moderation.test(rule, "https://evil.example", "viewer"); expect(repo.store.sqlite.prepare("SELECT count(*) AS n FROM jobs").get()).toEqual({ n: 0 });
    expect(() => bot.moderation.manual(owner, { action: "ban", userId: 456, reason: "fixture" })).toThrow("operator_acknowledgement_required");
  });
  it("previews imports, excludes secrets and rolls back an invalid replacement", async () => {
    const { bot, owner } = await setup();
    bot.state.save(owner, "command", "hello", { name: "Hello", trigger: "!hello", responses: ["Hi"] });
    const exported = bot.operations.exportConfig(owner);
    expect(JSON.stringify(exported)).not.toContain("password");
    expect(bot.operations.importConfig(owner, exported, "merge")).toMatchObject({ preview: true, create: 0 });
    const bad = { ...exported, documents: [...exported.documents, { id: "bad", kind: "command", data: { name: "Bad", trigger: "!hello", responses: ["Conflict"] } }] };
    expect(() => bot.operations.importConfig(owner, bad, "replace")).toThrow("command_trigger_conflict");
    expect(() => bot.operations.importConfig(owner, bad, "replace", true)).toThrow("command_trigger_conflict");
    expect(bot.state.document("hello")).toBeTruthy(); expect(bot.state.document("bad")).toBeUndefined();
    expect(csv([{ value: "=formula()", text: 'quoted "value"' }])).toContain("'=formula()");
  });
  it("keeps command/timer previews pure and moderator notes private", async () => {
    const { bot, owner, repo, auth } = await setup();
    const before = repo.store.sqlite.prepare("SELECT count(*) AS n FROM jobs").get();
    expect(bot.automation.preview(owner, "command", { name: "Preview", trigger: "!preview", responses: ["Hi {user} #{counter}"] }).responses).toEqual(["Hi Preview viewer #1"]);
    expect(bot.automation.preview(owner, "timer", { name: "Timer", messages: ["{channel}"], interval: 60 }).preview).toBe(true);
    expect(repo.store.sqlite.prepare("SELECT count(*) AS n FROM jobs").get()).toEqual(before);
    const invite = auth.invite(owner, "readonly"), login = await auth.acceptInvite(invite.token, { username: "reader", password: "a readonly fixture password" });
    const reader = auth.session(login.token);
    bot.state.save(owner, "note", undefined, { name: "Case", viewer: "456", text: "Protected moderator note" });
    expect(bot.state.snapshot(reader).documents.some(doc => doc.kind === "note")).toBe(false);
    expect(bot.state.snapshot(owner).documents.some(doc => doc.kind === "note")).toBe(true);
  });
  it("ports image assets with configuration and remaps their references on another installation", async () => {
    const source = await setup(), target = await setup();
    const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), Buffer.alloc(32)]);
    const asset = source.bot.presentation.upload(source.owner, "community.png", png.toString("base64"));
    source.bot.state.save(source.owner, "alert", "portable-alert", { name: "Portable", event: "manual", template: "Hello", image: asset.id });
    const bundle = source.bot.operations.exportConfig(source.owner);
    expect(target.bot.operations.importConfig(target.owner, bundle, "merge").assets[0].resolution).toBe("upload_and_remap");
    target.bot.operations.importConfig(target.owner, bundle, "merge", true);
    const reference = target.bot.state.document("portable-alert")!.data.image as string;
    expect(reference).not.toBe(asset.id);
    expect(target.bot.presentation.asset(reference).bytes.equals(png)).toBe(true);
  });
  it("reports viewer sample means and worker gaps, and rejects stale stream transitions", async () => {
    const { bot, owner, repo } = await setup();
    bot.state.save(owner, "widget", "status", { name: "Status", type: "status" });
    expect((bot.presentation.widget("status").data as { viewers: number | null }).viewers).toBeNull();
    repo.set("stream_sample", JSON.stringify({ viewers: 12, at: Date.now() }));
    expect((bot.presentation.widget("status").data as { viewers: number | null }).viewers).toBe(12);
    bot.state.observe("sample:1", "viewers.sample", 10); bot.state.observe("sample:2", "viewers.sample", 20);
    const result = bot.operations.analytics(Date.now() - 600000, Date.now());
    expect(result.rows).toEqual(expect.arrayContaining([expect.objectContaining({ metric: "viewers.sample", value: 15, samples: 2 })]));
    expect(result.coverage.gaps.length).toBeGreaterThan(0);
    const event = (id: string, live: boolean, timestamp: number) => { repo.acceptReceipt(id, "livestream.status.updated", { is_live: live, started_at: new Date().toISOString(), _provider_sent_at: timestamp }); bot.event(repo.claim()!); };
    event("stream:new", true, 2000); event("stream:stale", false, 1000);
    expect(repo.setting("stream_is_live")).toBe("true");
  });
  it("honours temporary rule windows and rolls back unreviewed bulk actions", async () => {
    const { bot, owner, repo } = await setup();
    const rule = configSchemas.rule.parse({ name: "Temporary", type: "phrase", patterns: ["blocked"], startsAt: Date.now() + 60000 });
    expect(evaluateRule(rule, "blocked", "viewer", [])).toBe(false);
    expect(evaluateRule({ ...rule, startsAt: null, endsAt: Date.now() - 1 }, "blocked", "viewer", [])).toBe(false);
    await expect(bot.action(owner, "moderation.bulk", { targets: [456,789], operation: "ban", reason: "fixture" }, "bulk")).rejects.toThrow("operator_acknowledgement_required");
    expect(repo.store.sqlite.prepare("SELECT count(*) AS n FROM jobs").get()).toEqual({ n: 0 });
    await bot.action(owner, "moderation.bulk", { targets: [456,789], operation: "warn", reason: "fixture", acknowledge: true }, "reviewed");
    expect(repo.store.sqlite.prepare("SELECT count(*) AS n FROM jobs WHERE kind='kick.action'").get()).toEqual({ n: 2 });
  });
  it("distinguishes Discord rate limits from uncertain sends without live requests", async () => {
    const { repo, config } = await setup();
    const bot = new BotService(repo, { ...config, mode: "live" });
    const rateLimited = new DiscordService(bot.state, async () => new Response("", { status: 429, headers: { "retry-after": "2" } }));
    await expect(rateLimited.http("/channels/100/messages", { method: "POST" })).rejects.toMatchObject({ code: "discord_rate_limited", outcome: "retry", retryAfterMs: 2000 });
    const uncertain = new DiscordService(bot.state, async () => { throw new Error("fixture network loss"); });
    await expect(uncertain.http("/channels/100/messages", { method: "POST" })).rejects.toMatchObject({ code: "discord_network_error", outcome: "uncertain" });
  });
  it("validates Discord signatures, isolates guilds and commits one deferred job", async () => {
    const { bot, owner, repo } = await setup();
    bot.state.save(owner, "guild", undefined, { name: "Guild", guildId: "100", channelId: "200", roles: [{ id: "300", permission: "media" }] });
    const keys = generateKeyPairSync("ed25519"), publicKey = keys.publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex");
    const credentials = { applicationId: "900", publicKey, botToken: "fixture-only" };
    const discord = new DiscordService(bot.state);
    const payload = { id: "500", application_id: "900", type: 2, token: "fixture-interaction", guild_id: "100", channel_id: "200", member: { user: { id: "400" }, roles: ["300"] }, data: { name: "kekbot", options: [{ name: "action", value: "status" }] } };
    const body = Buffer.from(JSON.stringify(payload)), timestamp = String(Math.floor(Date.now() / 1000));
    const headers = new Headers({ "x-signature-timestamp": timestamp, "x-signature-ed25519": sign(null, Buffer.concat([Buffer.from(timestamp), body]), keys.privateKey).toString("hex") });
    expect(discord.intake(body, headers, credentials)).toMatchObject({ type: 5 });
    discord.intake(body, headers, credentials);
    expect(repo.store.sqlite.prepare("SELECT count(*) AS n FROM jobs WHERE kind='discord.interaction'").get()).toEqual({ n: 1 });
    expect(() => discord.intake(Buffer.from(body.toString().replace("status", "forged")), headers, credentials)).toThrow("invalid_discord_signature");
    expect(() => discord.actor({ ...payload, guild_id: "999" })).toThrow("discord_guild_or_channel_not_allowed");
    const actor = discord.actor(payload);
    expect(() => bot.state.assertActor(actor, "moderate")).toThrow("discord_permission_denied");
    expect(() => bot.state.assertActor(actor, "media")).not.toThrow();
    const guild = bot.state.list("guild")[0]; bot.state.remove(owner, guild.id, guild.version);
    expect(() => bot.state.assertActor(actor, "media")).toThrow("discord_permission_denied");
    expect((repo.store.sqlite.prepare("SELECT payload FROM jobs WHERE id='discord:500'").get() as { payload: string }).payload).not.toContain("fixture-interaction");
  });
  it("enforces disabled accounts and API scope revocation in queued effects", async () => {
    const { bot, owner, auth } = await setup();
    const token = bot.presentation.issueToken(owner, "Integration", "api", ["media"]);
    const apiActor: Actor = { ...owner, capabilityId: token.id };
    expect(() => bot.state.assertActor(apiActor, "moderate")).toThrow("api_permission_revoked");
    bot.presentation.revoke(owner, token.id); expect(() => bot.state.assertActor(apiActor, "media")).toThrow("api_permission_revoked");
    const invite = auth.invite(owner, "moderator"), session = await auth.acceptInvite(invite.token, { username: "moderator", password: "a moderator test password" });
    const mod = auth.session(session.token); auth.disable(owner, mod.id, true);
    expect(() => bot.state.assertActor(mod, "media")).toThrow("account_disabled_or_removed");
  });
});
