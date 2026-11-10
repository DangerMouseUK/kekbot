import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, rmSync } from "node:fs";
import { AuthService } from "../src/server/auth.ts";
import { BotService } from "../src/server/domain/bot.ts";
import { errorReply } from "../src/server/domain/replies.ts";
import { environment, repository } from "./helpers.ts";

// Every reply KekBot sends to Kick chat, asserted as the exact viewer-facing text.
const cleanup: (() => void)[] = [];
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(1_800_000_000_000); });
afterEach(() => { vi.useRealTimers(); for (const fn of cleanup.splice(0).reverse()) fn(); });

async function setup() {
  const env = environment(); cleanup.push(() => rmSync(env.root, { recursive: true, force: true }));
  const repo = repository(env.config); cleanup.push(() => repo.store.close());
  const auth = new AuthService(repo), bot = new BotService(repo, env.config);
  const login = await auth.setup(readFileSync(env.config.setupTokenFile, "utf8").trim(), { username: "owner", password: "a strong fixture password" });
  const owner = auth.session(login.token)!;
  const sent: string[] = [];
  let receipt = 0;
  const settings = (patch: Record<string, unknown>) => {
    const doc = bot.state.document("instance");
    bot.state.save(owner, "settings", "instance", { ...(doc?.data ?? {}), ...patch }, doc?.version);
  };
  /** Send a chat message and return the reply KekBot queued for it, if any. */
  const say = (content: string, sender: { id?: number; username?: string; moderator?: boolean } = {}) => {
    vi.setSystemTime(Date.now() + 6000); // Step past the five-second per-viewer command guard.
    const id = `receipt-${++receipt}`;
    // Settle earlier fixture work, then commit a real receipt and run its leased event job as the worker does.
    let job; while ((job = repo.claim())) repo.finish(job, "succeeded");
    repo.acceptReceipt(id, "chat.message.sent", { content, message_id: id, broadcaster: { user_id: 123 }, sender: { user_id: sender.id ?? 456, username: "username" in sender ? sender.username : "FixtureViewer", identity: sender.moderator ? { badges: [{ type: "moderator" }] } : null } });
    bot.event(repo.claim()!);
    const row = repo.store.sqlite.prepare("SELECT payload FROM jobs WHERE id=?").get(`reply:${id}`) as { payload: string } | undefined;
    const text = row ? (JSON.parse(row.payload) as { text: string }).text : undefined;
    if (text) sent.push(text);
    return text;
  };
  const mediaReply = (id: string) => {
    const text = (JSON.parse((repo.store.sqlite.prepare("SELECT payload FROM jobs WHERE id=?").get(`media-result:${id}`) as { payload: string }).payload) as { text: string }).text;
    sent.push(text); return text;
  };
  return { bot, repo, owner, settings, say, mediaReply, sent };
}

/** Nothing internal reaches chat: no snake_case codes, receipts, item IDs, versions or over-long text. */
function expectViewerSafe(sent: string[], forbidden: string[] = []) {
  expect(sent.length).toBeGreaterThan(0);
  for (const text of sent) {
    expect(text.length).toBeLessThanOrEqual(500);
    expect(text).not.toMatch(/\b[a-z]+_[a-z_]+\b/);
    expect(text).not.toMatch(/receipt-|request:|redemption:|version|[0-9a-f]{8}-[0-9a-f]{4}-/i);
    for (const value of forbidden) expect(text).not.toContain(value);
  }
}

