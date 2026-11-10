"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import "./analytics.css";
import type { AnalyticsResult } from "../../server/domain/analytics.ts";
import { metricInfo, unitFor, type MetricInfo } from "../../server/domain/analytics-metrics.ts";
import { BarChart, TimeChart, type Point } from "./analytics-charts";
import type { PanelProps } from "./types";

type Period = "latest" | "stream" | "7d" | "30d" | "custom";
type Query = { from: number; to: number; stream?: string };
type SummaryMetric = AnalyticsResult["summary"]["metrics"][number];
type StreamItem = AnalyticsResult["streams"][number];

const MINUTE = 60_000,
  DAY = 86_400_000;
const GAP_REASONS: Record<string, string> = {
  worker_offline: "Worker offline",
  before_first_record: "Before KekBot started recording",
  not_retained: "Older than the analytics retention period",
};

const integer = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const formatNumber = (value: number, info?: Pick<MetricInfo, "kind">) =>
  (info?.kind === "sample" || !Number.isInteger(value) ? decimal : integer).format(value);
const dateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const shortDate = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const formatDate = (at: number) => dateFormat.format(at);
const formatTime = (at: number) => timeFormat.format(at);
const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();
const formatMoment = (at: number) => `${shortDate.format(at)}, ${formatTime(at)}`;

export function formatDuration(ms: number) {
  const minutes = Math.max(0, Math.round(ms / MINUTE));
  if (minutes < 60) return `${minutes} min`;
  const days = Math.floor(minutes / 1440),
    hours = Math.floor((minutes % 1440) / 60),
    rest = minutes % 60;
  if (days) return `${days} ${days === 1 ? "day" : "days"}${hours ? ` ${hours} h` : ""}`;
  return `${hours} h${rest ? ` ${rest} min` : ""}`;
}
const formatSpan = (from: number, to: number) =>
  sameDay(from, to)
    ? `${formatDate(from)}, ${formatTime(from)}–${formatTime(to)}`
    : `${formatMoment(from)} – ${formatMoment(to)}`;
const streamLabel = (stream: Pick<StreamItem, "start" | "ongoing"> & { durationMs: number }) =>
  `${formatDate(stream.start)}, ${formatTime(stream.start)} · ${stream.ongoing ? `live now, ${formatDuration(stream.durationMs)} so far` : formatDuration(stream.durationMs)}`;
const percent = (part: number, whole: number) =>
  whole > 0 ? `${Math.min(100, Math.round((part / whole) * 100))}%` : "0%";
const startOfDay = (at: number) => {
  const day = new Date(at);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
};
const dateValue = (at: number) => {
  const day = new Date(at);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
};

