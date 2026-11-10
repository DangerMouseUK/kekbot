import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "../src/server/auth.ts";
import { encrypt } from "../src/server/crypto.ts";
import { BotService } from "../src/server/domain/bot.ts";
import { seedFixture } from "../src/server/fixture-seed.ts";
import { commandPaths, commandTree } from "../src/server/providers/discord-commands.ts";
import { DiscordService } from "../src/server/providers/discord.ts";
import { customId, describeError, knownErrorCodes, parseCustomId, type Message } from "../src/server/providers/discord-format.ts";
import type { Job } from "../src/server/storage/repository.ts";
import { environment, repository } from "./helpers.ts";

// Synthetic identities only: guild 100, channel 200, roles 300 (media) / 301 (engage) / 302 (moderate) / 303 (operate).
const cleanup: (() => void)[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const fn of cleanup.splice(0).reverse()) fn(); });
const keys = generateKeyPairSync("ed25519");
const credentials = { applicationId: "900", publicKey: keys.publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("hex"), botToken: "synthetic-only" };
const allRoles = ["300", "301", "302", "303"];

async function setup(mode: "fixture" | "live" = "fixture") {
  const context = environment(); cleanup.push(() => rmSync(context.root, { recursive: true, force: true }));
  await seedFixture(context.config); const repo = repository(context.config); cleanup.push(() => repo.store.close());
  const account = repo.store.sqlite.prepare("SELECT id FROM accounts WHERE role='owner'").get() as { id: string };
  const owner: Actor = { id: account.id, role: "owner", permissions: [] };
  const bot = new BotService(repo, { ...context.config, mode });
  bot.state.save(owner, "guild", "route", { name: "Synthetic guild", guildId: "100", channelId: "200", events: ["media", "engagement"], roles: [{ id: "300", permission: "media" }, { id: "301", permission: "engage" }, { id: "302", permission: "moderate" }, { id: "303", permission: "operate" }] });
  return { ...context, repo, bot, owner };
}
function signed(input: unknown) {
  const timestamp = String(Math.floor(Date.now() / 1000)), body = Buffer.from(JSON.stringify(input));
  return { body, headers: new Headers({ "x-signature-timestamp": timestamp, "x-signature-ed25519": sign(null, Buffer.concat([Buffer.from(timestamp), body]), keys.privateKey).toString("hex") }) };
}
type Value = string | number | boolean;
const typeOf = (value: Value) => (typeof value === "string" ? 3 : typeof value === "number" ? 4 : 5);
let sequence = 1000;
function command(path: string[], values: Record<string, Value> = {}, { roles = allRoles, focused }: { roles?: string[]; focused?: string } = {}) {
  const leaf = Object.entries(values).map(([name, value]) => ({ name, type: typeOf(value), value, ...(name === focused ? { focused: true } : {}) }));
  const sub = { type: 1, name: path.at(-1)!, ...(leaf.length ? { options: leaf } : {}) };
  const options = path.length === 2 ? [{ type: 2, name: path[0], options: [sub] }] : [sub];
  return { id: String(sequence++), application_id: "900", type: focused ? 4 : 2, token: "synthetic-interaction", guild_id: "100", channel_id: "200", member: { user: { id: "400" }, roles }, data: { name: "kekbot", options } };
}
function click(custom: string, roles = allRoles) {
  return { id: String(sequence++), application_id: "900", type: 3, token: "synthetic-interaction", guild_id: "100", channel_id: "200", member: { user: { id: "400" }, roles }, message: { id: "800" }, data: { custom_id: custom, component_type: 2 } };
}
async function run(discord: DiscordService, bot: BotService, interaction: { id: string }) {
  const payload = signed(interaction);
  expect(discord.intake(payload.body, payload.headers, credentials)).toEqual({ type: 5, data: { flags: 64 } });
  const job = bot.state.db.prepare("SELECT * FROM jobs WHERE id=?").get(`discord:${interaction.id}`) as Job & { kind: string };
  expect(job.kind).toBe("discord.interaction");
  await discord.execute(job, (actor, name, input, id) => bot.action(actor, name, input, id));
  return JSON.parse(bot.state.repository.setting(`discord_result:${interaction.id}`)!) as { reply: Message; update?: unknown[] };
}
function suggest(discord: DiscordService, interaction: unknown) {
  const payload = signed(interaction);
  return discord.intake(payload.body, payload.headers, credentials) as { type: number; data: { choices: { name: string; value: string }[] } };
}
function addMedia(bot: BotService, id: string, position: number, status = "pending", title = `Synthetic song ${position}`) {
  bot.state.db.prepare("INSERT INTO media(id,video_id,requester,title,uploader,duration,status,position,version,created_at) VALUES(?,?,?,?,?,?,?,?,1,?)").run(id, "abcdefghijk", "456", title, "Synthetic uploader", 215, status, position, Date.now() + position);
}
const media = (bot: BotService, id: string) => bot.state.db.prepare("SELECT status,version,position FROM media WHERE id=?").get(id) as { status: string; version: number; position: number };
const replyText = (message: Message) => JSON.stringify(message.embeds ?? message.content);

