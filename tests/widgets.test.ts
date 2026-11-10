import { afterEach, describe, expect, it } from "vitest";
import { readFileSync, rmSync } from "node:fs";
import { AuthService } from "../src/server/auth.ts";
import { BotService } from "../src/server/domain/bot.ts";
import { configSchemas, widgetThemes } from "../src/server/domain/catalog.ts";
import {
  alertKicker, chatFade, clockOffset, formatCountdown, formatDuration, formatElapsed, formatNumber, goalProgress, pollRows,
  relativeTime, rowKeys, socialLines, socialPlatform, splitHighlight, supportLabel, timedPhase
} from "../src/app/widgets/format.ts";
import { environment, repository } from "./helpers.ts";

describe("widget presentation helpers", () => {
  it("labels supporter events for humans instead of printing provider event names", () => {
    expect(supportLabel({ event: "channel.followed" })).toBe("followed");
    expect(supportLabel({ event: "channel.subscription.new", months: 1 })).toBe("subscribed");
    expect(supportLabel({ event: "channel.subscription.new", months: 3 })).toBe("subscribed for 3 months");
    expect(supportLabel({ event: "channel.subscription.renewal", months: 12 })).toBe("resubscribed for 12 months");
    expect(supportLabel({ event: "channel.subscription.renewal", months: null })).toBe("resubscribed");
    expect(supportLabel({ event: "channel.subscription.gifts", gifts: 1 })).toBe("gifted a sub");
    expect(supportLabel({ event: "channel.subscription.gifts", gifts: 5 })).toBe("gifted 5 subs");
    expect(supportLabel({ event: "something.else" })).toBe("supported the stream");
    expect(alertKicker("channel.subscription.gifts")).toBe("Gifted subs");
    expect(alertKicker("unknown")).toBe("Alert");
  });
  it("formats countdowns as hh:mm:ss with days, elapsed time and media durations", () => {
    expect(formatCountdown(0)).toBe("00:00:00");
    expect(formatCountdown(-5000)).toBe("00:00:00");
    expect(formatCountdown(200)).toBe("00:00:01");
    expect(formatCountdown(59 * 60000 + 59000)).toBe("00:59:59");
    expect(formatCountdown(3 * 3600000 + 4 * 60000 + 5000)).toBe("03:04:05");
    expect(formatCountdown(86400000 + 3661000)).toBe("1d 01:01:01");
    expect(formatElapsed(65000)).toBe("1:05");
    expect(formatElapsed(3600000 + 5000)).toBe("1:00:05");
    expect(formatDuration(225)).toBe("3:45");
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(0)).toBeNull();
  });
  it("produces poll percentages that sum to 100 and marks the leader", () => {
    const thirds = pollRows(["A", "B", "C"], [{ choice: "1", count: 1 }, { choice: "2", count: 1 }, { choice: "3", count: 1 }]);
    expect(thirds.total).toBe(3);
    expect(thirds.rows.map(row => row.percent).reduce((a, b) => a + b, 0)).toBe(100);
    const skewed = pollRows(["Game", "Chat"], [{ choice: "1", count: 7 }, { choice: "2", count: 3 }]);
    expect(skewed.rows.map(row => [row.number, row.label, row.percent, row.leading])).toEqual([[1, "Game", 70, true], [2, "Chat", 30, false]]);
    const empty = pollRows(["A", "B"], []);
    expect(empty.rows.map(row => row.percent)).toEqual([0, 0]);
    expect(empty.rows.some(row => row.leading)).toBe(false);
  });
  it("reports goal completion and clamps progress", () => {
    expect(goalProgress(25, 100)).toEqual({ percent: 25, complete: false });
    expect(goalProgress(150, 100)).toEqual({ percent: 100, complete: true });
    expect(goalProgress(-3, 0)).toEqual({ percent: 0, complete: false });
  });
  it("times alerts and shoutouts with the server clock rather than the OBS host clock", () => {
    // An OBS host that is ten minutes fast still shows an alert the server just started.
    const serverNow = 1_000_000, localNow = serverNow + 600_000;
    const offset = clockOffset(serverNow, localNow);
    expect(offset).toBe(-600_000);
    const alert = { startsAt: serverNow, endsAt: serverNow + 5000 };
    expect(timedPhase(alert, localNow)).toBe("hidden");
    expect(timedPhase(alert, localNow + offset)).toBe("showing");
    expect(timedPhase(alert, serverNow + 4600)).toBe("leaving");
    expect(timedPhase(alert, serverNow + 5000)).toBe("hidden");
    expect(timedPhase({ endsAt: null }, serverNow)).toBe("showing");
    expect(clockOffset(undefined, localNow)).toBe(0);
  });
  it("fades chat only when configured", () => {
    expect(chatFade(0, 120_000, 0)).toBe("visible");
    expect(chatFade(0, 28_999, 30)).toBe("visible");
    expect(chatFade(0, 29_500, 30)).toBe("fading");
    expect(chatFade(0, 30_000, 30)).toBe("gone");
  });
  it("formats relative times, numbers, socials, highlights and row keys", () => {
    expect(relativeTime(0, 10_000)).toBe("just now");
    expect(relativeTime(0, 5 * 60_000)).toBe("5m ago");
    expect(relativeTime(0, 3 * 3_600_000)).toBe("3h ago");
    expect(formatNumber(1234)).toBe("1,234");
    expect(formatNumber(1_250_000)).toBe("1.3M");
    expect(formatNumber("not a number")).toBe("0");
    expect(socialLines("x.com/creator | youtube.com/@creator\nDiscord: discord.gg/example")).toEqual(["x.com/creator", "youtube.com/@creator", "Discord: discord.gg/example"]);
    expect(socialPlatform("https://x.com/creator")).toBe("X");
    expect(socialPlatform("youtube.com/@creator")).toBe("YouTube");
    expect(socialPlatform("Discord: discord.gg/example")).toBe("Discord");
    expect(socialPlatform("box.com/files")).toBeNull();
    expect(splitHighlight("Thanks for following, Ada!", "Ada")).toEqual(["Thanks for following, ", "Ada", "!"]);
    expect(splitHighlight("<b>markup</b> stays literal", null)).toEqual(["<b>markup</b> stays literal"]);
    expect(rowKeys([{ at: 1, name: "a" }, { at: 1, name: "a" }, { at: 2, name: "a" }])).toEqual(["1:a", "1:a:1", "2:a"]);
  });
});