function queryFor(period: Period, stream: string, from: string, to: string): Query | string {
  const now = Date.now();
  if (period === "latest") return { from: now - 30 * DAY, to: now, stream: "latest" };
  if (period === "stream")
    // The server uses the stream's own window; from/to only need to be valid.
    return stream ? { from: now - DAY, to: now, stream } : "Choose a stream.";
  if (period === "7d") return { from: startOfDay(now - 6 * DAY), to: now };
  if (period === "30d") return { from: startOfDay(now - 29 * DAY), to: now };
  const start = new Date(`${from}T00:00`).getTime(),
    end = new Date(`${to}T00:00`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "Choose both dates.";
  if (end < start) return "The end date is before the start date.";
  // Include the whole of the end day in local time.
  return { from: start, to: new Date(end).setDate(new Date(end).getDate() + 1) - 1 };
}

function params(query: Query, extra: Record<string, string> = {}) {
  return new URLSearchParams({
    view: "analytics",
    from: String(query.from),
    to: String(query.to),
    tz: String(new Date().getTimezoneOffset()),
    ...(query.stream ? { stream: query.stream } : {}),
    ...extra,
  }).toString();
}

type Outcome = { ok: true; result: AnalyticsResult } | { ok: false; error: string };
async function fetchAnalytics(next: Query): Promise<Outcome> {
  try {
    const response = await fetch(`/api/control?${params(next)}`, { cache: "no-store" });
    const result = await response.json();
    return response.ok ? { ok: true, result } : { ok: false, error: String(result.error) };
  } catch {
    return { ok: false, error: "analytics_unavailable" };
  }
}

/** Plain-language value for a summary card, keeping unknown separate from zero. */
function cardValue(metric: SummaryMetric) {
  if (metric.value === null)
    return metric.kind === "sample"
      ? { main: "Not sampled", unit: "", detail: "No viewer samples were recorded in this period." }
      : {
          main: "Unknown",
          unit: "",
          detail: "The worker was not running, so KekBot could not observe this.",
        };
  if (metric.kind === "sample" && "peak" in metric)
    return {
      main: formatNumber(metric.value, metric),
      unit: `${unitFor(metric, metric.value)} on average`,
      detail: `Peak ${formatNumber(metric.peak ?? 0)} · ${integer.format(metric.samples)} ${metric.samples === 1 ? "sample" : "samples"}`,
    };
  return {
    main: formatNumber(metric.value, metric),
    unit: unitFor(metric, metric.value),
    detail: "",
  };
}

export default function AnalyticsPanel({ message }: PanelProps) {
  const [period, setPeriod] = useState<Period>("latest");
  const [stream, setStream] = useState("");
  const [from, setFrom] = useState(() => dateValue(Date.now() - 6 * DAY));
  const [to, setTo] = useState(() => dateValue(Date.now()));
  const [query, setQuery] = useState<Query>();
  const [data, setData] = useState<AnalyticsResult>();
  const [loading, setLoading] = useState(true);
  const [chartMetric, setChartMetric] = useState("chat.messages");
  const latestRequest = useRef(0);

  const apply = useCallback(
    (id: number, next: Query, outcome: Outcome) => {
      if (id !== latestRequest.current) return; // A newer selection superseded this one.
      setLoading(false);
      if (!outcome.ok) return message(outcome.error);
      setData(outcome.result);
      // Pin "latest" to the stream it resolved to, so downloads match what is shown.
      const resolved = outcome.result.selection.stream;
      setQuery(
        resolved
          ? { from: outcome.result.from, to: outcome.result.to, stream: resolved.id }
          : next.stream
            ? { from: next.from, to: next.to }
            : next,
      );
    },
    [message],
  );
  const load = (next: Query) => {
    const id = ++latestRequest.current;
    setLoading(true);
    void fetchAnalytics(next).then((outcome) => apply(id, next, outcome));
  };

  useEffect(() => {
    let active = true;
    const now = Date.now(),
      next = { from: now - 30 * DAY, to: now, stream: "latest" },
      id = ++latestRequest.current;
    fetchAnalytics(next).then((outcome) => {
      if (active) apply(id, next, outcome);
    });
    return () => {
      active = false;
    };
  }, [apply]);

  const choose = (nextPeriod: Period, nextStream = stream) => {
    setPeriod(nextPeriod);
    if (nextPeriod === "custom") return;
    const next = queryFor(nextPeriod, nextStream, from, to);
    if (typeof next === "string") return;
    load(next);
  };

  return (
    <div className="analytics">
      <form
        className="an-controls"
        aria-busy={loading}
        onSubmit={(event) => {
          event.preventDefault();
          const next = queryFor(period, stream, from, to);
          if (typeof next === "string") return message(next);
          load(next);
        }}
      >
        <h2>Observed history</h2>
        <div className="fields">
          <label>
            Show
            <select value={period} onChange={(event) => choose(event.target.value as Period)}>
              <option value="latest">Last stream</option>
              <option value="stream">A specific stream</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="custom">Custom dates</option>
            </select>
          </label>
          {period === "stream" && (
            <label>
              Stream
              <select
                value={stream}
                onChange={(event) => {
                  setStream(event.target.value);
                  if (event.target.value) choose("stream", event.target.value);
                }}
              >
                <option value="">
                  {data?.streams.length ? "Choose a stream" : "No streams observed yet"}
                </option>
                {data?.streams.map((item) => (
                  <option key={item.id} value={item.id}>
                    {streamLabel(item)}
                    {item.beforeRetention ? " (older than retention)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          {period === "custom" && (
            <>
              <label>
                From
                <input
                  type="date"
                  value={from}
                  required
                  onChange={(event) => setFrom(event.target.value)}
                />
              </label>
              <label>
                To (includes the whole day)
                <input
                  type="date"
                  value={to}
                  required
                  onChange={(event) => setTo(event.target.value)}
                />
              </label>
            </>
          )}
        </div>
        <div className="actions">
          {period === "custom" && <button disabled={loading}>Show these dates</button>}
          {period !== "custom" && (
            <button className="secondary" disabled={loading}>
              Refresh
            </button>
          )}
          {query && (
            <>
              <a
                className="button secondary"
                href={`/api/control?${params(query, { format: "csv" })}`}
              >
                Download this selection (CSV)
              </a>
              <a
                className="button secondary"
                href={`/api/control?${params(query, { format: "json" })}`}
              >
                Download this selection (JSON)
              </a>
            </>
          )}
        </div>
        <p className="help">
          Times use this browser&apos;s time zone. Downloads contain exactly the period shown below.
        </p>
      </form>
      {!data && <p className="empty">{loading ? "Loading observed history…" : ""}</p>}
      {data && (
        <AnalyticsView data={data} chartMetric={chartMetric} setChartMetric={setChartMetric} />
      )}
    </div>
  );
}

function AnalyticsView({
  data,
  chartMetric,
  setChartMetric,
}: {
  data: AnalyticsResult;
  chartMetric: string;
  setChartMetric: (metric: string) => void;
}) {
  const selected = data.selection.stream;
  const noStreamYet = data.selection.requestedStream === "latest" && !selected;
  const heading = selected
    ? `Stream: ${formatSpan(data.from, data.selection.stream?.ongoing ? data.coverage.observedUntil : data.to)}`
    : `${formatMoment(data.from)} – ${formatMoment(Math.min(data.to, data.generatedAt))}`;
  const duration = selected
    ? `${selected.ongoing ? "Live now, " : ""}${formatDuration((selected.end ?? data.generatedAt) - selected.start)}${selected.ongoing ? " so far" : ""}`
    : `${data.summary.streamsInRange} ${data.summary.streamsInRange === 1 ? "stream" : "streams"} observed in this period`;
  const groups = [...new Set(data.summary.metrics.map((metric) => metric.group))];
  return (
    <>
      <section aria-labelledby="an-summary">
        <h2 id="an-summary">{heading}</h2>
        <p className="an-sub">{duration}</p>
        {noStreamYet && (
          <p className="notice">
            No stream has been observed yet, so this shows the last 30 days. Streams appear here
            once KekBot sees Kick report the channel going live.
          </p>
        )}
        <Coverage data={data} />
        {groups.map((group) => (
          <div key={group} className="an-group">
            <h3>{group}</h3>
            <div className="an-cards">
              {data.summary.metrics
                .filter((metric) => metric.group === group)
                .map((metric) => (
                  <SummaryCard key={metric.id} metric={metric} data={data} />
                ))}
            </div>
          </div>
        ))}
      </section>
      <Trend data={data} chartMetric={chartMetric} setChartMetric={setChartMetric} />
      <StreamComparison data={data} chartMetric={chartMetric} />
      <section aria-labelledby="an-daily">
        <h2 id="an-daily">Daily totals</h2>
        <details>
          <summary>Show {data.rows.length} daily rows (as exported in the CSV)</summary>
          {data.rows.length ? (
            <div className="table-scroll">
              <table>
                <caption className="an-visually-hidden">Daily totals by metric</caption>
                <thead>
                  <tr>
                    <th scope="col">Day</th>
                    <th scope="col">Metric</th>
                    <th scope="col">Value</th>
                    <th scope="col">Records</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={`${row.day}-${row.metric}`}>
                      <td>{row.day}</td>
                      <td>{row.label}</td>
                      <td>
                        {formatNumber(row.value, metricInfo(row.metric))} {unitFor(row, row.value)}
                        {row.metric === "viewers.sample" ? " (average)" : ""}
                      </td>
                      <td>{integer.format(row.samples)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty">No events were observed in this period.</p>
          )}
          {data.rowsTruncated && (
            <p className="help">Only the first 100,000 rows are shown and exported.</p>
          )}
        </details>
      </section>
    </>
  );
}

function SummaryCard({ metric, data }: { metric: SummaryMetric; data: AnalyticsResult }) {
  const value = cardValue(metric);
  const subscriptions = data.summary.subscriptions;
  return (
    <article className={metric.value === null ? "an-card an-unknown" : "an-card"}>
      <h4>{metric.label}</h4>
      <p className="an-value">
        <strong>{value.main}</strong> {value.unit && <span>{value.unit}</span>}
      </p>
      {value.detail && <p className="an-detail">{value.detail}</p>}
      {metric.id === "support.subscription" && metric.value !== null && metric.value > 0 && (
        <p className="an-detail">
          {integer.format(subscriptions.new)} new · {integer.format(subscriptions.renewal)} renewed
          · {integer.format(subscriptions.gifted)} gifted
          {subscriptions.typeNotRetained > 0 &&
            ` · ${integer.format(subscriptions.typeNotRetained)} whose type is no longer retained`}
        </p>
      )}
      {metric.note && <p className="an-detail">{metric.note}</p>}
      {!metric.known && <p className="an-detail">Recorded metric without a label yet.</p>}
    </article>
  );
}

function Coverage({ data }: { data: AnalyticsResult }) {
  const coverage = data.coverage;
  const shown = coverage.gaps.slice(0, 8),
    rest = coverage.gaps.slice(8);
  const gapText = (gap: (typeof coverage.gaps)[number]) =>
    `${GAP_REASONS[gap.reason] ?? gap.reason} ${sameDay(gap.from, gap.to) && sameDay(gap.from, data.from) && sameDay(data.from, data.coverage.observedUntil) ? `${formatTime(gap.from)}–${formatTime(gap.to)}` : `${formatMoment(gap.from)} – ${formatMoment(gap.to)}`} (${formatDuration(gap.to - gap.from)})`;
  return (
    <div className="an-coverage" aria-labelledby="an-coverage-title" role="region">
      <h3 id="an-coverage-title">Coverage</h3>
      {coverage.workerMinutes === 0 ? (
        <p>
          No worker activity was recorded in this period, so counts are shown as unknown rather than
          zero.
        </p>
      ) : (
        <p>
          KekBot&apos;s worker was running for about{" "}
          {formatDuration(coverage.workerMinutes * MINUTE)} of{" "}
          {formatDuration(coverage.expectedMinutes * MINUTE)} (
          {percent(coverage.workerMinutes, coverage.expectedMinutes)}).{" "}
          {coverage.gaps.length === 0
            ? "No gaps longer than two minutes."
            : `${coverage.gaps.length}${coverage.truncated ? "+" : ""} ${coverage.gaps.length === 1 ? "gap" : "gaps"} longer than two minutes:`}
        </p>
      )}
      {shown.length > 0 && coverage.workerMinutes > 0 && (
        <ul>
          {shown.map((gap) => (
            <li key={gap.from}>{gapText(gap)}</li>
          ))}
        </ul>
      )}
      {rest.length > 0 && coverage.workerMinutes > 0 && (
        <details>
          <summary>{rest.length} more gaps</summary>
          <ul>
            {rest.map((gap) => (
              <li key={gap.from}>{gapText(gap)}</li>
            ))}
          </ul>
        </details>
      )}
      {coverage.truncated && <p className="help">Only the first 500 gaps are listed.</p>}
      <p className="help">
        Counts are what KekBot observed. A running worker does not prove that Kick or Discord
        delivered every event. Zero means nothing was observed while the worker was running; unknown
        means it was not running. History before installation is not imported, and observations
        older than the retention period are deleted.
      </p>
    </div>
  );
}

function Trend({
  data,
  chartMetric,
  setChartMetric,
}: {
  data: AnalyticsResult;
  chartMetric: string;
  setChartMetric: (metric: string) => void;
}) {
  const metricId = data.series.metrics[chartMetric] ? chartMetric : "chat.messages";
  const info = metricInfo(metricId);
  const values = data.series.metrics[metricId] ?? [];
  const bucket = data.series.bucketMs;
  const per = bucket >= 7 * DAY ? "week" : bucket >= DAY ? "day" : formatDuration(bucket);
  const multiDay = !sameDay(data.from, data.coverage.observedUntil);
  const label =
    metricId === "chat.distinct"
      ? "New chatters (first message this stream)"
      : `${info.label}${info.kind === "sample" ? " (average)" : ""}`;
  const tick = (at: number) =>
    bucket >= DAY
      ? shortDate.format(at)
      : multiDay
        ? `${new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(at)} ${formatTime(at)}`
        : formatTime(at);
  const points: Point[] = data.series.buckets.map((b, i) => {
    const entry = values[i] as { value: number; peak?: number; samples: number } | null;
    const when = bucket >= DAY ? formatDate(b.from) : `${formatMoment(b.from)}–${formatTime(b.to)}`;
    const coverageLine = `Worker running ${integer.format(b.workerMinutes)} of ${integer.format(b.expectedMinutes)} min`;
    return {
      from: b.from,
      to: b.to,
      value: entry ? entry.value : null,
      detail: entry
        ? [
            when,
            info.kind === "sample"
              ? `Average ${formatNumber(entry.value, info)} ${unitFor(info, entry.value)}, peak ${formatNumber(entry.peak ?? 0)} (${entry.samples} samples)`
              : `${formatNumber(entry.value, info)} ${unitFor(info, entry.value)}`.trim(),
            coverageLine,
          ]
        : [
            when,
            info.kind === "sample" ? "Not sampled" : "Unknown: worker not running",
            coverageLine,
          ],
    };
  });
  const known = points.filter((p) => p.value !== null);
  const highest = known.reduce<Point | undefined>(
    (best, p) => (best && best.value! >= p.value! ? best : p),
    undefined,
  );
  const missing = points.length - known.length;
  const summary = `${label} per ${per}, ${formatMoment(data.from)} to ${formatMoment(data.coverage.observedUntil)}. ${
    highest
      ? `Highest ${formatNumber(highest.value!, info)} ${unitFor(info, highest.value)} at ${tick(highest.from)}.`
      : "No values observed."
  }${missing ? ` ${missing} of ${points.length} periods have no data.` : ""}`;
  return (
    <section aria-labelledby="an-trend">
      <div className="section-title">
        <h2 id="an-trend">Over time</h2>
        <label className="an-inline">
          Metric
          <select value={metricId} onChange={(event) => setChartMetric(event.target.value)}>
            {data.summary.metrics.map((metric) => (
              <option key={metric.id} value={metric.id}>
                {metric.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <figure>
        <figcaption>
          {label} per {per}.{" "}
          <span className="an-legend">
            <span className="an-swatch an-swatch-nodata" aria-hidden="true" /> Hatched: no data
          </span>
        </figcaption>
        <TimeChart
          key={`${metricId}:${data.from}:${data.to}`}
          points={points}
          shape={info.kind === "sample" ? "line" : "columns"}
          label={label}
          formatValue={(v) => formatNumber(v, info)}
          formatTick={tick}
          summary={summary}
        />
      </figure>
      <details>
        <summary>Show as a table</summary>
        <div className="table-scroll">
          <table>
            <caption className="an-visually-hidden">
              {label} per {per}
            </caption>
            <thead>
              <tr>
                <th scope="col">Period</th>
                <th scope="col">Value</th>
                <th scope="col">Worker coverage</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.from}>
                  <td>{p.detail[0]}</td>
                  <td>{p.detail[1]}</td>
                  <td>{p.detail[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function StreamComparison({ data, chartMetric }: { data: AnalyticsResult; chartMetric: string }) {
  if (!data.summaries.length) return null;
  const metricId = data.series.metrics[chartMetric] ? chartMetric : "chat.messages";
  const info = metricInfo(metricId);
  const cell = (item: (typeof data.summaries)[number], id: string) => {
    const entry = item.metrics[id] as { value: number | null; peak?: number | null } | undefined;
    return entry?.value == null
      ? metricInfo(id).kind === "sample"
        ? "Not sampled"
        : "Unknown"
      : formatNumber(entry.value, metricInfo(id));
  };
  const label = (item: (typeof data.summaries)[number]) =>
    `${shortDate.format(item.start)}, ${formatTime(item.start)}`;
  const columns = [
    "chat.messages",
    "chat.distinct",
    "support.follow",
    "support.subscription",
    "viewers.sample",
  ];
  return (
    <section aria-labelledby="an-streams">
      <h2 id="an-streams">Streams in this period</h2>
      {data.summaries.length > 1 && (
        <figure>
          <figcaption>
            {info.label}
            {info.kind === "sample" ? " (average)" : ""} per stream, newest first.
          </figcaption>
          <BarChart
            bars={data.summaries.map((item) => {
              const entry = item.metrics[metricId] as { value: number | null } | undefined;
              return {
                key: item.id,
                label: label(item),
                value: entry?.value ?? null,
                detail:
                  `${label(item)}: ${cell(item, metricId)} ${entry?.value == null ? "" : unitFor(info, entry.value)}`.trim(),
              };
            })}
            formatValue={(v) => formatNumber(v, info)}
            unknownLabel={info.kind === "sample" ? "Not sampled" : "Unknown"}
            summary={`${info.label} for ${data.summaries.length} streams, newest first. The table below lists each value.`}
          />
        </figure>
      )}
      <div className="table-scroll">
        <table>
          <caption className="an-visually-hidden">Per-stream summary</caption>
          <thead>
            <tr>
              <th scope="col">Stream start</th>
              <th scope="col">Duration</th>
              <th scope="col">Coverage</th>
              {columns.map((id) => (
                <th scope="col" key={id}>
                  {metricInfo(id).label}
                  {metricInfo(id).kind === "sample" ? " (avg / peak)" : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.summaries.map((item) => {
              const viewers = item.metrics["viewers.sample"] as
                { value: number | null; peak: number | null } | undefined;
              return (
                <tr key={item.id}>
                  <td>{`${formatDate(item.start)}, ${formatTime(item.start)}`}</td>
                  <td>
                    {formatDuration((item.end ?? data.generatedAt) - item.start)}
                    {item.ongoing ? " (live)" : ""}
                  </td>
                  <td>{percent(item.workerMinutes, item.expectedMinutes)} observed</td>
                  {columns.map((id) => (
                    <td key={id}>
                      {id === "viewers.sample" && viewers?.value != null
                        ? `${formatNumber(viewers.value, metricInfo(id))} / ${formatNumber(viewers.peak ?? 0)}`
                        : cell(item, id)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {data.comparedStreamsTruncated && (
        <p className="help">Only the 60 newest streams in this period are compared.</p>
      )}
    </section>
  );
}
