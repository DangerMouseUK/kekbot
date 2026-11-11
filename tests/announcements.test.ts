import { rmSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "../src/server/auth.ts";
import { seedFixture } from "../src/server/fixture-seed.ts";
import { Runtime } from "../src/server/runtime.ts";
import { examples } from "../src/app/forms/examples.ts";
import { layouts } from "../src/app/forms/layouts.ts";
import { environment } from "./helpers.ts";

// Optional chat announcements about moderator decisions and raffle winners, with real SQLite
// and the fixture runtime. Synthetic identities only.
const cleanup: (() => void)[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const fn of cleanup.splice(0).reverse()) fn(); });

async function setup() {
  const context = environment(); cleanup.push(() => rmSync(context.root, { recursive: true, force: true }));
  await seedFixture(context.config);
  const runtime = new Runtime(context.config); cleanup.push(() => runtime.repository.store.close());
  const { bot, repository: repo } = runtime, db = repo.store.sqlite;
  const account = db.prepare("SELECT id FROM accounts WHERE role='owner'").get() as { id: string };
  const owner: Actor = { id: account.id, role: "owner", permissions: [] };
  // Live delivery must never be attempted in fixture mode.
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network disabled in tests"));
  const reply = vi.spyOn(runtime.kick, "reply");
  const settings = (patch: Record<string, unknown>) => {
    const doc = bot.state.document("instance");
    bot.state.save(owner, "settings", "instance", { ...(doc?.data ?? {}), ...patch }, doc?.version);
  };
  for (const [id, name] of [["501", "FixtureViewer"], ["502", "Other Viewer!"], ["503", "ThirdViewer"]])
    db.prepare("INSERT OR REPLACE INTO viewers(id,name,role,last_seen) VALUES(?,?,'viewer',?)").run(id, name, Date.now());
  const addMedia = (id: string, position: number, requester: string, status = "pending") =>
    db.prepare("INSERT INTO media(id,video_id,requester,title,uploader,duration,status,position,version,created_at) VALUES(?,?,?,?,?,?,?,?,1,?)").run(id, "abcdefghijk", requester, `Song ${position}`, "Synthetic uploader", 200, status, position, Date.now() + position);
  const version = (id: string) => (db.prepare("SELECT version FROM media WHERE id=?").get(id) as { version: number }).version;
  const job = (id: string) => db.prepare("SELECT kind,status,last_error AS error,payload,viewer_ids AS viewers FROM jobs WHERE id=?").get(id) as { kind: string; status: string; error: string | null; payload: string; viewers: string } | undefined;
  const text = (id: string) => (JSON.parse(job(id)!.payload) as { text: string }).text;
  const replies = (prefix: string) => (db.prepare("SELECT count(*) AS n FROM jobs WHERE kind='kick.reply' AND id LIKE ?").get(`${prefix}%`) as { n: number }).n;
  /** Run one queued job through the fixture worker, settling unrelated work first. */
  const deliver = async (id: string) => {
    for (let claimed = repo.claim(); claimed; claimed = repo.claim()) {
      if (claimed.id === id) return runtime.execute(claimed);
      repo.finish(claimed, "succeeded");
    }
    throw new Error(`job ${id} was not claimable`);
  };
  return { runtime, bot, repo, db, owner, settings, addMedia, version, job, text, replies, deliver, fetch, reply };
}

