import { afterEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { readAnalytics, streamHistory } from "../src/server/domain/analytics.ts";
import { localDay, localMidnight } from "../src/server/domain/analytics-time.ts";
import { metricInfo } from "../src/server/domain/analytics-metrics.ts";
import { BotService } from "../src/server/domain/bot.ts";
import { csv } from "../src/server/domain/operations.ts";
import { environment, repository } from "./helpers.ts";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const fn of cleanup.splice(0).reverse()) fn();
});

const MINUTE = 60_000,
  HOUR = 60 * MINUTE,
  DAY = 24 * HOUR;
// Fixed synthetic timeline: two observed streams on consecutive days.
const T0 = Date.UTC(2026, 10, 1, 18, 0);
const NOW = T0 + 3 * DAY;
const A = { id: "stream-a", start: T0, end: T0 + 2 * HOUR };
const B = { id: "stream-b", start: T0 + DAY, end: T0 + DAY + 90 * MINUTE };
const CONTEXT = { now: NOW, summaryDays: 90 };
const COLUMNS = ["day", "metric", "label", "unit", "value", "samples", "minimum", "maximum"];

function setup() {
  const env = environment();
  cleanup.push(() => rmSync(env.root, { recursive: true, force: true }));
  const repo = repository(env.config);
  cleanup.push(() => repo.store.close());
  const db = repo.store.sqlite;
  let sequence = 0;
  const observe = (metric: string, value: number, at: number, id = `t:${sequence++}`) =>
    db
      .prepare("INSERT INTO observations(id,metric,value,at) VALUES(?,?,?,?)")
      .run(id, metric, value, at);
  const receipt = (id: string, type: string, at: number) =>
    db
      .prepare("INSERT INTO receipts(id,event_type,payload,received_at) VALUES(?,?,NULL,?)")
      .run(id, type, at);
  // Stream A: worker minutes 0–61 and 80–120, so the worker was offline from minute 61 to 80.
  for (let m = 0; m <= 120; m++) if (m <= 61 || m >= 80) observe("worker.minute", 1, A.start + m * MINUTE);
  for (let i = 0; i < 5; i++) observe("chat.messages", 1, A.start + (5 + i) * MINUTE);
  observe("chat.distinct", 1, A.start + 5 * MINUTE);
  observe("chat.distinct", 1, A.start + 6 * MINUTE);
  observe("commands.executed", 1, A.start + 7 * MINUTE);
  observe("support.follow", 1, A.start + 20 * MINUTE);
  observe("support.follow", 1, A.start + 21 * MINUTE);
  receipt("sub-new", "channel.subscription.new", A.start + 30 * MINUTE);
  receipt("sub-gift", "channel.subscription.gifts", A.start + 31 * MINUTE);
  observe("support.subscription", 1, A.start + 30 * MINUTE, "support:sub-new");
  observe("support.subscription", 5, A.start + 31 * MINUTE, "support:sub-gift");
  // Its receipt has already expired under the shorter receipt retention.
  observe("support.subscription", 1, A.start + 32 * MINUTE, "support:sub-expired");
  observe("viewers.sample", 10, A.start + 10 * MINUTE);
  observe("viewers.sample", 30, A.start + 11 * MINUTE);
  observe("watchtime.estimated_minutes", 5, A.start + 15 * MINUTE);
  observe("points.accrued", 10, A.start + 15 * MINUTE);
  observe("points.accrued", 10, A.start + 20 * MINUTE);
  observe("rewards.requested", 1, A.start + 40 * MINUTE);
  observe("media.requests", 1, A.start + 41 * MINUTE);
  observe("media.requests", 1, A.start + 42 * MINUTE);
  observe("media.completed", 1, A.start + 50 * MINUTE);
  observe("moderation.incidents", 1, A.start + 55 * MINUTE);
  for (let i = 0; i < 3; i++) observe("polls.votes", 1, A.start + 90 * MINUTE + i);
  for (let i = 0; i < 4; i++) observe("raffles.entries", 1, A.start + 95 * MINUTE + i);
  observe("=future.metric", 7, A.start + 100 * MINUTE);
  // Stream B: complete worker coverage, a few messages and no viewer samples.
  for (let m = 0; m <= 90; m++) observe("worker.minute", 1, B.start + m * MINUTE);
  for (let i = 0; i < 3; i++) observe("chat.messages", 1, B.start + (10 + i) * MINUTE);
  const history = JSON.stringify([A, B]);
  const read = (query: { from: number; to: number; stream?: string; timeZone?: string }) =>
    readAnalytics(db, history, query, CONTEXT);
  return { db, read, history, observe };
}

