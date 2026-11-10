import { z } from "zod";
import type BetterSqlite3 from "better-sqlite3";
import { AppError } from "../errors.ts";
import { compareMetrics, metricInfo, METRIC_ORDER, WORKER_METRIC } from "./analytics-metrics.ts";
import { localDays, MAX_TIME, validTimeZone } from "./analytics-time.ts";

export { localDay } from "./analytics-time.ts";

/**
 * Read-only analytics model over recorded observations. It never writes, never calls a provider
 * and bounds every result. Values describe what KekBot observed; unknown stays `null`, never 0.
 */

const MINUTE = 60_000;
const DAY = 86_400_000;
/** A worker heartbeat is recorded once per minute; more than two minutes apart is a gap. */
export const GAP_THRESHOLD = 2 * MINUTE;
export const MAX_RANGE = 3660 * DAY;
/** Fixed-length buckets for short spans; longer spans use local calendar days or weeks. */
const BUCKET_SIZES = [5, 10, 15, 30, 60].map((m) => m * MINUTE);
const MAX_BUCKETS = 90;
const MAX_DAYS = 3700;
const MAX_GAPS = 500;
const MAX_COMPARED_STREAMS = 60;
const MAX_ROWS = 100_000;

export type StreamRecord = { id: string; start: number; end: number | null };
export type AnalyticsQuery = { from: number; to: number; stream?: string; timeZone?: string };
export type AnalyticsContext = { now: number; summaryDays: number };
type Aggregate = { samples: number; total: number; mean: number; minimum: number; maximum: number };

const querySchema = z
  .object({
    from: z.number().int().nonnegative().max(MAX_TIME),
    to: z.number().int().nonnegative().max(MAX_TIME),
    stream: z.string().min(1).max(200).optional(),
    /** The viewer's IANA time zone, e.g. "Europe/London"; days start at its real local midnight. */
    timeZone: z.string().max(64).default("UTC"),
  })
  .refine((q) => q.to >= q.from, "to_before_from")
  // A selected stream defines its own window, so only a plain range is length-limited.
  .refine((q) => Boolean(q.stream) || q.to - q.from <= MAX_RANGE, "range_too_long");

const streamSchema = z.object({
  id: z.string(),
  start: z.number().finite(),
  end: z.number().finite().nullable(),
});

/** Observed streams, oldest first. A malformed entry is skipped rather than hiding every stream. */
export function streamHistory(raw: string | undefined): StreamRecord[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const entry = streamSchema.safeParse(item);
      return entry.success ? [entry.data] : [];
    });
  } catch {
    return [];
  }
}

/** Value for a summable metric: a total when observed, 0 when the worker was watching, else unknown. */
function countValue(aggregate: Aggregate | undefined, workerMinutes: number) {
  if (aggregate?.samples) return aggregate.total;
  return workerMinutes > 0 ? 0 : null;
}