describe("Discord command tree", () => {
  it("publishes grouped subcommands within Discord's limits and only for enabled modules", () => {
    const [tree] = commandTree({ media: true, points: true });
    let characters = 0;
    const walk = (options: Record<string, unknown>[], depth: number) => {
      expect(options.length).toBeLessThanOrEqual(25);
      let optional = false;
      for (const option of options) {
        const { name, description, type, required, choices, autocomplete, max_length } = option as { name: string; description: string; type: number; required?: boolean; choices?: { name: string; value: string }[]; autocomplete?: boolean; max_length?: number };
        expect(name).toMatch(/^[-_a-z0-9]{1,32}$/); expect(description.length).toBeGreaterThan(0); expect(description.length).toBeLessThanOrEqual(100);
        characters += name.length + description.length + (choices ?? []).reduce((sum, c) => sum + c.name.length + c.value.length, 0);
        if (type === 1 || type === 2) { expect(depth).toBeLessThan(type === 2 ? 1 : 2); walk((option.options as Record<string, unknown>[]) ?? [], depth + 1); continue; }
        if (required) expect(optional).toBe(false); else optional = true;
        expect(choices && autocomplete).toBeFalsy(); expect((choices ?? []).length).toBeLessThanOrEqual(25);
        if (type === 3 && !choices) expect(max_length).toBeLessThanOrEqual(6000);
      }
    };
    characters += tree.name.length + tree.description.length; walk(tree.options, 0);
    expect(characters).toBeLessThanOrEqual(8000);
    expect(commandPaths()).toEqual(["status", "media queue", "media approve", "media reject", "media remove", "media move", "media clear", "media skip", "media pause", "media resume", "media volume", "goal list", "goal add", "goal set", "goal reset", "poll create", "poll close", "poll results", "raffle create", "raffle close", "raffle draw", "raffle reroll", "reward pending", "reward complete", "reward refund", "points", "mod warn", "mod timeout", "mod ban", "mod delete", "mod pause", "mod resume", "mod incident-start", "mod incident-stop", "timers pause", "timers resume", "alert send"]);
    const minimal = commandTree({ media: false, points: false })[0].options.map((option) => option.name);
    expect(minimal).not.toContain("media"); expect(minimal).not.toContain("reward"); expect(minimal).not.toContain("points"); expect(minimal).toContain("mod");
  });

  it("keeps button custom IDs bounded and parses only the documented format", () => {
    const id = customId("ma", "request:01J00000000000000000000009", 7)!;
    expect(id).toBe("kb1:ma:7:request:01J00000000000000000000009");
    expect(parseCustomId(id)).toEqual({ op: "ma", version: 7, id: "request:01J00000000000000000000009" });
    expect(customId("ma", "x".repeat(95), 1)).toBeUndefined();
    for (const bad of ["kb1:done", "kb1:zz:1:id", "kb1:ma:one:id", "kb1:ma:1:has space", "other"]) expect(parseCustomId(bad)).toBeUndefined();
  });

  it("explains every domain error a Discord command or button can reach in plain English", () => {
    // Intake codes are HTTP answers to Discord; the others come from local accounts, OBS or chat only.
    const unreachable = new Set(["invalid_discord_signature", "invalid_discord_json", "wrong_discord_application", "alert_asset_missing_or_wrong_type", "invalid_document_id", "command_trigger_conflict", "unknown_integration", "fixture_mode_rejects_live_credentials", "invalid_work_queue_cursor", "invalid_media_history_cursor", "another_player_is_active", "stale_player_acknowledgement", "invalid_vote", "vote_already_cast", "raffle_ineligible", "invalid_asset_size_or_encoding", "unsupported_asset_format", "asset_in_use", "asset_not_found", "invalid_api_scope", "invalid_widget_scope", "player_widget_required", "invalid_access_token", "invalid_or_revoked_access_token", "widget_not_found", "receipt_payload_missing", "password_service_busy", "setup_token_invalid_or_expired", "installation_already_claimed_or_expired", "login_rate_limited", "invalid_credentials", "login_required", "invitation_creator_unavailable", "invitation_exceeds_admin_grant", "invitation_invalid_or_expired", "username_unavailable", "cannot_disable_owner", "account_changed_retry"]);
    const files = ["domain/state.ts", "domain/media.ts", "domain/engagement.ts", "domain/moderation.ts", "domain/presentation.ts", "domain/bot.ts", "auth.ts", "providers/discord.ts", "providers/discord-commands.ts"];
    const codes = new Set(files.flatMap((file) => [...readFileSync(`src/server/${file}`, "utf8").matchAll(/AppError\("([a-z0-9_]+)"/g)].map((match) => match[1])));
    for (const kind of ["goal", "poll", "raffle"]) codes.add(`${kind}_not_found`);
    const known = new Set(knownErrorCodes());
    expect([...codes].filter((code) => !unreachable.has(code) && !known.has(code))).toEqual([]);
    expect(describeError("never_seen_code")).toContain("Share the code");
  });
});

describe("signed Discord interactions with real SQLite", () => {
  it("approves by public request number and renders readable queue, status and goal replies", async () => {
    const { bot } = await setup(), discord = new DiscordService(bot.state);
    addMedia(bot, "song-a", 41); addMedia(bot, "song-b", 42);
    const queue = await run(discord, bot, command(["media", "queue"]));
    expect(queue.reply.embeds![0].description).toContain("#41 · Synthetic song 41");
    expect(queue.reply.components!.flatMap((row) => row.components.map((b) => b.custom_id))).toContain("kb1:ma:1:song-a");
    const approved = await run(discord, bot, command(["media", "approve"], { request: "#41" }));
    expect(approved.reply.embeds![0].title).toBe("Approved #41 · Synthetic song 41"); expect(approved.update).toBeUndefined();
    expect(media(bot, "song-a").status).toBe("approved");
    expect((await run(discord, bot, command(["media", "reject"], { request: "42" }))).reply.embeds![0].title).toContain("Rejected #42");
    const again = await run(discord, bot, command(["media", "approve"], { request: "#41" }));
    expect(again.reply.embeds![0].title).toBe("This changed"); expect(replyText(again.reply)).toContain("queued");
    const missing = await run(discord, bot, command(["media", "approve"], { request: "#999" }));
    expect(missing.reply.embeds![0].footer!.text).toBe("Code: media_not_found");
    const status = await run(discord, bot, command(["status"]));
    expect(status.reply.embeds![0].title).toBe("KekBot status"); expect(replyText(status.reply)).toContain("#41 · Synthetic song 41");
    expect(replyText(status.reply)).not.toContain('\\"version\\"');
    const goal = await run(discord, bot, command(["goal", "add"], { goal: "Community goal", amount: 5 }));
    expect(goal.reply.embeds![0].title).toBe("Community goal: 5/100");
    expect((await run(discord, bot, command(["goal", "reset"], { goal: "fixture-goal" }))).reply.embeds![0].title).toBe("Community goal: 0/100");
  });

  it("moves and clears the queue, controls the player with hidden versions and keeps confirmations", async () => {
    const { bot } = await setup(), discord = new DiscordService(bot.state);
    for (const [index, id] of ["one", "two", "three"].entries()) addMedia(bot, id, index + 1, "approved");
    const moved = await run(discord, bot, command(["media", "move"], { request: "#3", position: 1 }));
    expect(moved.reply.embeds![0].title).toBe("Moved to place 1 of 3"); expect(media(bot, "three").position).toBe(1);
    expect((await run(discord, bot, command(["media", "resume"]))).reply.embeds![0].title).toBe("Player resumed");
    expect(bot.media.player.current).toBe("three");
    expect((await run(discord, bot, command(["media", "skip"]))).reply.embeds![0].description).toContain("Now playing #");
    expect((await run(discord, bot, command(["media", "volume"], { level: 35 }))).reply.embeds![0].title).toBe("Volume set to 35%");
    const refused = await run(discord, bot, command(["media", "clear"], { confirm: false }));
    expect(refused.reply.embeds![0].footer!.text).toBe("Code: operator_acknowledgement_required");
    expect((await run(discord, bot, command(["media", "clear"], { confirm: true }))).reply.embeds![0].description).toContain("Removed 1 request");
  });

  it("creates, closes and reports polls and raffles, and looks up points by viewer name", async () => {
    const { bot } = await setup(), discord = new DiscordService(bot.state);
    const created = await run(discord, bot, command(["poll", "create"], { question: "Pick a map", options: "North | South | East", minutes: 10 }));
    expect(created.reply.embeds![0].title).toBe("Poll started: Pick a map"); expect(replyText(created.reply)).toContain("!vote 3");
    const poll = bot.state.list("poll").find((doc) => doc.data.name === "Pick a map")!;
    bot.engagement.vote(poll.id, "456", 2);
    const closed = await run(discord, bot, command(["poll", "close"], { poll: "Pick a map" }));
    expect(closed.reply.embeds![1].description).toContain("South"); expect(closed.reply.embeds![1].footer!.text).toBe("1 vote · closed");
    expect((await run(discord, bot, command(["poll", "create"], { question: "Bad", options: "Only one" }))).reply.embeds![0].footer!.text).toBe("Code: invalid_poll_options");
    await run(discord, bot, command(["raffle", "create"], { name: "Prize draw" }));
    const raffle = bot.state.list("raffle").find((doc) => doc.data.name === "Prize draw")!;
    bot.engagement.enter(raffle.id, "456", "viewer");
    const raffleClosed = await run(discord, bot, command(["raffle", "close"], { raffle: "Prize draw" }));
    expect(raffleClosed.reply.components![0].components[0].custom_id).toMatch(new RegExp(`^kb1:rd:\\d+:${raffle.id}$`));
    expect((await run(discord, bot, command(["raffle", "draw"], { raffle: "Prize draw" }))).reply.embeds![0].title).toBe("Winner: Fixture viewer");
    const points = await run(discord, bot, command(["points"], { viewer: "fixture VIEWER" }));
    expect(points.reply.embeds![0].title).toBe("Fixture viewer"); expect(points.reply.embeds![0].fields![0]).toMatchObject({ name: "Points", value: "100" });
    expect((await run(discord, bot, command(["points"], { viewer: "Nobody here" }))).reply.embeds![0].footer!.text).toBe("Code: viewer_not_found");
  });

  it("queues moderation for a named viewer and supports incident mode, timers and alerts", async () => {
    const { bot, repo } = await setup(), discord = new DiscordService(bot.state);
    const timeout = await run(discord, bot, command(["mod", "timeout"], { viewer: "Fixture viewer", reason: "Synthetic spam", minutes: 15 }));
    expect(timeout.reply.embeds![0].title).toBe("15-minute timeout for Fixture viewer sent to Kick");
    const action = repo.store.sqlite.prepare("SELECT payload FROM jobs WHERE kind='kick.action'").get() as { payload: string };
    expect(JSON.parse(action.payload)).toMatchObject({ action: "timeout", userId: 456, duration: 15 });
    expect((await run(discord, bot, command(["mod", "ban"], { viewer: "456", reason: "Synthetic", confirm: false }))).reply.embeds![0].footer!.text).toBe("Code: operator_acknowledgement_required");
    expect((await run(discord, bot, command(["mod", "incident-start"], { preset: "links", minutes: 30, confirm: true }))).reply.embeds![0].title).toBe("Incident mode on");
    expect(JSON.parse(repo.setting("incident_mode")!).preset).toBe("links");
    await run(discord, bot, command(["mod", "incident-stop"]));
    await run(discord, bot, command(["timers", "pause"])); expect(bot.state.settings.timersPaused).toBe(true);
    expect((await run(discord, bot, command(["alert", "send"], { text: "Synthetic alert" }))).reply.embeds![0].title).toBe("Alert sent");
  });

  it("denies members without the command's grant before resolving targets or acting", async () => {
    const { bot, owner } = await setup(), discord = new DiscordService(bot.state);
    addMedia(bot, "song-a", 7);
    const denied = await run(discord, bot, command(["media", "approve"], { request: "#7" }, { roles: ["301"] }));
    expect(denied.reply.embeds![0]).toMatchObject({ title: "Not allowed", footer: { text: "Code: discord_permission_denied" } });
    expect(media(bot, "song-a").status).toBe("pending");
    expect((await run(discord, bot, command(["status"], {}, { roles: [] }))).reply.embeds![0].footer!.text).toBe("Code: discord_permission_denied");
    // A grant removed after intake is enforced when the deferred job runs.
    const pending = command(["media", "approve"], { request: "#7" }), payload = signed(pending);
    discord.intake(payload.body, payload.headers, credentials);
    const route = bot.state.document("route")!;
    bot.state.save(owner, "guild", "route", { ...route.data, roles: [{ id: "301", permission: "engage" }] }, route.version);
    const job = bot.state.db.prepare("SELECT * FROM jobs WHERE id=?").get(`discord:${pending.id}`) as Job;
    await discord.execute(job, (actor, name, input, id) => bot.action(actor, name, input, id));
    expect(bot.state.repository.setting(`discord_result:${pending.id}`)).toContain("discord_permission_denied");
    expect(media(bot, "song-a").status).toBe("pending");
  });

  it("answers autocomplete inline with permitted, bounded suggestions and no stored effects", async () => {
    const { bot, repo } = await setup(), discord = new DiscordService(bot.state);
    addMedia(bot, "song-a", 12, "pending", "Synthetic anthem"); addMedia(bot, "song-b", 13, "approved");
    const result = suggest(discord, command(["media", "approve"], { request: "anth" }, { focused: "request" }));
    expect(result).toEqual({ type: 8, data: { choices: [{ name: "#12 · Synthetic anthem · awaiting approval", value: "song-a" }] } });
    expect(suggest(discord, command(["media", "approve"], { request: "#1" }, { focused: "request" })).data.choices.map((c) => c.value)).toEqual(["song-a"]);
    // Unauthorised members and unknown channels learn nothing.
    expect(suggest(discord, command(["media", "approve"], { request: "" }, { focused: "request", roles: ["301"] })).data.choices).toEqual([]);
    expect(suggest(discord, { ...command(["media", "approve"], { request: "" }, { focused: "request" }), channel_id: "999" }).data.choices).toEqual([]);
    expect(suggest(discord, command(["goal", "set"], { goal: "comm", value: 1 }, { focused: "goal" })).data.choices).toEqual([{ name: "Community goal · 0/100", value: "fixture-goal" }]);
    expect(suggest(discord, command(["mod", "warn"], { viewer: "fixture" }, { focused: "viewer" })).data.choices[0]).toMatchObject({ value: "456" });
    expect(suggest(discord, command(["mod", "warn"], { viewer: "fixture" }, { focused: "viewer", roles: ["300"] })).data.choices).toEqual([]);
    repo.acceptReceipt("chat-1", "chat.message.sent", { content: "a synthetic message to remove", message_id: "kick-message-1", sender: { user_id: 456, username: "Fixture viewer" }, broadcaster: { user_id: 123 } });
    expect(suggest(discord, command(["mod", "delete"], { viewer: "456", message: "" }, { focused: "message" })).data.choices[0]).toMatchObject({ value: "kick-message-1" });
    expect(suggest(discord, command(["reward", "complete"], { redemption: "" }, { focused: "redemption" })).data.choices).toEqual([]);
    const receipts = (bot.state.db.prepare("SELECT count(*) AS n FROM receipts WHERE event_type='discord.interaction'").get() as { n: number }).n;
    expect(receipts).toBe(0);
  });

  it("stays inside the 3-second deadline on a large installation", async () => {
    const { bot, repo } = await setup(), discord = new DiscordService(bot.state);
    const insertMedia = bot.state.db.prepare("INSERT INTO media(id,video_id,requester,title,status,position,version,created_at) VALUES(?,?,?,?,?,?,1,?)");
    const insertViewer = bot.state.db.prepare("INSERT INTO viewers(id,name,role,last_seen) VALUES(?,?,'viewer',?)");
    const insertChat = repo.store.sqlite.prepare("INSERT INTO receipts(id,event_type,payload,received_at) VALUES(?,'chat.message.sent',?,?)");
    bot.state.db.transaction(() => {
      for (let i = 0; i < 500; i++) insertMedia.run(`bulk-${i}`, "abcdefghijk", "456", `Bulk song ${i}`, i % 2 ? "pending" : "approved", 100 + i, Date.now());
      for (let i = 0; i < 20000; i++) insertViewer.run(String(100000 + i), `Bulk viewer ${i}`, Date.now() - i);
      for (let i = 0; i < 20000; i++) insertChat.run(`bulk-chat-${i}`, JSON.stringify({ content: `bulk ${i}`, message_id: `m-${i}`, sender: { user_id: 100000 + (i % 50) }, broadcaster: { user_id: 123 } }), Date.now() - i);
    })();
    const started = performance.now();
    expect(suggest(discord, command(["media", "approve"], { request: "song" }, { focused: "request" })).data.choices).toHaveLength(25);
    expect(suggest(discord, command(["mod", "timeout"], { viewer: "bulk" }, { focused: "viewer" })).data.choices).toHaveLength(25);
    expect(suggest(discord, command(["mod", "delete"], { viewer: "100001", message: "" }, { focused: "message" })).data.choices.length).toBeGreaterThan(0);
    const commandPayload = signed(command(["media", "queue"]));
    expect(discord.intake(commandPayload.body, commandPayload.headers, credentials)).toMatchObject({ type: 5 });
    // Hosted CI is slower than a reference host; this bounds the synchronous path well under 3 s.
    expect(performance.now() - started).toBeLessThan(1500);
  });
});

describe("Discord notification buttons", () => {
  it("renders Approve/Reject with the item's version, acts once and reports stale clicks without acting", async () => {
    const { bot } = await setup(), discord = new DiscordService(bot.state);
    addMedia(bot, "request:01J00000000000000000000001", 9);
    const notice = discord.notification({ event: "media", text: "Approval requested" }, "discord:media:request:01J00000000000000000000001:route");
    expect(notice.content).toBe("🎵 Song request **#9** needs approval");
    expect(notice.components![0].components.map((b) => [b.label, b.custom_id])).toEqual([["Approve", "kb1:ma:1:request:01J00000000000000000000001"], ["Reject", "kb1:mr:1:request:01J00000000000000000000001"]]);
    expect(notice.allowed_mentions).toEqual({ parse: [] });
    const fresh = await run(discord, bot, click("kb1:ma:1:request:01J00000000000000000000001"));
    expect(fresh.reply.embeds![0].title).toBe("Approved #9 · Synthetic song 9");
    expect(fresh.update).toEqual([{ type: 1, components: [expect.objectContaining({ label: "Approved", disabled: true })] }]);
    const late = await run(discord, bot, click("kb1:mr:1:request:01J00000000000000000000001"));
    expect(late.reply.embeds![0].title).toBe("This changed"); expect(media(bot, "request:01J00000000000000000000001").status).toBe("approved");
    // A pending item whose version moved on is never decided by a button rendered earlier.
    addMedia(bot, "song-c", 10); bot.state.db.prepare("UPDATE media SET version=version+1 WHERE id='song-c'").run();
    const stale = await run(discord, bot, click("kb1:ma:1:song-c"));
    expect(stale.reply.embeds![0].title).toBe("This changed"); expect(media(bot, "song-c")).toMatchObject({ status: "pending", version: 2 });
    expect(discord.notification({ event: "media", text: "Queued" }, "discord:media:request:01J00000000000000000000001:route").components).toBeUndefined();
  });

  it("completes or refunds a redemption exactly once and offers Draw on a raffle close notice", async () => {
    const { bot, repo, owner } = await setup(), discord = new DiscordService(bot.state);
    bot.engagement.redeem("456", "fixture-reward", "redemption:synthetic");
    const job = repo.store.sqlite.prepare("SELECT id,payload FROM jobs WHERE kind='discord.send'").get() as { id: string; payload: string };
    expect(job.id).toBe("discord:redemption:redemption:synthetic:route");
    const notice = discord.notification(JSON.parse(job.payload), job.id);
    expect(notice.components![0].components.map((b) => b.custom_id)).toEqual(["kb1:rc:0:redemption:synthetic", "kb1:rf:0:redemption:synthetic"]);
    expect(notice.embeds![0].fields![0]).toMatchObject({ name: "Viewer", value: "Fixture viewer" });
    const done = await run(discord, bot, click("kb1:rc:0:redemption:synthetic", ["301"]));
    expect(done.reply.embeds![0].title).toBe("Completed: Community shoutout");
    const refund = await run(discord, bot, click("kb1:rf:0:redemption:synthetic", ["301"]));
    expect(refund.reply.embeds![0].title).toBe("This changed");
    expect(repo.store.sqlite.prepare("SELECT 1 FROM ledger WHERE id='refund:redemption:synthetic'").get()).toBeUndefined();
    const raffle = bot.state.document("fixture-raffle")!;
    bot.engagement.enter(raffle.id, "456", "viewer"); bot.engagement.close(owner, raffle.id);
    const closed = repo.store.sqlite.prepare("SELECT id,payload FROM jobs WHERE id LIKE 'discord:close:%'").get() as { id: string; payload: string };
    const drawId = discord.notification(JSON.parse(closed.payload), closed.id).components![0].components[0].custom_id;
    expect(drawId).toBe(`kb1:rd:${raffle.version + 1}:${raffle.id}`);
    expect((await run(discord, bot, click(drawId))).reply.embeds![0].title).toBe("Winner: Fixture viewer");
    expect((await run(discord, bot, click(drawId))).reply.embeds![0].title).toBe("This changed");
  });

  it("denies clicks without the grant, deduplicates repeated deliveries and rejects unknown buttons", async () => {
    const { bot } = await setup(), discord = new DiscordService(bot.state);
    addMedia(bot, "song-a", 3);
    const denied = await run(discord, bot, click("kb1:ma:1:song-a", ["301"]));
    expect(denied.reply.embeds![0].footer!.text).toBe("Code: discord_permission_denied"); expect(denied.update).toBeUndefined();
    expect(media(bot, "song-a").status).toBe("pending");
    const interaction = click("kb1:ma:1:song-a"), payload = signed(interaction);
    discord.intake(payload.body, payload.headers, credentials); discord.intake(payload.body, payload.headers, credentials);
    expect(bot.state.db.prepare("SELECT count(*) AS n FROM jobs WHERE id=?").get(`discord:${interaction.id}`)).toEqual({ n: 1 });
    const job = bot.state.db.prepare("SELECT * FROM jobs WHERE id=?").get(`discord:${interaction.id}`) as Job;
    const action = vi.fn((actor: Actor, name: string, input: Record<string, unknown>, id: string) => bot.action(actor, name, input, id));
    await discord.execute(job, action); await discord.execute(job, action);
    expect(action).toHaveBeenCalledTimes(1); expect(media(bot, "song-a").status).toBe("approved");
    for (const custom of ["kb1:done", "something-else"]) {
      const unknown = signed(click(custom));
      expect(() => discord.intake(unknown.body, unknown.headers, credentials)).toThrow("unsupported_discord_interaction");
    }
  });

  it("delivers structured replies and button updates live without repeating actions, and fixture mode never calls Discord", async () => {
    const live = await setup("live");
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}"));
    const discord = new DiscordService(live.bot.state, request);
    addMedia(live.bot, "song-a", 5);
    const interaction = click("kb1:ma:1:song-a"), payload = signed(interaction);
    discord.intake(payload.body, payload.headers, credentials);
    vi.spyOn(discord, "credentials").mockReturnValue(credentials);
    const job = live.bot.state.db.prepare("SELECT * FROM jobs WHERE id=?").get(`discord:${interaction.id}`) as Job;
    await discord.execute(job, (actor, name, input, id) => live.bot.action(actor, name, input, id));
    expect(request).toHaveBeenCalledTimes(2);
    const [reply, update] = request.mock.calls;
    expect(String(reply[0])).toContain("/webhooks/900/synthetic-interaction/messages/@original");
    expect(JSON.parse(String(reply[1]!.body))).toMatchObject({ embeds: [expect.objectContaining({ title: "Approved #5 · Synthetic song 5" })], allowed_mentions: { parse: [] } });
    expect(String(update[0])).toContain("/channels/200/messages/800");
    expect(JSON.parse(String(update[1]!.body)).components[0].components[0]).toMatchObject({ label: "Approved", disabled: true });
    expect(live.bot.state.repository.setting(`discord_result:${interaction.id}`)).toBe('{"delivered":true}');
    await discord.execute(job, () => { throw new Error("must not run again"); });
    expect(request).toHaveBeenCalledTimes(2);
    const fixture = await setup(), fixtureRequest = vi.fn<typeof fetch>(), offline = new DiscordService(fixture.bot.state, fixtureRequest);
    await run(offline, fixture.bot, command(["timers", "pause"]));
    await offline.send({ event: "media", guildId: "100", channelId: "200", text: "Synthetic" }, "discord:media:missing:route");
    expect(await offline.register(fixture.owner)).toMatchObject({ fixture: true });
    expect(fixtureRequest).not.toHaveBeenCalled();
  });

  it("runs old single-command interactions only if they were queued before the upgrade", async () => {
    const { bot, config } = await setup(), discord = new DiscordService(bot.state);
    const legacy = { ...command(["timers", "pause"]), data: { name: "kekbot", options: [{ name: "action", value: "timers.pause" }] } };
    // Arriving now (old registration still in Discord): refused without acting.
    const refused = await run(discord, bot, legacy);
    expect(refused.reply.embeds![0].footer!.text).toBe("Code: discord_commands_outdated"); expect(bot.state.settings.timersPaused).toBe(false);
    // Queued by the previous release: its payload has no format marker.
    const queued = { ...legacy, id: String(sequence++) };
    const job = { id: `discord:${queued.id}`, kind: "discord.interaction", payload: JSON.stringify({ encrypted: encrypt(JSON.stringify({ interaction: queued, expires: Date.now() + 60000 }), config.key, "discord.interaction") }) } as Job;
    await discord.execute(job, (actor, name, input, id) => bot.action(actor, name, input, id));
    expect(JSON.parse(bot.state.repository.setting(`discord_result:${queued.id}`)!).reply.embeds[0].title).toBe("Done");
    expect(bot.state.settings.timersPaused).toBe(true);
  });
});