describe("Kick chat replies with real SQLite", () => {
  it("walks a song request from !sr to queue, now playing and skip using public #N numbers", async () => {
    const { bot, repo, owner, settings, say, mediaReply, sent } = await setup();
    settings({ mediaEnabled: true, requestCooldown: 0, autoApprove: true });
    expect(say("!sr https://youtu.be/abcdefghijk")).toBe("@FixtureViewer, got it! Checking request #1 now.");
    await bot.media.validate("request:receipt-1", false);
    expect(mediaReply("request:receipt-1")).toBe('@FixtureViewer, request #1 "Fixture video abcdefghijk" is in the queue (1st in line).');
    expect(say("!sr bcdefghijkl", { id: 789, username: "OtherViewer" })).toBe("@OtherViewer, got it! Checking request #2 now.");
    await bot.media.validate("request:receipt-2", false);
    expect(mediaReply("request:receipt-2")).toBe('@OtherViewer, request #2 "Fixture video bcdefghijkl" is in the queue (2nd in line).');
    expect(say("!queue")).toBe('Up next: #1 "Fixture video abcdefghijk" (FixtureViewer) · #2 "Fixture video bcdefghijkl" (OtherViewer).');
    // A list naming other requesters is associated with them, so erasing one scrubs this payload too.
    const listed = repo.store.sqlite.prepare("SELECT viewer_ids FROM jobs WHERE kind='kick.reply' AND json_extract(payload,'$.text') LIKE 'Up next:%'").get() as { viewer_ids: string };
    expect(JSON.parse(listed.viewer_ids)).toEqual(expect.arrayContaining(["456", "789"]));
    expect(say("!nowplaying")).toBe("Nothing is playing right now.");
    bot.media.control(owner, "resume", bot.media.player.version);
    expect(say("!nowplaying")).toBe('Now playing: #1 "Fixture video abcdefghijk", requested by FixtureViewer.');
    expect(say("!skip")).toBe("@FixtureViewer, only moderators can use that command.");
    expect(say("!skip", { id: 900, username: "ModViewer", moderator: true })).toBe('Skipped #1 "Fixture video abcdefghijk". Next: #2 "Fixture video bcdefghijkl".');
    expect(say("!skip", { id: 900, username: "ModViewer", moderator: true })).toBe('Skipped #2 "Fixture video bcdefghijkl". The queue is now empty.');
    expect(say("!skip", { id: 900, username: "ModViewer", moderator: true })).toBe("@ModViewer, nothing is playing, so there is nothing to skip.");
    expect(say("!queue")).toBe("The queue is empty. Request a song with !sr and a YouTube link.");
    expectViewerSafe(sent, ["abcdefghijk:", "456", "789"]);
  });

  it("keeps #N unique when a moderator reorders the queue behind a playing item", async () => {
    const { bot, repo, owner, settings, say, sent } = await setup();
    settings({ mediaEnabled: true, requestCooldown: 0 });
    const ids = ["first", "second", "third", "fourth"];
    for (const [index, id] of ids.entries()) {
      bot.media.request(["abcdefghijk", "bcdefghijkl", "cdefghijklm", "defghijklmn"][index], "456", id, true);
      await bot.media.validate(id, true);
    }
    bot.media.control(owner, "resume", bot.media.player.version);
    expect(bot.media.item("first")!.status).toBe("playing");
    bot.media.reorder(owner, ["fourth", "third", "second"]);
    const rows = repo.store.sqlite.prepare("SELECT id,position FROM media ORDER BY position").all() as { id: string; position: number }[];
    expect(new Set(rows.map(row => row.position)).size).toBe(rows.length);
    expect(rows).toEqual([{ id: "first", position: 1 }, { id: "fourth", position: 2 }, { id: "third", position: 3 }, { id: "second", position: 4 }]);
    expect(say("!queue")).toBe('Up next: #2 "Fixture video defghijklmn" (FixtureViewer) · #3 "Fixture video cdefghijklm" (FixtureViewer) · #4 "Fixture video bcdefghijkl" (FixtureViewer).');
    expect(say("!skip", { id: 900, username: "ModViewer", moderator: true })).toBe('Skipped #1 "Fixture video abcdefghijk". Next: #2 "Fixture video defghijklmn".');
    expectViewerSafe(sent);
  });

  it("explains pending approval and validation rejections in plain words", async () => {
    const { bot, settings, say, mediaReply, sent } = await setup();
    settings({ mediaEnabled: true, requestCooldown: 0, maxDuration: 120, perUser: 5 });
    say("!sr abcdefghijk");
    await bot.media.validate("request:receipt-1", false);
    expect(mediaReply("request:receipt-1")).toBe("@FixtureViewer, request #1 wasn't added. That video is too long. The limit is 2 minutes.");
    settings({ maxDuration: 600, blockedTitles: ["Fixture"] });
    say("!sr bcdefghijkl");
    await bot.media.validate("request:receipt-2", false);
    expect(mediaReply("request:receipt-2")).toBe("@FixtureViewer, request #2 wasn't added. That video isn't allowed by this channel's request rules.");
    settings({ blockedTitles: [] });
    // A display name that is not a plain Kick username is never @-mentioned.
    say("!sr cdefghijklm", { username: "Fixture viewer" });
    await bot.media.validate("request:receipt-3", false);
    expect(mediaReply("request:receipt-3")).toBe('Request #3 "Fixture video cdefghijklm" is waiting for a moderator to approve it.');
    expect(say("!queue")).toBe("The queue is empty. 1 more request is waiting for approval.");
    expectViewerSafe(sent);
  });

  it("turns song request errors into friendly, actionable replies", async () => {
    const { settings, say, sent } = await setup();
    expect(say("!sr abcdefghijk")).toBe("@FixtureViewer, song requests are turned off right now.");
    expect(say("!queue")).toBe("@FixtureViewer, song requests are turned off right now.");
    settings({ mediaEnabled: true, requestCooldown: 60, perUser: 1, capacity: 2 });
    expect(say("!sr https://video.example/watch")).toBe("@FixtureViewer, that doesn't look like a YouTube video. Use !sr followed by a YouTube link or video ID.");
    expect(say("!sr")).toBe("@FixtureViewer, that doesn't look like a YouTube video. Use !sr followed by a YouTube link or video ID.");
    say("!sr abcdefghijk");
    expect(say("!sr bcdefghijkl")).toBe("@FixtureViewer, you already have 1 request waiting. You can request again once one has played.");
    settings({ perUser: 5 });
    expect(say("!sr bcdefghijkl")).toBe("@FixtureViewer, you can request another song in 48 seconds.");
    expect(say("!sr abcdefghijk", { id: 789, username: "OtherViewer" })).toBe("@OtherViewer, that video is already in the queue.");
    say("!sr bcdefghijkl", { id: 789, username: "OtherViewer" });
    expect(say("!sr cdefghijklm", { id: 790, username: "ThirdViewer" })).toBe("@ThirdViewer, the song queue is full right now. Try again after a few songs have played.");
    expectViewerSafe(sent);
  });

  it("maps every provider-side validation code to wording without the code", () => {
    const unavailable = "Song requests are unavailable right now. Please try again later.";
    for (const code of ["youtube_key_missing", "youtube_unavailable", "youtube_quota_or_key_rejected", "youtube_response_invalid"]) expect(errorReply(code)).toBe(unavailable);
    expect(errorReply("youtube_embedding_disabled")).toBe("That video can't be played on stream because it is private or its owner doesn't allow embedding.");
    expect(errorReply("youtube_video_unavailable")).toBe("That video couldn't be found. It may be private or removed.");
    expect(errorReply("youtube_live_or_duration_unavailable")).toBe("Live streams and videos without a fixed length can't be requested.");
    expect(errorReply("video_duration_rejected", { duration: 0, maxDuration: 600 })).toBe("Live streams and videos without a fixed length can't be requested.");
    expect(errorReply("video_duration_rejected", { duration: 4000, maxDuration: 3900 })).toBe("That video is too long. The limit is 1 hour 5 minutes.");
    expect(errorReply("some_future_internal_code")).toBe("Sorry, that didn't work. Please try again in a moment.");
    expect(errorReply(undefined)).toBe("That command wasn't quite right. Check the format and try again.");
  });

  it("answers utility, points, watchtime, leaderboard and goal commands consistently", async () => {
    const { bot, repo, owner, settings, say, sent } = await setup();
    expect(say("!rules")).toBe("No chat rules have been set up yet.");
    expect(say("!discord")).toBe("No Discord link has been set up yet.");
    expect(say("!uptime")).toBe("The stream is offline right now, or its status isn't available yet.");
    repo.set("stream_is_live", "true");
    expect(say("!uptime")).toBe("The stream is live, but its start time isn't available yet.");
    repo.set("stream_started_at", new Date(Date.now() - 65 * 60000).toISOString());
    expect(say("!uptime")).toBe("The stream has been live for 1 hour 5 minutes.");
    settings({ rules: "Be kind." });
    expect(say("!rules")).toBe("Be kind.");
    expect(say("!points")).toBe("Points aren't enabled on this channel.");
    settings({ pointsEnabled: true });
    bot.engagement.adjust(owner, "456", 1250, "fixture grant");
    say("hello", { id: 789, username: "OtherViewer" });
    bot.engagement.adjust(owner, "789", 1, "fixture grant");
    expect(say("!points")).toBe("@FixtureViewer, you have 1,250 points.");
    expect(say("!points", { id: 789, username: "OtherViewer" })).toBe("@OtherViewer, you have 1 point.");
    expect(say("!watchtime")).toBe("@FixtureViewer, your estimated watchtime is less than a minute so far. It is based on chat activity while the stream is live, so it isn't exact.");
    repo.store.sqlite.prepare("UPDATE viewers SET watch_minutes=125 WHERE id='456'").run();
    expect(say("!watchtime")).toBe("@FixtureViewer, your estimated watchtime is about 2 hours 5 minutes. It is based on chat activity while the stream is live, so it isn't exact.");
    expect(say("!top")).toBe("Top points: 1. FixtureViewer 1,250 · 2. OtherViewer 1");
    // Pending replies that name the viewer (including !top) hold erasure until delivered.
    expect(() => bot.operations.eraseViewer(owner, "789")).toThrow("privacy_processing_pending_retry_after_jobs_complete");
    let job; while ((job = repo.claim())) repo.finish(job, "succeeded");
    bot.operations.eraseViewer(owner, "789");
    expect(repo.store.sqlite.prepare("SELECT count(*) AS n FROM jobs WHERE kind='kick.reply' AND payload LIKE '%OtherViewer%'").get()).toEqual({ n: 0 });
    expect(say("!top")).toBe("Top points: 1. FixtureViewer 1,250 · 2. a viewer 1");
    expect(say("!goal")).toBe("There are no active goals right now.");
    bot.state.save(owner, "goal", undefined, { name: "Follower goal", metric: "manual", target: 200, value: 50 });
    vi.setSystemTime(Date.now() + 1000);
    bot.state.save(owner, "goal", undefined, { name: "Sub goal", metric: "manual", target: 10, value: 10 });
    expect(say("!goal")).toBe("Goals: Follower goal 50/200 (25%) · Sub goal 10/10 (complete)");
    expect(say("!so")).toBe("@FixtureViewer, only moderators can use that command.");
    expect(say("!so", { id: 900, username: "ModViewer", moderator: true })).toBe("@ModViewer, who should get the shoutout? Use !so followed by a Kick username, for example !so somestreamer.");
    expect(say("!so @SomeStreamer", { id: 900, username: "ModViewer", moderator: true })).toBe("Go check out SomeStreamer at https://kick.com/SomeStreamer and show them some love!");
    expectViewerSafe(sent, ["789"]);
  });

  it("names the reward, cost and balance for !redeem and explains failures", async () => {
    const { bot, owner, settings, say, sent } = await setup();
    const reward = bot.state.save(owner, "reward", undefined, { name: "Choose a topic", cost: 100 });
    bot.state.save(owner, "reward", undefined, { name: "Hydrate", cost: 25 });
    expect(say("!redeem Choose a topic")).toBe("@FixtureViewer, points aren't enabled on this channel.");
    settings({ pointsEnabled: true });
    expect(say("!redeem")).toBe("@FixtureViewer, that reward doesn't exist. Try !redeem with one of: Hydrate (25 points) · Choose a topic (100 points).");
    expect(say("!redeem Choose a topic")).toBe('@FixtureViewer, "Choose a topic" costs 100 points and you have 0 points.');
    bot.engagement.adjust(owner, "456", 150, "fixture grant");
    expect(say("!redeem choose a topic")).toBe('@FixtureViewer, you redeemed "Choose a topic" for 100 points. New balance: 50 points. A moderator will take care of it soon.');
    expect(say(`!redeem ${reward.id}`)).toBe('@FixtureViewer, "Choose a topic" costs 100 points and you have 50 points.');
    expectViewerSafe(sent, [reward.id]);
  });

  it("lists poll options, confirms the chosen option and explains raffle eligibility", async () => {
    const { bot, owner, settings, say, sent } = await setup();
    expect(say("!vote 1")).toBe("@FixtureViewer, there's no poll open right now.");
    expect(say("!enter")).toBe("@FixtureViewer, there's no raffle open right now.");
    const poll = bot.state.save(owner, "poll", undefined, { name: "Next game", options: ["Racing", "Puzzle", "Horror"], endsAt: Date.now() + 3600000 });
    expect(say("!vote")).toBe('Poll "Next game": vote with !vote <number>. 1) Racing · 2) Puzzle · 3) Horror');
    expect(say("!vote 7")).toBe("@FixtureViewer, vote with a number from 1 to 3: 1) Racing · 2) Puzzle · 3) Horror.");
    expect(say("!vote two")).toBe("@FixtureViewer, vote with a number from 1 to 3: 1) Racing · 2) Puzzle · 3) Horror.");
    expect(say("!vote 2")).toBe('@FixtureViewer, your vote for 2) "Puzzle" is in.');
    expect(say("!vote 3")).toBe("@FixtureViewer, you've already voted in this poll, and changing votes isn't allowed.");
    settings({ pointsEnabled: true });
    const raffle = bot.state.save(owner, "raffle", undefined, { name: "Game key", endsAt: Date.now() + 3600000, minPoints: 10 });
    expect(say("!enter")).toBe("@FixtureViewer, you need at least 10 points to enter this raffle. You have 0 points.");
    bot.engagement.adjust(owner, "456", 10, "fixture grant");
    expect(say("!enter")).toBe('@FixtureViewer, you\'re entered in the "Game key" raffle. Good luck!');
    bot.state.save(owner, "raffle", raffle.id, { ...raffle.data, minPoints: 0, roles: ["subscriber"] }, raffle.version);
    expect(say("!enter", { id: 789, username: "OtherViewer" })).toBe("@OtherViewer, this raffle is limited to certain viewers, so you can't enter it.");
    vi.setSystemTime(Date.now() + 3600000);
    expect(say("!vote")).toBe("@FixtureViewer, that poll has already closed.");
    expectViewerSafe(sent, [poll.id, raffle.id]);
  });

  it("groups !commands by enabled module within 500 characters and explains a group on request", async () => {
    const { bot, owner, settings, say, sent } = await setup();
    expect(say("!commands")).toBe("Commands — Info: !uptime !watchtime · Details: !commands <group>");
    settings({ mediaEnabled: true, pointsEnabled: true, rules: "Be kind." });
    bot.state.save(owner, "poll", undefined, { name: "Next game", options: ["Racing", "Puzzle"], endsAt: Date.now() + 3600000 });
    bot.state.save(owner, "command", undefined, { name: "Lurk", trigger: "!lurk", group: "Fun", responses: ["{user} is lurking"] });
    bot.state.save(owner, "command", undefined, { name: "Off", trigger: "!off", enabled: false, responses: ["hidden"] });
    expect(say("!commands")).toBe("Commands — Info: !uptime !rules !watchtime | Points: !points !top | Polls: !vote | Music: !sr !queue !nowplaying | Fun: !lurk · Details: !commands <group>");
    expect(say("!commands", { id: 900, username: "ModViewer", moderator: true })).toContain("| Mods: !so !skip |");
    expect(say("!commands music")).toBe("Music: !sr <YouTube link> — request a song · !queue — next songs · !nowplaying — current song");
    expect(say("!commands fun")).toBe("Fun: !lurk");
    expect(say("!commands nonsense")).toBe("That isn't a command group. Try one of: info, points, polls, music, fun.");
    // Viewer text is never echoed back, so the bot cannot be made to post mentions, links or abuse.
    const echoed = say("!commands @victim https://spam.example")!;
    expect(echoed).toBe("That isn't a command group. Try one of: info, points, polls, music, fun.");
    expect(echoed).not.toMatch(/victim|spam/);
    for (let i = 0; i < 60; i++) bot.state.save(owner, "command", undefined, { name: `Extra ${i}`, trigger: `!extra${String(i).padStart(2, "0")}aaaaaaaaaaaa`, responses: ["x"] });
    const summary = say("!commands")!;
    expect(summary.length).toBeLessThanOrEqual(500);
    expect(summary).toMatch(/\| General: !extra00a+ !extra01a+ .* \+\d+ \| Fun: !lurk · Details: !commands <group>$/);
    expect(say("!commands general")!.length).toBeLessThanOrEqual(500);
    // A custom "Mods" group never joins the moderator-only built-in group.
    bot.state.save(owner, "command", undefined, { name: "Hype", trigger: "!hype", group: "Mods", responses: ["Hype!"] });
    expect(say("!commands mods")).toBe("Mods: !hype");
    expect(say("!commands mods", { id: 900, username: "ModViewer", moderator: true })).toBe("Mods: !so <username> — shoutout · !skip — skip the current song | Mods: !hype");
    expectViewerSafe(sent.filter(text => !text.includes("!extra")));
  });
});