describe("moderator decision replies", () => {
  it("stays silent by default so existing installations keep their behaviour", async () => {
    const { bot, owner, addMedia, version, replies } = await setup();
    expect(bot.state.settings).toMatchObject({ mediaDecisionReplies: false, raffleChatAnnouncements: false });
    // The editor starts them off too, and the request switch sits beside the media switch that reveals it.
    expect(examples.settings).toMatchObject({ mediaDecisionReplies: false, raffleChatAnnouncements: false });
    const section = (key: string) => layouts.settings.find((group) => group.fields.some((field) => field.key === key))?.title;
    expect(section("mediaDecisionReplies")).toBe(section("mediaEnabled"));
    expect(section("raffleChatAnnouncements")).toBe("Chat announcements");
    addMedia("song-a", 1, "501"); addMedia("song-b", 2, "501");
    bot.media.decide(owner, "song-a", version("song-a"), "approve");
    bot.media.decide(owner, "song-b", version("song-b"), "reject");
    expect(replies("media-decision:")).toBe(0);
  });

  it("tells the viewer once about approval or rejection, never on removal or reorder, and delivers nothing live in fixture mode", async () => {
    const { bot, repo, owner, settings, addMedia, version, job, text, replies, deliver, fetch, reply } = await setup();
    settings({ mediaDecisionReplies: true });
    addMedia("playing", 1, "503", "approved"); addMedia("song-a", 2, "501"); addMedia("song-b", 3, "502"); addMedia("song-c", 4, "503");
    bot.media.decide(owner, "song-a", version("song-a"), "approve");
    expect(text("media-decision:song-a")).toBe('@FixtureViewer, your request #2 "Song 2" was approved and is 2nd in line.');
    // The job is tied to the viewer for erasure and rechecks the deciding moderator at delivery.
    const queued = job("media-decision:song-a")!;
    expect(JSON.parse(queued.viewers)).toEqual(["501"]);
    expect(JSON.parse(queued.payload)).toMatchObject({ requester: "501", actor: { id: owner.id }, permission: "media" });
    expect(() => bot.operations.eraseViewer(owner, "501")).toThrow("privacy_processing_pending_retry_after_jobs_complete");
    // A name that is not a plain Kick username is never @mentioned.
    bot.media.decide(owner, "song-b", version("song-b"), "reject");
    expect(text("media-decision:song-b")).toBe('Request #3 "Song 3" wasn\'t approved.');
    // A stale retry of the same decision is refused, and later decisions on the item stay silent.
    expect(() => bot.media.decide(owner, "song-a", 1, "approve")).toThrow("media_changed_reload");
    bot.media.reorder(owner, ["song-a", "playing"]);
    bot.media.decide(owner, "song-a", version("song-a"), "remove");
    bot.media.decide(owner, "song-c", version("song-c"), "remove");
    expect(replies("media-decision:")).toBe(2);
    expect(text("media-decision:song-a")).toContain("was approved");
    // Fixture delivery confirms the job without calling Kick.
    await deliver("media-decision:song-a");
    expect(job("media-decision:song-a")).toMatchObject({ status: "succeeded", error: null });
    expect(repo.setting("fixture_last_reply")).toBe("media-decision:song-a");
    // The durable effect ID keeps a delivered announcement from being queued again.
    bot.state.effect("media-decision:song-a", "kick.reply", { requester: "501", text: "duplicate" });
    expect(replies("media-decision:")).toBe(2); expect(job("media-decision:song-a")!.status).toBe("succeeded");
    expect(fetch).not.toHaveBeenCalled(); expect(reply).not.toHaveBeenCalled();
  });

  it("rechecks the owner's switch and the moderator's current grant before sending", async () => {
    const { bot, owner, settings, addMedia, version, job, deliver, fetch, reply } = await setup();
    settings({ mediaDecisionReplies: true });
    addMedia("song-a", 1, "501"); addMedia("song-b", 2, "503");
    bot.media.decide(owner, "song-a", version("song-a"), "approve");
    settings({ mediaDecisionReplies: false });
    await deliver("media-decision:song-a");
    expect(job("media-decision:song-a")).toMatchObject({ status: "failed", error: "chat_announcement_turned_off" });
    // A Discord moderator whose route is removed before delivery no longer speaks for the channel.
    settings({ mediaDecisionReplies: true });
    const route = bot.state.save(owner, "guild", "announce-route", { name: "Synthetic guild", guildId: "100", channelId: "200", roles: [{ id: "300", permission: "media" }] });
    const moderator: Actor = { id: "discord:100:400", role: "moderator", permissions: ["media"], discord: { guild: "100", channel: "200", roles: ["300"], user: "400" } };
    bot.media.decide(moderator, "song-b", version("song-b"), "approve");
    bot.state.remove(owner, route.id, route.version);
    await deliver("media-decision:song-b");
    expect(job("media-decision:song-b")!.status).toBe("failed");
    expect(fetch).not.toHaveBeenCalled(); expect(reply).not.toHaveBeenCalled();
  });
});