/** Submit a command now (intake), let something else happen, then run the deferred job. */
async function deferred(discord: DiscordService, bot: BotService, interaction: { id: string }, between: () => void) {
  const payload = signed(interaction);
  discord.intake(payload.body, payload.headers, credentials);
  between();
  const job = bot.state.db.prepare("SELECT * FROM jobs WHERE id=?").get(`discord:${interaction.id}`) as Job;
  await discord.execute(job, (actor, name, input, id) => bot.action(actor, name, input, id));
  return JSON.parse(bot.state.repository.setting(`discord_result:${interaction.id}`)!) as { reply: Message };
}

describe("slash commands act on what the member submitted", () => {
  it("replies This changed without acting when the target or player changed between intake and execution", async () => {
    const { bot, owner } = await setup(), discord = new DiscordService(bot.state);
    addMedia(bot, "song-a", 21);
    const approve = await deferred(discord, bot, command(["media", "approve"], { request: "#21" }), () => bot.media.decide(owner, "song-a", 1, "reject"));
    expect(approve.reply.embeds![0].title).toBe("This changed"); expect(media(bot, "song-a").status).toBe("rejected");
    for (const [index, id] of ["one", "two", "three"].entries()) addMedia(bot, id, 30 + index, "approved");
    const move = await deferred(discord, bot, command(["media", "move"], { request: "#32", position: 1 }), () => bot.media.reorder(owner, ["two", "three", "one"]));
    // Reorder swaps the items' existing numbers (#30–#32), so "three" is second in line as #31.
    expect(move.reply.embeds![0].title).toBe("This changed"); expect(media(bot, "three").position).toBe(31);
    bot.media.control(owner, "resume", bot.media.player.version);
    const pause = await deferred(discord, bot, command(["media", "pause"]), () => bot.media.control(owner, "volume", bot.media.player.version, 20));
    expect(pause.reply.embeds![0].title).toBe("This changed"); expect(bot.media.player.state).toBe("playing");
    const goal = await deferred(discord, bot, command(["goal", "add"], { goal: "Community goal", amount: 5 }), () => bot.presentation.adjustGoal(owner, "fixture-goal", 50, bot.state.document("fixture-goal")!.version));
    expect(goal.reply.embeds![0].title).toBe("This changed"); expect(bot.state.document("fixture-goal")!.data.value).toBe(50);
    const draw = bot.state.document("fixture-raffle")!; bot.engagement.enter(draw.id, "456", "viewer"); bot.engagement.close(owner, draw.id);
    const drawn = await deferred(discord, bot, command(["raffle", "draw"], { raffle: "Community draw" }), () => bot.state.db.prepare("UPDATE documents SET version=version+1 WHERE id=?").run(draw.id));
    expect(drawn.reply.embeds![0].title).toBe("This changed"); expect(bot.state.document(draw.id)!.data.status).toBe("closed");
  });

  it("resolves names at intake but reveals a missing target only to permitted members", async () => {
    const { bot } = await setup(), discord = new DiscordService(bot.state);
    const missing = await run(discord, bot, command(["media", "approve"], { request: "#404" }));
    expect(missing.reply.embeds![0].footer!.text).toBe("Code: media_not_found");
    const hidden = await run(discord, bot, command(["media", "approve"], { request: "#404" }, { roles: ["301"] }));
    expect(hidden.reply.embeds![0].footer!.text).toBe("Code: discord_permission_denied");
  });

  it("refuses reward and points commands, buttons and suggestions while points are disabled", async () => {
    const { bot, owner } = await setup(), discord = new DiscordService(bot.state);
    bot.engagement.redeem("456", "fixture-reward", "redemption:off");
    const settings = bot.state.document("instance")!;
    bot.state.save(owner, "settings", "instance", { ...settings.data, pointsEnabled: false }, settings.version);
    for (const interaction of [command(["reward", "pending"]), command(["points"], { viewer: "456" }), click("kb1:rc:0:redemption:off", ["301"])])
      expect((await run(discord, bot, interaction)).reply.embeds![0].footer!.text).toBe("Code: points_disabled");
    expect(bot.state.db.prepare("SELECT status FROM redemptions WHERE id='redemption:off'").get()).toEqual({ status: "pending" });
    expect(suggest(discord, command(["reward", "complete"], { redemption: "" }, { focused: "redemption" })).data.choices).toEqual([]);
  });
});

