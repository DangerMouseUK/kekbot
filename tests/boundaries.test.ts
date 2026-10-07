import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { rmSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authorize, type Actor, type Permission } from "../src/server/auth.ts";
import { boundedBody } from "../src/server/body.ts";
import { encrypt } from "../src/server/crypto.ts";
import { DeliveryError } from "../src/server/errors.ts";
import { seedFixture } from "../src/server/fixture-seed.ts";
import { BotService } from "../src/server/domain/bot.ts";
import { configSchemas } from "../src/server/domain/catalog.ts";
import { evaluateRule } from "../src/server/domain/moderation.ts";
import { DiscordService } from "../src/server/providers/discord.ts";
import { KickService } from "../src/server/providers/kick.ts";
import { Runtime } from "../src/server/runtime.ts";
import { environment, repository } from "./helpers.ts";

const cleanup: (() => void)[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const fn of cleanup.splice(0).reverse()) fn(); });
async function setup() {
  const context = environment(); cleanup.push(() => rmSync(context.root, { recursive: true, force: true }));
  await seedFixture(context.config); const repo = repository(context.config); cleanup.push(() => repo.store.close());
  const account = repo.store.sqlite.prepare("SELECT id,role FROM accounts WHERE role='owner'").get() as { id: string; role: "owner" };
  return { ...context, repo, bot: new BotService(repo, context.config), owner: { ...account, permissions: [] } as Actor };
}
const keys = generateKeyPairSync("ed25519");
const credentials = { applicationId: "900", publicKey: keys.publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("hex"), botToken: "synthetic-only" };
function signed(input: unknown, timestamp = String(Math.floor(Date.now() / 1000))) {
  const body = Buffer.from(typeof input === "string" ? input : JSON.stringify(input));
  return { body, headers: new Headers({ "x-signature-timestamp": timestamp, "x-signature-ed25519": sign(null, Buffer.concat([Buffer.from(timestamp), body]), keys.privateKey).toString("hex") }) };
}
const interaction = { id: "700", application_id: "900", type: 2, token: "synthetic-interaction", guild_id: "100", channel_id: "200", member: { user: { id: "400" }, roles: ["300"] }, data: { name: "kekbot", options: [{ name: "action", value: "timers.pause" }] } };
function guild(bot: BotService, owner: Actor) { return bot.state.save(owner, "guild", "boundary-guild", { name: "Allowed guild", guildId: "100", channelId: "200", events: ["live"], roles: [{ id: "300", permission: "operate" }] }); }