export function readAnalytics(
  db: BetterSqlite3.Database,
  rawHistory: string | undefined,
  input: AnalyticsQuery,
  { now, summaryDays }: AnalyticsContext,
) {
  const parsed = querySchema.safeParse(input);
  if (!parsed.success) throw new AppError("invalid_analytics_range", 400);
  const query = parsed.data;
  if (!validTimeZone(query.timeZone)) throw new AppError("invalid_time_zone", 400);
  const timeZone = query.timeZone;
  const history = streamHistory(rawHistory);
  let selected: StreamRecord | undefined;
  if (query.stream === "latest") selected = history.at(-1);
  else if (query.stream) {
    selected = history.find((item) => item.id === query.stream);
    if (!selected) throw new AppError("stream_not_observed", 404);
  }
  // A selected stream defines its own window; otherwise the requested range applies.
  const start = selected ? selected.start : query.from;
  const end = selected ? Math.max(selected.start, selected.end ?? now) : query.to;
  const observedUntil = Math.max(start, Math.min(end, now));
  const retainedFrom = now - summaryDays * DAY;

  const aggregate = (from: number, to: number) => {
    const rows = db
      .prepare(
        "SELECT metric,count(*) AS samples,sum(value) AS total,avg(value) AS mean,min(value) AS minimum,max(value) AS maximum FROM observations WHERE at>=? AND at<=? GROUP BY metric LIMIT 500",
      )
      .all(from, to) as (Aggregate & { metric: string })[];
    return new Map(rows.map((row) => [row.metric, row]));
  };

  // Totals for the whole selection.
  const totals = aggregate(start, end);
  const workerMinutes = totals.get(WORKER_METRIC)?.samples ?? 0;
  const metricIds = [...new Set([...METRIC_ORDER, ...totals.keys()])]
    .filter((id) => id !== WORKER_METRIC)
    .sort(compareMetrics);
  const metrics = metricIds.map((id) => {
    const info = metricInfo(id),
      row = totals.get(id);
    return info.kind === "sample"
      ? {
          ...info,
          value: row?.samples ? row.mean : null,
          peak: row?.samples ? row.maximum : null,
          minimum: row?.samples ? row.minimum : null,
          samples: row?.samples ?? 0,
        }
      : { ...info, value: countValue(row, workerMinutes), samples: row?.samples ?? 0 };
  });
  // Split subscriptions by the retained Kick receipt. Receipts can expire before observations.
  const subscriptionRows = db
    .prepare(
      "SELECT coalesce(r.event_type,'') AS type,sum(o.value) AS total FROM observations o LEFT JOIN receipts r ON r.id=substr(o.id,9) WHERE o.metric='support.subscription' AND o.id LIKE 'support:%' AND o.at>=? AND o.at<=? GROUP BY type",
    )
    .all(start, end) as { type: string; total: number }[];
  const subscriptionType = (type: string) =>
    subscriptionRows.find((row) => row.type === type)?.total ?? 0;
  const subscriptions = {
    new: subscriptionType("channel.subscription.new"),
    renewal: subscriptionType("channel.subscription.renewal"),
    gifted: subscriptionType("channel.subscription.gifts"),
    typeNotRetained: subscriptionRows
      .filter((row) => !row.type.startsWith("channel.subscription."))
      .reduce((sum, row) => sum + row.total, 0),
  };

  // Coverage: worker heartbeat windows and gaps, computed in SQL so only boundaries are returned.
  const boundaries = db
    .prepare(
      "SELECT at,previous FROM (SELECT at,lag(at) OVER (ORDER BY at) AS previous FROM observations WHERE metric=? AND at>=? AND at<=?) WHERE previous IS NULL OR at-previous>? ORDER BY at LIMIT ?",
    )
    .all(WORKER_METRIC, start, observedUntil, GAP_THRESHOLD, MAX_GAPS + 1) as {
    at: number;
    previous: number | null;
  }[];
  const span = db
    .prepare(
      "SELECT min(at) AS first,max(at) AS last FROM observations WHERE metric=? AND at>=? AND at<=?",
    )
    .get(WORKER_METRIC, start, observedUntil) as { first: number | null; last: number | null };
  const firstEver = (
    db.prepare("SELECT min(at) AS first FROM observations WHERE metric=?").get(WORKER_METRIC) as {
      first: number | null;
    }
  ).first;
  const truncated = boundaries.length > MAX_GAPS;
  const reason = (from: number, to: number) =>
    to <= retainedFrom
      ? "not_retained"
      : firstEver === null || to <= firstEver
        ? "before_first_record"
        : "worker_offline";
  const gaps: { from: number; to: number; reason: string }[] = [];
  const windows: { from: number; to: number }[] = [];
  // A gap that crosses the retention horizon is split: older data was deleted, not missed.
  const addGap = (from: number, to: number) => {
    if (from < retainedFrom && to > retainedFrom) {
      gaps.push({ from, to: retainedFrom, reason: "not_retained" });
      from = retainedFrom;
    }
    gaps.push({ from, to, reason: reason(from, to) });
  };
  if (span.first === null || span.last === null) {
    if (observedUntil - start > GAP_THRESHOLD) addGap(start, observedUntil);
  } else {
    if (span.first - start > GAP_THRESHOLD) addGap(start, span.first);
    let windowStart = span.first;
    for (const row of boundaries.slice(0, MAX_GAPS)) {
      if (row.previous === null) continue;
      windows.push({ from: windowStart, to: row.previous });
      addGap(row.previous, row.at);
      windowStart = row.at;
    }
    if (!truncated) {
      windows.push({ from: windowStart, to: span.last });
      if (observedUntil - span.last > GAP_THRESHOLD) addGap(span.last, observedUntil);
    }
  }
  const coverage = {
    firstObserved: span.first,
    lastObserved: span.last,
    observedUntil,
    workerMinutes,
    expectedMinutes: Math.max(0, Math.ceil((observedUntil - start) / MINUTE)),
    windows,
    gaps,
    truncated,
    retainedFrom,
    firstEverObserved: firstEver,
  };

  // Time series from the selection start up to now (never into the future). Short spans use
  // fixed buckets; longer spans use the viewer's local calendar days, or weeks of seven days.
  const seriesSpan = Math.max(1, observedUntil - start);
  const fixed = BUCKET_SIZES.find((size) => Math.ceil(seriesSpan / size) <= MAX_BUCKETS);
  type Bucket = { from: number; to: number; day?: string };
  let bucketUnit: "fixed" | "day" | "week";
  let bucketList: Bucket[];
  if (fixed) {
    bucketUnit = "fixed";
    bucketList = Array.from({ length: Math.max(1, Math.ceil(seriesSpan / fixed)) }, (_, index) => ({
      from: start + index * fixed,
      to: Math.min(observedUntil, start + (index + 1) * fixed),
    }));
  } else {
    const days = localDays(start, observedUntil, timeZone, MAX_DAYS);
    const step = days.length <= MAX_BUCKETS ? 1 : 7;
    bucketUnit = step === 1 ? "day" : "week";
    bucketList = [];
    for (let index = 0; index < days.length; index += step) {
      const group = days.slice(index, index + step);
      bucketList.push({
        from: Math.max(start, group[0].start),
        to: Math.min(observedUntil, group.at(-1)!.end),
        day: group[0].day,
      });
    }
  }
  // Each bucket is [from, next from); the last one also includes `observedUntil` itself.
  const bucketBounds = bucketList.map((bucket, index) => [
    bucket.from,
    bucketList[index + 1]?.from ?? observedUntil + 1,
  ]);
  const bucketRows = db
    .prepare(
      "WITH b AS (SELECT CAST(key AS INTEGER) AS i,json_extract(value,'$[0]') AS s,json_extract(value,'$[1]') AS e FROM json_each(?)) SELECT b.i AS bucket,o.metric,count(*) AS samples,sum(o.value) AS total,avg(o.value) AS mean,min(o.value) AS minimum,max(o.value) AS maximum FROM b CROSS JOIN observations o WHERE o.at>=b.s AND o.at<b.e GROUP BY b.i,o.metric LIMIT ?",
    )
    .all(JSON.stringify(bucketBounds), (bucketList.length + 1) * 500) as (Aggregate & {
    bucket: number;
    metric: string;
  })[];
  const byBucket = new Map<string, Aggregate>();
  for (const row of bucketRows) byBucket.set(`${row.bucket}:${row.metric}`, row);
  const buckets = bucketList.map((bucket, index) => ({
    ...bucket,
    workerMinutes: byBucket.get(`${index}:${WORKER_METRIC}`)?.samples ?? 0,
    expectedMinutes: Math.max(1, Math.ceil((bucket.to - bucket.from) / MINUTE)),
  }));
  const bucketMs = fixed ?? (bucketUnit === "day" ? DAY : 7 * DAY);
  const series = Object.fromEntries(
    metricIds.map((id) => {
      const info = metricInfo(id);
      return [
        id,
        buckets.map((bucket, index) => {
          const row = byBucket.get(`${index}:${id}`);
          if (info.kind === "sample")
            return row?.samples
              ? { value: row.mean, peak: row.maximum, samples: row.samples }
              : null;
          const value = countValue(row, bucket.workerMinutes);
          return value === null ? null : { value, samples: row?.samples ?? 0 };
        }),
      ];
    }),
  );

  // Per-stream comparison for streams overlapping the selection, newest first.
  const overlapping = history.filter((item) => item.start <= end && (item.end ?? now) >= start);
  const compared = overlapping
    .slice(-MAX_COMPARED_STREAMS)
    .reverse()
    .map((item) => {
      const from = Math.max(start, item.start),
        to = Math.min(end, item.end ?? now);
      const streamTotals = aggregate(from, to),
        minutes = streamTotals.get(WORKER_METRIC)?.samples ?? 0;
      return {
        id: item.id,
        start: item.start,
        end: item.end,
        ongoing: item.end === null,
        workerMinutes: minutes,
        expectedMinutes: Math.max(0, Math.ceil((Math.min(to, now) - from) / MINUTE)),
        metrics: Object.fromEntries(
          metricIds.map((id) => {
            const row = streamTotals.get(id);
            return [
              id,
              metricInfo(id).kind === "sample"
                ? { value: row?.samples ? row.mean : null, peak: row?.samples ? row.maximum : null }
                : { value: countValue(row, minutes) },
            ];
          }),
        ),
      };
    });

  // Daily rows on the viewer's real local days (23 or 25 hours across daylight-saving changes)
  // for tables and CSV. Viewer samples report their mean.
  const days = localDays(start, end, timeZone, MAX_DAYS).map((day, index, all) => [
    day.day,
    Math.max(start, day.start),
    index === all.length - 1 ? end + 1 : day.end,
  ]);
  const rows = (
    db
      .prepare(
        "WITH d AS (SELECT json_extract(value,'$[0]') AS day,json_extract(value,'$[1]') AS s,json_extract(value,'$[2]') AS e FROM json_each(?)) SELECT d.day AS day,o.metric AS metric,CASE WHEN o.metric='viewers.sample' THEN avg(o.value) ELSE sum(o.value) END AS value,count(*) AS samples,min(o.value) AS minimum,max(o.value) AS maximum FROM d CROSS JOIN observations o WHERE o.at>=d.s AND o.at<d.e AND o.metric!=? GROUP BY d.day,o.metric ORDER BY d.day,o.metric LIMIT ?",
      )
      .all(JSON.stringify(days), WORKER_METRIC, MAX_ROWS + 1) as {
      day: string;
      metric: string;
      value: number;
      samples: number;
      minimum: number;
      maximum: number;
    }[]
  ).map((row) => {
    const info = metricInfo(row.metric);
    return { ...row, label: info.label, unit: info.unit };
  });
  const rowsTruncated = rows.length > MAX_ROWS;

  return {
    generatedAt: now,
    from: start,
    to: end,
    selection: {
      kind: selected ? ("stream" as const) : ("range" as const),
      stream: selected ? { ...selected, ongoing: selected.end === null } : null,
      requestedStream: query.stream ?? null,
      timeZone,
    },
    streams: history
      .slice(-1000)
      .reverse()
      .map((item) => ({
        ...item,
        ongoing: item.end === null,
        durationMs: (item.end ?? now) - item.start,
        beforeRetention: (item.end ?? now) < retainedFrom,
      })),
    summary: { metrics, subscriptions, streamsInRange: overlapping.length },
    summaries: compared,
    comparedStreamsTruncated: overlapping.length > MAX_COMPARED_STREAMS,
    series: { bucketMs, bucketUnit, buckets, metrics: series },
    rows: rows.slice(0, MAX_ROWS),
    rowsTruncated,
    coverage,
    note: "Observed events only. Viewer samples report a mean with sample count/minimum/maximum. Gaps mark missing worker observations; worker presence does not prove complete provider delivery. Estimated watchtime uses recent chat activity.",
  };
}

export type AnalyticsResult = ReturnType<typeof readAnalytics>;