describe("engage can create polls and raffles (deliberate permission change)", () => {
  const account = (bot: BotService, role: "moderator" | "readonly"): Actor => {
    const id = randomUUID();
    bot.state.db.prepare("INSERT INTO accounts(id,username,password,role,permissions,created_at) VALUES(?,?,?,?,'[]',?)").run(id, `${role}-${id.slice(0, 8)}`, "not-a-login-hash", role, Date.now());
    return { id, role, permissions: [] };
  };
  const poll = { name: "Synthetic poll", options: ["A", "B"] };

  it("allows Discord engage grants, moderators and engage API tokens, and refuses everyone else", async () => {
    const { bot, owner } = await setup(), discord = new DiscordService(bot.state);
    expect((await run(discord, bot, command(["poll", "create"], { question: "Engage poll", options: "A, B" }, { roles: ["301"] }))).reply.embeds![0].title).toBe("Poll started: Engage poll");
    expect((await run(discord, bot, command(["raffle", "create"], { name: "Media raffle" }, { roles: ["300"] }))).reply.embeds![0].footer!.text).toBe("Code: discord_permission_denied");
    expect((await bot.action(account(bot, "moderator"), "poll.create", poll, "moderator-request")) as { id: string }).toMatchObject({ id: "poll-moderator-request", kind: "poll" });
    await expect(bot.action(account(bot, "readonly"), "raffle.create", { name: "Nope" }, "readonly-request")).rejects.toThrow("permission_denied");
    const read = bot.presentation.issueToken(owner, "Reader", "api", ["read"]), engage = bot.presentation.issueToken(owner, "Engage", "api", ["engage"]);
    await expect(bot.action({ ...owner, permissions: ["read" as never], capabilityId: read.id }, "raffle.create", { name: "Nope" }, "read-request")).rejects.toThrow("api_permission_revoked");
    expect(await bot.action({ ...owner, permissions: ["engage"], capabilityId: engage.id }, "raffle.create", { name: "API raffle" }, "api-request")).toMatchObject({ id: "raffle-api-request" });
    expect(bot.state.list("raffle").map((doc) => doc.data.name)).not.toContain("Media raffle");
    // config.save still needs configure for these kinds.
    expect(() => bot.state.save(account(bot, "moderator"), "poll", undefined, { ...poll, endsAt: Date.now() + 60000 })).toThrow("permission_denied");
    expect(bot.state.db.prepare("SELECT count(*) AS n FROM audit WHERE action='poll.save' AND target='poll-moderator-request'").get()).toEqual({ n: 1 });
  });

  it("caps open polls and raffles, validates strictly and never duplicates on retry", async () => {
    const { bot } = await setup(), discord = new DiscordService(bot.state), moderator = account(bot, "moderator");
    const first = await bot.action(moderator, "poll.create", poll, "retry-me"), again = await bot.action(moderator, "poll.create", poll, "retry-me");
    expect(again).toEqual(first);
    await expect(bot.action(moderator, "poll.create", { ...poll, extra: true }, "strict")).resolves.toBeDefined();
    expect(bot.state.document("poll-strict")!.data).not.toHaveProperty("extra");
    await expect(bot.action(moderator, "poll.create", { name: "One option", options: ["Only"] }, "invalid")).rejects.toThrow();
    // A Discord job retried after a crash (result not yet stored) returns the same poll.
    const interaction = command(["poll", "create"], { question: "Crash safe", options: "A|B" }, { roles: ["301"] }), payload = signed(interaction);
    discord.intake(payload.body, payload.headers, credentials);
    const job = bot.state.db.prepare("SELECT * FROM jobs WHERE id=?").get(`discord:${interaction.id}`) as Job;
    await discord.execute(job, (actor, name, input, id) => bot.action(actor, name, input, id));
    bot.state.db.prepare("DELETE FROM settings WHERE key=?").run(`discord_result:${interaction.id}`);
    await discord.execute(job, (actor, name, input, id) => bot.action(actor, name, input, id));
    expect(bot.state.list("poll").filter((doc) => doc.data.name === "Crash safe")).toHaveLength(1);
    const open = () => [...bot.state.list("poll"), ...bot.state.list("raffle")].filter((doc) => doc.data.status === "open").length;
    for (let i = 0; open() < 10; i++) await bot.action(moderator, "raffle.create", { name: `Raffle ${i}` }, `fill-${i}`);
    await expect(bot.action(moderator, "raffle.create", { name: "Eleventh" }, "eleventh")).rejects.toThrow("open_activity_limit");
    expect((await run(discord, bot, command(["poll", "create"], { question: "Too many", options: "A,B" }))).reply.embeds![0].footer!.text).toBe("Code: open_activity_limit");
    expect(await bot.action(moderator, "poll.create", poll, "retry-me")).toEqual(first);
  });
});
