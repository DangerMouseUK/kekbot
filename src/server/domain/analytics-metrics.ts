/**
 * The single place that maps recorded observation metric IDs to people-facing labels and units.
 * Shared by the analytics read model, its CSV export and the dashboard panel. A metric that is
 * not listed here still renders under its raw ID so newly recorded metrics never disappear.
 * Pure data: safe to import from client components.
 */
export type MetricKind = "count" | "sample" | "estimate";
export type MetricInfo = {
  id: string;
  label: string;
  /** Plural unit for values, e.g. "messages". */
  unit: string;
  /** How values combine: counts/estimates add up; samples report mean, peak and sample count. */
  kind: MetricKind;
  group: string;
  /** Short caveat shown beside the value. */
  note?: string;
  known: boolean;
};

const catalogue: Record<string, Omit<MetricInfo, "id" | "known">> = {
  "chat.messages": { label: "Chat messages", unit: "messages", kind: "count", group: "Chat" },
  "chat.distinct": {
    label: "Distinct chatters",
    unit: "chatters",
    kind: "count",
    group: "Chat",
    note: "Counted once per stream. A range covering several streams adds each stream's chatters, so a viewer who chats in two streams counts twice.",
  },
  "commands.executed": {
    label: "Commands answered",
    unit: "commands",
    kind: "count",
    group: "Chat",
  },
  "viewers.sample": {
    label: "Sampled viewers",
    unit: "viewers",
    kind: "sample",
    group: "Audience",
    note: "Kick's concurrent viewer count, sampled about once a minute while live. Average and peak of the samples taken, not a total.",
  },
  "watchtime.estimated_minutes": {
    label: "Estimated watchtime",
    unit: "minutes",
    kind: "estimate",
    group: "Audience",
    note: "Estimated from recent chat activity. Not a provider-certified watch count.",
  },
  "support.follow": { label: "Follows", unit: "follows", kind: "count", group: "Support" },
  "support.subscription": {
    label: "Subscriptions",
    unit: "subscriptions",
    kind: "count",
    group: "Support",
    note: "New, renewed and gifted subscriptions; a gift of five counts five.",
  },
  "points.accrued": {
    label: "Points awarded",
    unit: "points",
    kind: "count",
    group: "Points & rewards",
    note: "Points given for observed chat activity.",
  },
  "rewards.requested": {
    label: "Redemptions requested",
    unit: "redemptions",
    kind: "count",
    group: "Points & rewards",
  },
  "rewards.complete": {
    label: "Redemptions completed",
    unit: "redemptions",
    kind: "count",
    group: "Points & rewards",
  },
  "rewards.reject": {
    label: "Redemptions refunded",
    unit: "redemptions",
    kind: "count",
    group: "Points & rewards",
  },
  "media.requests": { label: "Media requests", unit: "requests", kind: "count", group: "Media" },
  "media.completed": {
    label: "Media played to the end",
    unit: "requests",
    kind: "count",
    group: "Media",
  },
  "moderation.incidents": {
    label: "Moderation incidents",
    unit: "incidents",
    kind: "count",
    group: "Moderation",
  },
  "polls.votes": {
    label: "Poll votes",
    unit: "votes",
    kind: "count",
    group: "Polls & raffles",
    note: "One per viewer per poll; changing a vote does not add another.",
  },
  "raffles.entries": {
    label: "Raffle entries",
    unit: "entries",
    kind: "count",
    group: "Polls & raffles",
  },
  "raffles.draws": {
    label: "Raffle winners drawn",
    unit: "draws",
    kind: "count",
    group: "Polls & raffles",
  },
  "alerts.queued": {
    label: "Alert deliveries queued",
    unit: "deliveries",
    kind: "count",
    group: "Alerts & goals",
    note: "One per alert widget that received the alert.",
  },
  "goals.increments": {
    label: "Goal progress added",
    unit: "progress",
    kind: "count",
    group: "Alerts & goals",
  },
};

/** Coverage heartbeat; shown as coverage, never as a metric. */
export const WORKER_METRIC = "worker.minute";

/** Metric order for summaries and charts; unknown metrics follow, sorted by ID. */
export const METRIC_ORDER = Object.keys(catalogue);

export function metricInfo(id: string): MetricInfo {
  const known = catalogue[id];
  return known
    ? { id, ...known, known: true }
    : { id, label: id, unit: "", kind: "count", group: "Other", known: false };
}

/** The unit for a value: "1 incident" but "2 incidents". */
export function unitFor(info: Pick<MetricInfo, "unit">, value: number | null) {
  if (value !== 1 || !info.unit || !info.unit.endsWith("s")) return info.unit;
  return info.unit.endsWith("ies") ? `${info.unit.slice(0, -3)}y` : info.unit.slice(0, -1);
}

export function compareMetrics(a: string, b: string) {
  const ia = METRIC_ORDER.indexOf(a),
    ib = METRIC_ORDER.indexOf(b);
  if (ia === -1 && ib === -1) return a.localeCompare(b);
  if (ia === -1) return 1;
  if (ib === -1) return -1;
  return ia - ib;
}