describe("assembled provider and authority boundaries", () => {
  it("accepts signed Discord PING and rejects mismatched app/guild/channel, expired/future signatures and malformed input", async () => {
    const { bot, owner, repo } = await setup(); guild(bot, owner); const discord = new DiscordService(bot.state);
    const ping = signed({ id: "701", application_id: "900", type: 1, token: "synthetic" });
    expect(discord.intake(ping.body, ping.headers, credentials)).toEqual({ type: 1 });
    for (const [patch, code] of [[{ application_id: "999" }, "wrong_discord_application"], [{ guild_id: "999" }, "discord_guild_or_channel_not_allowed"], [{ channel_id: "999" }, "discord_guild_or_channel_not_allowed"]] as const) {
      const payload = signed({ ...interaction, ...patch }); expect(() => discord.intake(payload.body, payload.headers, credentials)).toThrow(code);
    }
    for (const offset of [-301000, 301000]) { const payload = signed(interaction, String(Math.floor((Date.now() + offset) / 1000))); expect(() => discord.intake(payload.body, payload.headers, credentials)).toThrow("invalid_discord_signature"); }
    const invalid = signed("{bad-json"); expect(() => discord.intake(invalid.body, invalid.headers, credentials)).toThrow("invalid_discord_json");
    expect(repo.store.sqlite.prepare("SELECT count(*) AS n FROM receipts").get()).toEqual({ n: 0 });
  });

  it("bounds declared and streamed request bodies without buffering oversized input", async () => {
    await expect(boundedBody(new Request("https://kekbot.example", { method: "POST", headers: { "content-length": "65537" }, body: "x" }))).rejects.toMatchObject({ code: "request_too_large", status: 413 });
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(Buffer.alloc(32768)); controller.enqueue(Buffer.alloc(32769)); }, cancel() { cancelled = true; } });
    await expect(boundedBody({ headers: new Headers(), body })).rejects.toMatchObject({ status: 413 }); expect(cancelled).toBe(true);
  });

  it("does not repeat a Discord action when the deferred response is rate limited", async () => {
    const { repo, config, owner } = await setup(), bot = new BotService(repo, { ...config, mode: "live" }); guild(bot, owner);
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("", { status: 429, headers: { "retry-after": "1" } })).mockResolvedValueOnce(new Response("{}"));
    const discord = new DiscordService(bot.state, request), payload = signed(interaction);
    discord.intake(payload.body, payload.headers, credentials); const job = repo.claim()!;
    const action = vi.fn((actor: Actor, name: string, input: Record<string, unknown>, id: string) => bot.action(actor, name, input, id));
    await expect(discord.execute(job, action)).rejects.toMatchObject({ outcome: "retry" });
    await discord.execute(job, action);
    expect(action).toHaveBeenCalledTimes(1); expect(request).toHaveBeenCalledTimes(2);
    expect(bot.state.settings.timersPaused).toBe(true);
    expect(String(request.mock.calls[1][1]?.body)).toContain('"parse":[]');
    expect(request.mock.calls[1][1]?.redirect).toBe("error");
  });

  it("rejects expired interactions and revoked guild authority before performing an action", async () => {
    const { bot, repo, owner, config } = await setup(), mapping = guild(bot, owner), discord = new DiscordService(bot.state), payload = signed(interaction);
    discord.intake(payload.body, payload.headers, credentials); const job = repo.claim()!, action = vi.fn();
    bot.state.remove(owner, mapping.id, mapping.version);
    await expect(discord.execute(job, action)).rejects.toThrow("discord_guild_or_channel_not_allowed"); expect(action).not.toHaveBeenCalled();
    const encrypted = encrypt(JSON.stringify({ interaction, expires: Date.now() - 1 }), config.key, "discord.interaction");
    await expect(discord.execute({ ...job, payload: JSON.stringify({ encrypted }) }, action)).rejects.toThrow("discord_interaction_expired");
    expect(action).not.toHaveBeenCalled();
  });

  it("ordinary Discord members receive a denial without effects", async () => {
    const { bot, repo, owner } = await setup(); guild(bot, owner); const discord = new DiscordService(bot.state);
    const payload = signed({ ...interaction, member: { ...interaction.member, roles: [] } }); discord.intake(payload.body, payload.headers, credentials);
    await discord.execute(repo.claim()!, (actor, name, input, id) => bot.action(actor, name, input, id));
    expect(repo.setting("discord_result:700")).toBe("discord_permission_denied"); expect(bot.state.settings.timersPaused).toBe(false);
  });

  it("routes notifications only to configured events and cancels queued sends after route removal", async () => {
    const { bot, repo, owner } = await setup(), mapping = guild(bot, owner);
    bot.state.save(owner, "guild", "second-guild", { name: "Second", guildId: "101", channelId: "201", events: ["offline"] });
    bot.state.notify("live", "Synthetic live event", "live-once"); bot.state.notify("live", "Synthetic live event", "live-once");
    expect(repo.store.sqlite.prepare("SELECT count(*) AS n FROM jobs WHERE kind='discord.send'").get()).toEqual({ n: 1 });
    const job = repo.claim()!; bot.state.remove(owner, mapping.id, mapping.version);
    await expect(new DiscordService(bot.state).send(JSON.parse(job.payload))).rejects.toThrow("discord_route_revoked");
    expect(repo.setting("fixture_discord_last_send")).toBeUndefined();
  });

  it("enforces the complete role permission matrix, including owner-only operations", () => {
    const all: Permission[] = ["configure", "operate", "moderate", "media", "engage", "invite", "accounts", "maintenance", "integrations", "tokens"];
    for (const role of ["owner", "admin", "moderator", "readonly"] as const) for (const permission of all) {
      const actor: Actor = { id: "synthetic", role, permissions: ["configure", "operate", "media"] };
      const allowed = role === "owner" || role === "admin" && actor.permissions.includes(permission) || role === "moderator" && ["operate", "moderate", "media", "engage"].includes(permission);
      if (allowed) expect(() => authorize(actor, permission)).not.toThrow(); else expect(() => authorize(actor, permission)).toThrow();
    }
  });

  it("fixtures cannot perform provider mutations or store live integration credentials", async () => {
    const { bot, repo, config, owner } = await setup(), request = vi.fn<typeof fetch>();
    await expect(new KickService(config, repo, request).reply()).rejects.toThrow("live_actions_disabled_in_fixture_mode");
    await expect(new DiscordService(bot.state, request).http("/channels/100/messages", { method: "POST" })).rejects.toThrow("live_actions_disabled_in_fixture_mode");
    expect(() => bot.state.saveSecret(owner, "youtube", { key: randomBytes(24).toString("base64url") })).toThrow("fixture_mode_rejects_live_credentials");
    expect(request).not.toHaveBeenCalled();
  });

  it("caps alert backlog, preserves literal text and clears expired player authority without advancing", async () => {
    const { bot, owner, repo } = await setup(); bot.state.save(owner, "alert", "bounded-alert", { name: "Bounded", event: "manual", template: "{text}" });
    for (let index = 0; index < 70; index++) bot.presentation.alert("manual", { text: "<script>synthetic()</script>" }, `synthetic:${index}`);
    const queue = JSON.parse(repo.setting("alert_queue")!); expect(queue.length).toBeLessThanOrEqual(50); expect(queue.at(-1).text).toContain("<script>");
    const settings = bot.state.document("instance")!; bot.state.save(owner, "settings", "instance", { ...settings.data, mediaEnabled: true, requestCooldown: 0 }, settings.version);
    const item = bot.media.request("abcdefghijk", "456"); await bot.media.validate(item.id, true); bot.media.control(owner, "resume", bot.media.player.version);
    const lease = bot.media.lease("synthetic-player"); bot.media.expireLease(lease.until + 1);
    expect(bot.media.player.current).toBe(item.id); expect(bot.media.player.state).toBe("paused");
    expect(() => bot.media.acknowledge("synthetic-player", lease.lease, item.id, bot.media.player.version, "ended")).toThrow("stale_player_acknowledgement");
  });

  it("rejects late participation and records distinct audited raffle rerolls", async () => {
    const { bot, owner, repo } = await setup();
    const poll = bot.state.save(owner, "poll", "expired-poll", { name: "Ended", options: ["A", "B"], endsAt: Date.now() - 1 });
    expect(() => bot.engagement.vote(poll.id, "456", 1)).toThrow("poll_closed");
    const raffle = bot.state.save(owner, "raffle", "reroll", { name: "Raffle", endsAt: Date.now() + 60000 });
    for (const id of ["456", "789", "999"]) bot.engagement.enter(raffle.id, id, "viewer");
    bot.engagement.close(owner, raffle.id); const one = bot.engagement.draw(owner, raffle.id), two = bot.engagement.draw(owner, raffle.id, true), three = bot.engagement.draw(owner, raffle.id, true);
    expect(new Set([one.winner, two.winner, three.winner]).size).toBe(3);
    expect(() => bot.engagement.draw(owner, raffle.id, true)).toThrow("no_eligible_entries");
    expect(repo.store.sqlite.prepare("SELECT count(*) AS n FROM audit WHERE action='raffle.reroll'").get()).toEqual({ n: 2 });
  });

  it("redacts secret material and private history from support/configuration exports", async () => {
    const { bot, owner, repo } = await setup();
    const token = bot.presentation.issueToken(owner, "Synthetic API", "api", ["read"]);
    bot.state.save(owner, "note", "private-note", { name: "Private", viewer: "456", text: "private synthetic moderator history" });
    repo.set("private_sentinel", randomBytes(32).toString("base64url"));
    const exported = JSON.stringify([bot.operations.exportConfig(owner), bot.operations.support(owner)]);
    for (const forbidden of [token.token, bot.state.config.key.toString("hex"), bot.state.config.proofToken, "private synthetic moderator history", repo.setting("private_sentinel")!]) expect(exported).not.toContain(forbidden);
  });

  it("bounds rate-limit retries and never automatically retries uncertain delivery", async () => {
    const { config } = await setup();
    const runtime = new Runtime(config); cleanup.push(() => runtime.repository.store.close());
    vi.spyOn(runtime.kick, "reply").mockRejectedValue(new DeliveryError("kick_rate_limited", "retry", 1));
    // Live mode with an injected provider avoids fixture short-circuiting and all real I/O.
    Object.assign(runtime.config, { mode: "live" });
    runtime.repository.enqueue("bounded-retry", "kick.reply", {}, 0);
    for (let attempt = 0; attempt < 5; attempt++) { const job = runtime.repository.claim(Date.now() + 60000)!; await runtime.execute(job); }
    expect(runtime.repository.store.sqlite.prepare("SELECT status,attempts FROM jobs WHERE id='bounded-retry'").get()).toEqual({ status: "failed", attempts: 5 });
    expect(runtime.repository.claim(Date.now() + 60000)).toBeUndefined();
    vi.mocked(runtime.kick.reply).mockRejectedValue(new DeliveryError("kick_network_error", "uncertain"));
    runtime.repository.enqueue("uncertain-send", "kick.reply", {}, 0);
    await runtime.execute(runtime.repository.claim()!);
    expect(runtime.repository.store.sqlite.prepare("SELECT status FROM jobs WHERE id='uncertain-send'").get()).toEqual({ status: "uncertain" });
    expect(runtime.repository.claim(Date.now() + 60000)).toBeUndefined();
  });
});

describe("moderation false-positive boundaries", () => {
  it.each([
    ["https://kick.com/creator", false], ["https://sub.kick.com/path", false], ["https://kick.com.evil.example/path", true], ["https://evil.example", true], ["ordinary chat without a link", false], ["kick.com", false]
  ])("classifies allowed domain boundaries: %s", (content, matched) => {
    const rule = configSchemas.rule.parse({ name: "Domain policy", type: "link", allowedDomains: ["kick.com"] });
    expect(evaluateRule(rule, String(content), "viewer", [])).toBe(matched);
    expect(evaluateRule(rule, String(content), "moderator", [])).toBe(false);
  });
  it("ignores expired repetition/burst history and small uppercase messages", () => {
    const now = Date.now(), history = [{ text: "repeat", at: now - 31000 }];
    for (const type of ["repetition", "burst"] as const) expect(evaluateRule(configSchemas.rule.parse({ name: type, type, threshold: 2, windowSeconds: 30 }), "repeat", "viewer", history, now)).toBe(false);
    expect(evaluateRule(configSchemas.rule.parse({ name: "Caps", type: "caps", threshold: 80 }), "HELLO!", "viewer", [])).toBe(false);
  });
});