describe("raffle winner announcements", () => {
  async function raffle(context: Awaited<ReturnType<typeof setup>>, id: string, entrants: string[]) {
    context.bot.state.save(context.owner, "raffle", id, { name: "Giveaway", endsAt: Date.now() + 3600000, status: "closed" });
    for (const viewer of entrants) context.db.prepare("INSERT INTO participation(id,activity,viewer,choice,at) VALUES(?,?,?,'entry',?)").run(`${id}:${viewer}`, id, viewer, Date.now());
  }

  it("announces each drawn and redrawn winner once when the owner turns it on", async () => {
    const context = await setup(), { bot, owner, settings, job, text, replies, deliver, fetch, reply } = context;
    await raffle(context, "quiet", ["501"]);
    expect(bot.engagement.draw(owner, "quiet").winner).toBe("501");
    expect(replies("raffle-winner:")).toBe(0);

    settings({ raffleChatAnnouncements: true });
    await raffle(context, "giveaway", ["501", "503"]);
    const first = bot.engagement.draw(owner, "giveaway");
    const names: Record<string, string> = { "501": "FixtureViewer", "503": "ThirdViewer" };
    expect(text(`raffle-winner:giveaway:${first.winner}`)).toBe(`Congratulations @${names[first.winner]}, you won the "Giveaway" raffle!`);
    expect(JSON.parse(job(`raffle-winner:giveaway:${first.winner}`)!.payload)).toMatchObject({ viewer: first.winner, permission: "engage" });
    expect(JSON.parse(job(`raffle-winner:giveaway:${first.winner}`)!.viewers)).toEqual([first.winner]);
    const second = bot.engagement.draw(owner, "giveaway", true);
    expect(second.winner).not.toBe(first.winner);
    expect(text(`raffle-winner:giveaway:${second.winner}`)).toBe(`The "Giveaway" raffle was redrawn. Congratulations @${names[second.winner]}, you won!`);
    // No eligible entrant is left: nothing more is announced.
    expect(() => bot.engagement.draw(owner, "giveaway", true)).toThrow("no_eligible_entries");
    expect(replies("raffle-winner:")).toBe(2);
    await deliver(`raffle-winner:giveaway:${first.winner}`);
    expect(job(`raffle-winner:giveaway:${first.winner}`)!.status).toBe("succeeded");
    bot.state.effect(`raffle-winner:giveaway:${first.winner}`, "kick.reply", { viewer: first.winner, text: "duplicate" });
    expect(replies("raffle-winner:")).toBe(2);
    expect(fetch).not.toHaveBeenCalled(); expect(reply).not.toHaveBeenCalled();
  });

  it("names the raffle instead of a winner whose name is unsafe, and skips announcements turned off before delivery", async () => {
    const context = await setup(), { bot, owner, settings, job, text, deliver } = context;
    settings({ raffleChatAnnouncements: true });
    await raffle(context, "unsafe", ["502"]);
    bot.engagement.draw(owner, "unsafe");
    expect(text("raffle-winner:unsafe:502")).toBe('The "Giveaway" raffle has a winner. Congratulations!');
    settings({ raffleChatAnnouncements: false });
    await deliver("raffle-winner:unsafe:502");
    expect(job("raffle-winner:unsafe:502")).toMatchObject({ status: "failed", error: "chat_announcement_turned_off" });
  });
});