const cleanup: (() => void)[] = [];
afterEach(() => { for (const fn of cleanup.splice(0).reverse()) fn(); });
async function setup() {
  const env = environment(); cleanup.push(() => rmSync(env.root, { recursive: true, force: true }));
  const repo = repository(env.config); cleanup.push(() => repo.store.close());
  const auth = new AuthService(repo), bot = new BotService(repo, env.config);
  const login = await auth.setup(readFileSync(env.config.setupTokenFile, "utf8").trim(), { username: "owner", password: "a strong fixture password" });
  return { repo, bot, owner: auth.session(login.token) };
}

describe("widget projection with real SQLite", () => {
  it("keeps existing widget documents valid by defaulting every new presentation option", () => {
    const legacy = configSchemas.widget.parse({ name: "Old alerts", type: "alerts", theme: "midnight", width: 800, height: 400, limit: 10, target: "", text: "", endsAt: null, reducedMotion: false });
    expect(legacy).toMatchObject({ accent: "theme", fontScale: 1, align: "auto", backdrop: "theme", layout: "card", title: "", showTitle: true, showDetails: true, showEmpty: true, showUptime: true, showViewers: true, endText: "", shoutoutSeconds: 20, chatFadeSeconds: 0 });
    expect(widgetThemes).toEqual(expect.arrayContaining(["mint", "midnight", "paper"]));
    expect(configSchemas.widget.safeParse({ name: "Bad", type: "chat", accent: "#ff0000" }).success).toBe(false);
    expect(configSchemas.widget.safeParse({ name: "Bad", type: "chat", fontScale: 10 }).success).toBe(false);
  });
  it("expires the shoutout card after the configured duration and stamps the server clock", async () => {
    const { bot, owner, repo } = await setup();
    bot.state.save(owner, "widget", "shout", { name: "Shoutout", type: "shoutout", shoutoutSeconds: 15 });
    bot.state.save(owner, "widget", "sticky", { name: "Sticky shoutout", type: "shoutout", shoutoutSeconds: 0 });
    expect(bot.presentation.widget("shout", 5000)).toMatchObject({ data: null, now: 5000 });
    repo.set("last_shoutout", JSON.stringify({ name: "friend_channel", url: "https://kick.com/friend_channel", at: 100_000 }));
    expect(bot.presentation.widget("shout", 100_000 + 14_999)).toMatchObject({ data: { name: "friend_channel", expiresAt: 115_000 }, now: 114_999 });
    expect(bot.presentation.widget("shout", 115_000).data).toBeNull();
    expect(bot.presentation.widget("sticky", 10_000_000).data).toMatchObject({ name: "friend_channel", expiresAt: null });
  });
  it("projects chat roles and supporter details for human labels", async () => {
    const { bot, owner, repo } = await setup();
    bot.state.save(owner, "widget", "chat", { name: "Chat", type: "chat" });
    bot.state.save(owner, "widget", "feed", { name: "Feed", type: "eventfeed" });
    repo.acceptReceipt("mod-line", "chat.message.sent", { content: "hello chat", message_id: "m1", sender: { user_id: 789, username: "helpful_mod", identity: { badges: [{ type: "moderator" }] } }, broadcaster: { user_id: 123 } });
    bot.event(repo.claim()!);
    const chat = bot.presentation.widget("chat").data as { name: string; role: string; at: number }[];
    expect(chat).toEqual([expect.objectContaining({ name: "helpful_mod", text: "hello chat", role: "moderator", at: expect.any(Number) })]);
    repo.acceptReceipt("sub-event", "channel.subscription.renewal", { subscriber: { user_id: 456, username: "loyal_viewer" }, duration: 6, created_at: "2026-01-01T00:00:00Z", expires_at: "2026-02-01T00:00:00Z", broadcaster: { user_id: 123 } });
    repo.acceptReceipt("gift-event", "channel.subscription.gifts", { gifter: { user_id: null, username: null }, giftees: [{ user_id: 1 }, { user_id: 2 }, { user_id: 3 }], created_at: "2026-01-01T00:00:00Z", expires_at: "2026-02-01T00:00:00Z", broadcaster: { user_id: 123 } });
    const feed = bot.presentation.widget("feed").data as Record<string, unknown>[];
    const gift = feed.find(row => row.event === "channel.subscription.gifts")!, renewal = feed.find(row => row.event === "channel.subscription.renewal")!;
    expect(gift).toMatchObject({ name: "Anonymous", gifts: 3, months: null });
    expect(renewal).toMatchObject({ name: "loyal_viewer", months: 6 });
    expect(supportLabel(gift)).toBe("gifted 3 subs");
    expect(supportLabel(renewal)).toBe("resubscribed for 6 months");
  });
  it("passes the supporter name to alerts as a literal highlight", async () => {
    const { bot, owner } = await setup();
    bot.state.save(owner, "alert", "follow", { name: "Follow", event: "channel.followed", template: "Thanks for following, {user}!" });
    const preview = bot.presentation.alert("channel.followed", { user: "<img src=x>", name: "<img src=x>" }, "preview", true) as { alerts: { text: string; highlight: string }[] };
    expect(preview.alerts[0]).toMatchObject({ text: "Thanks for following, <img src=x>!", highlight: "<img src=x>" });
    expect(splitHighlight(preview.alerts[0].text, preview.alerts[0].highlight)[1]).toBe("<img src=x>");
  });
});