const metric = (result: ReturnType<typeof readAnalytics>, id: string) =>
  result.summary.metrics.find((item) => item.id === id)!;

describe("analytics read model over real SQLite", () => {
  it("summarises a selected stream with plain labels, units and unknown kept apart from zero", () => {
    const { read } = setup();
    const result = read({ from: 0, to: NOW, stream: "stream-a" });
    expect(result.selection.kind).toBe("stream");
    expect([result.from, result.to]).toEqual([A.start, A.end]);
    expect(metric(result, "chat.messages")).toMatchObject({
      label: "Chat messages",
      unit: "messages",
      value: 5,
    });
    expect(metric(result, "chat.distinct").value).toBe(2);
    expect(metric(result, "commands.executed").value).toBe(1);
    expect(metric(result, "support.follow").value).toBe(2);
    expect(metric(result, "support.subscription").value).toBe(7);
    expect(result.summary.subscriptions).toEqual({
      new: 1,
      renewal: 0,
      gifted: 5,
      typeNotRetained: 1,
    });
    expect(metric(result, "viewers.sample")).toMatchObject({
      value: 20,
      peak: 30,
      minimum: 10,
      samples: 2,
    });
    expect(metric(result, "watchtime.estimated_minutes")).toMatchObject({
      label: "Estimated watchtime",
      kind: "estimate",
      value: 5,
    });
    expect(metric(result, "points.accrued").value).toBe(20);
    expect(metric(result, "rewards.requested").value).toBe(1);
    expect(metric(result, "media.requests").value).toBe(2);
    expect(metric(result, "media.completed").value).toBe(1);
    expect(metric(result, "moderation.incidents").value).toBe(1);
    expect(metric(result, "polls.votes").value).toBe(3);
    expect(metric(result, "raffles.entries").value).toBe(4);
    // Nothing observed while the worker ran: a real zero.
    expect(metric(result, "raffles.draws").value).toBe(0);
    // Unlabelled future metrics still appear under their raw ID.
    expect(metric(result, "=future.metric")).toMatchObject({
      label: "=future.metric",
      known: false,
      value: 7,
    });
    expect(metricInfo("worker.minute").known).toBe(false);
    expect(result.summary.metrics.some((item) => item.id === "worker.minute")).toBe(false);

    const second = read({ from: 0, to: NOW, stream: "stream-b" });
    expect(metric(second, "chat.messages").value).toBe(3);
    expect(metric(second, "support.follow").value).toBe(0);
    // Not sampled is unknown, never a zero-viewer stream.
    expect(metric(second, "viewers.sample")).toMatchObject({ value: null, peak: null, samples: 0 });
  });

  it("reports worker gaps in words-ready windows and separates retention and pre-install gaps", () => {
    const { read } = setup();
    const coverage = read({ from: 0, to: NOW, stream: "stream-a" }).coverage;
    expect(coverage.workerMinutes).toBe(62 + 41);
    expect(coverage.expectedMinutes).toBe(120);
    expect(coverage.gaps).toEqual([
      { from: A.start + 61 * MINUTE, to: A.start + 80 * MINUTE, reason: "worker_offline" },
    ]);
    expect(coverage.windows).toEqual([
      { from: A.start, to: A.start + 61 * MINUTE },
      { from: A.start + 80 * MINUTE, to: A.end },
    ]);
    expect(read({ from: 0, to: NOW, stream: "stream-b" }).coverage.gaps).toEqual([]);

    // Before the first worker record nothing is known: unknown, not zero.
    const before = read({ from: T0 - 2 * DAY, to: T0 - DAY });
    expect(metric(before, "chat.messages").value).toBeNull();
    expect(before.coverage.gaps).toEqual([
      { from: T0 - 2 * DAY, to: T0 - DAY, reason: "before_first_record" },
    ]);
    // A range ending before the retention horizon is labelled as such.
    const old = read({ from: NOW - 200 * DAY, to: NOW - 100 * DAY });
    expect(old.coverage.gaps.map((gap) => gap.reason)).toEqual(["not_retained"]);
    // A range straddling the horizon splits its leading gap there.
    expect(read({ from: NOW - 100 * DAY, to: NOW - 80 * DAY }).coverage.gaps).toEqual([
      { from: NOW - 100 * DAY, to: NOW - 90 * DAY, reason: "not_retained" },
      { from: NOW - 90 * DAY, to: NOW - 80 * DAY, reason: "before_first_record" },
    ]);
    // The coverage gap never extends into the future.
    const open = read({ from: B.start, to: NOW + DAY });
    expect(open.coverage.observedUntil).toBe(NOW);
    expect(open.coverage.gaps.at(-1)).toEqual({
      from: B.end,
      to: NOW,
      reason: "worker_offline",
    });
  });

  it("filters exactly by range and compares the streams inside it, newest first", () => {
    const { read } = setup();
    const firstDay = read({ from: T0 - HOUR, to: T0 + 12 * HOUR });
    expect(metric(firstDay, "chat.messages").value).toBe(5);
    expect(firstDay.summaries.map((item) => item.id)).toEqual(["stream-a"]);
    const both = read({ from: T0 - HOUR, to: NOW });
    expect(metric(both, "chat.messages").value).toBe(8);
    expect(both.summary.streamsInRange).toBe(2);
    expect(both.summaries.map((item) => item.id)).toEqual(["stream-b", "stream-a"]);
    expect(both.summaries[1].metrics["viewers.sample"]).toEqual({ value: 20, peak: 30 });
    expect(both.summaries[0].metrics["viewers.sample"]).toEqual({ value: null, peak: null });
    expect(both.summaries[1].workerMinutes).toBe(103);
    // The picker lists every observed stream, newest first, with durations.
    expect(both.streams.map((item) => [item.id, item.durationMs])).toEqual([
      ["stream-b", 90 * MINUTE],
      ["stream-a", 2 * HOUR],
    ]);
    // "latest" resolves to the newest stream; unknown streams and bad ranges are rejected.
    expect(read({ from: 0, to: NOW, stream: "latest" }).selection.stream?.id).toBe("stream-b");
    expect(() => read({ from: 0, to: NOW, stream: "missing" })).toThrow("stream_not_observed");
    expect(() => read({ from: NOW, to: NOW - 1 })).toThrow("invalid_analytics_range");
    expect(() => read({ from: 0, to: 4000 * DAY })).toThrow("invalid_analytics_range");
    // Valid numbers outside the four-digit-year date range are rejected, not a server error.
    expect(() => read({ from: 9e15, to: 9e15 })).toThrow("invalid_analytics_range");
    expect(() => read({ from: T0, to: NOW, timeZone: "Mars/Olympus" })).toThrow("invalid_time_zone");
    // A malformed stored entry is skipped instead of hiding every observed stream.
    expect(streamHistory(JSON.stringify([{ id: 7 }, A, "x"])).map((item) => item.id)).toEqual([
      "stream-a",
    ]);
    expect(streamHistory("not json")).toEqual([]);
  });

  it("builds bucketed series that keep worker gaps unknown", () => {
    const { read } = setup();
    const { series } = read({ from: 0, to: NOW, stream: "stream-a" });
    expect(series.bucketMs).toBe(5 * MINUTE);
    expect(series.buckets).toHaveLength(24);
    expect(series.bucketUnit).toBe("fixed");
    // The last bucket also holds the observation exactly at the stream end (minutes 115–120).
    expect(series.buckets[23].workerMinutes).toBe(6);
    const messages = series.metrics["chat.messages"];
    expect(messages[1]).toEqual({ value: 5, samples: 5 });
    expect(messages[2]).toEqual({ value: 0, samples: 0 });
    // Minutes 65–70 fall entirely inside the worker gap.
    expect(series.buckets[13].workerMinutes).toBe(0);
    expect(messages[13]).toBeNull();
    expect(series.metrics["viewers.sample"][2]).toEqual({ value: 20, peak: 30, samples: 2 });
    expect(series.metrics["viewers.sample"][3]).toBeNull();
    // A week of history uses daily buckets aligned to the requested start.
    const week = read({ from: T0 - 5 * DAY, to: T0 + 2 * DAY - 1 });
    expect(week.series.bucketUnit).toBe("day");
    // The first day starts at the requested instant; later days at UTC midnight (the default zone).
    expect(week.series.buckets.map((bucket) => bucket.day)).toEqual([
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
    ]);
    expect(week.series.buckets[0].from).toBe(T0 - 5 * DAY);
    expect(week.series.buckets[5].from).toBe(Date.UTC(2026, 10, 1));
  });

  it("exports exactly the selection as escaped CSV in the viewer's day boundaries", () => {
    const { read } = setup();
    const stream = read({ from: 0, to: NOW, stream: "stream-a" });
    const text = csv(stream.rows, COLUMNS);
    const lines = text.split("\r\n");
    expect(lines[0]).toBe(COLUMNS.map((column) => `"${column}"`).join(","));
    expect(lines).toContain('"2026-11-01","chat.messages","Chat messages","messages","5","5","1","1"');
    // Only stream A's day; stream B's messages are outside the selection.
    expect(stream.rows.every((row) => row.day === "2026-11-01")).toBe(true);
    // Formula-looking metric IDs stay neutralised by the existing CSV escaping.
    expect(text).toContain(`"'=future.metric","'=future.metric"`);
    // Days follow the viewer's UTC offset: 18:00 UTC is the next day at UTC+10.
    const shifted = read({ from: 0, to: NOW, stream: "stream-a", timeZone: "Australia/Brisbane" });
    expect(shifted.rows.every((row) => row.day === "2026-11-02")).toBe(true);
    // An empty selection still exports a header row.
    expect(csv(read({ from: T0 - 2 * DAY, to: T0 - DAY }).rows, COLUMNS)).toBe(
      COLUMNS.map((column) => `"${column}"`).join(","),
    );
  });

  it("is reachable through OperationsService without recording anything", async () => {
    const env = environment();
    cleanup.push(() => rmSync(env.root, { recursive: true, force: true }));
    const repo = repository(env.config);
    cleanup.push(() => repo.store.close());
    const bot = new BotService(repo, env.config);
    const count = () =>
      repo.store.sqlite.prepare("SELECT (SELECT count(*) FROM observations) + (SELECT count(*) FROM settings) AS n").get();
    const before = count();
    const result = bot.operations.analytics(Date.now() - DAY, Date.now(), "latest", {
      timeZone: "Europe/Paris",
    });
    expect(result.selection).toMatchObject({
      kind: "range",
      stream: null,
      timeZone: "Europe/Paris",
    });
    expect(count()).toEqual(before);
  });
});

describe("analytics days follow the viewer's real local midnights", () => {
  const H = HOUR;
  const dstSetup = () => {
    const env = environment();
    cleanup.push(() => rmSync(env.root, { recursive: true, force: true }));
    const repo = repository(env.config);
    cleanup.push(() => repo.store.close());
    let n = 0;
    const observe = (at: number) =>
      repo.store.sqlite
        .prepare("INSERT INTO observations(id,metric,value,at) VALUES(?,?,?,?)")
        .run(`dst:${n++}`, "chat.messages", 1, at);
    const read = (from: number, to: number, timeZone: string) =>
      readAnalytics(repo.store.sqlite, "[]", { from, to, timeZone }, {
        now: Date.UTC(2026, 10, 10),
        summaryDays: 90,
      });
    return { observe, read };
  };
  const consecutive = (first: string, count: number) =>
    Array.from({ length: count }, (_, i) =>
      new Date(Date.parse(`${first}T00:00:00Z`) + i * DAY).toISOString().slice(0, 10),
    );

  it("keeps Europe/London days distinct across the 25 October 2026 change", () => {
    const { observe, read } = dstSetup();
    // 00:30 local on each side of the change; British Summer Time ends at 01:00 UTC on 25 Oct.
    observe(Date.UTC(2026, 9, 23, 23, 30)); // 24 Oct 00:30 BST
    observe(Date.UTC(2026, 9, 24, 23, 30)); // 25 Oct 00:30 BST
    observe(Date.UTC(2026, 9, 26, 0, 30)); // 26 Oct 00:30 GMT
    const from = localMidnight(2026, 10, 20, "Europe/London");
    expect(from).toBe(Date.UTC(2026, 9, 19, 23));
    const result = read(from, Date.UTC(2026, 9, 30, 12), "Europe/London");
    expect(result.series.bucketUnit).toBe("day");
    const days = result.series.buckets.map((bucket) => bucket.day);
    expect(days).toEqual(consecutive("2026-10-20", 11));
    const change = result.series.buckets[days.indexOf("2026-10-25")];
    expect([change.from, change.to]).toEqual([Date.UTC(2026, 9, 24, 23), Date.UTC(2026, 9, 26)]);
    expect(change.to - change.from).toBe(25 * H);
    const messages = result.series.metrics["chat.messages"];
    expect(messages[days.indexOf("2026-10-24")]).toMatchObject({ value: 1 });
    expect(messages[days.indexOf("2026-10-25")]).toMatchObject({ value: 1 });
    expect(messages[days.indexOf("2026-10-26")]).toMatchObject({ value: 1 });
    expect(result.rows.map((row) => [row.day, row.value])).toEqual([
      ["2026-10-24", 1],
      ["2026-10-25", 1],
      ["2026-10-26", 1],
    ]);
  });

  it("keeps America/New_York days distinct across the 1 November 2026 change", () => {
    const { observe, read } = dstSetup();
    observe(Date.UTC(2026, 10, 1, 4, 30)); // 1 Nov 00:30 EDT
    observe(Date.UTC(2026, 10, 2, 4, 30)); // 1 Nov 23:30 EST
    observe(Date.UTC(2026, 10, 2, 5, 30)); // 2 Nov 00:30 EST
    const from = localMidnight(2026, 10, 28, "America/New_York");
    expect(from).toBe(Date.UTC(2026, 9, 28, 4));
    const result = read(from, Date.UTC(2026, 10, 4, 12), "America/New_York");
    const days = result.series.buckets.map((bucket) => bucket.day);
    expect(days).toEqual(consecutive("2026-10-28", 8));
    const change = result.series.buckets[days.indexOf("2026-11-01")];
    expect(change.to - change.from).toBe(25 * H);
    expect(result.rows.map((row) => [row.day, row.value])).toEqual([
      ["2026-11-01", 2],
      ["2026-11-02", 1],
    ]);
  });

  it("finds the first instant of a day whose midnight is skipped", () => {
    // Chile moves clocks forward at local midnight in September, so 00:00 does not exist.
    for (const [zone, year, month, day] of [
      ["America/Santiago", 2026, 9, 6],
      ["Europe/London", 2026, 3, 29],
      ["UTC", 2026, 1, 1],
    ] as const) {
      const start = localMidnight(year, month, day, zone);
      const target = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      expect(localDay(start, zone), zone).toBe(target);
      expect(localDay(start - 1, zone) < target, zone).toBe(true);
    }
  });
});
