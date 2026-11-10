// Pure conversions between stored values (Unix milliseconds, whole seconds/minutes)
// and what a person sees in the editor (local date-times, natural duration units).

const pad = (value: number) => String(value).padStart(2, "0");

/** Unix milliseconds → `YYYY-MM-DDTHH:mm` in the browser's local timezone, for `<input type="datetime-local">`. */
export function msToLocalInput(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms <= 0) return "";
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** `YYYY-MM-DDTHH:mm[:ss]` read as local time → Unix milliseconds, or `null` when blank/invalid. */
export function localInputToMs(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1, 6).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const second = match[6] ? Number(match[6]) : 0;
  if (hour > 23 || minute > 59 || second > 59) return null;
  const date = new Date(year, month - 1, day, hour, minute, second, 0);
  // Reject rollovers such as 31 February; DST gaps may shift forward and are accepted.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day)
    return null;
  const ms = date.getTime();
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

/** The viewer's IANA timezone and UTC offset, e.g. `Europe/London (GMT+1)`. */
export function localTimezoneLabel(at = Date.now()): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "your computer's timezone";
  let offset = "";
  try {
    offset =
      new Intl.DateTimeFormat("en", { timeZoneName: "shortOffset" })
        .formatToParts(new Date(at))
        .find((part) => part.type === "timeZoneName")?.value ?? "";
  } catch {
    offset = "";
  }
  return offset ? `${zone} (${offset})` : zone;
}

export function localTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** All IANA timezones the browser knows, always including UTC and any extra stored value. */
export function timezones(extra?: string): string[] {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {
    zones = [];
  }
  const set = new Set(["UTC", ...zones]);
  if (extra) set.add(extra);
  return [...set].sort((a, b) => (a === "UTC" ? -1 : b === "UTC" ? 1 : a.localeCompare(b)));
}

/** "in 2 hours", "5 minutes ago". */
export function relativeTime(ms: number, now = Date.now()): string {
  const diff = ms - now;
  const abs = Math.abs(diff);
  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86400000],
    ["hour", 3600000],
    ["minute", 60000],
  ];
  for (const [unit, size] of steps)
    if (abs >= size) return format.format(Math.round(diff / size), unit);
  return diff >= 0 ? "in less than a minute" : "less than a minute ago";
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export type DurationUnit = "seconds" | "minutes" | "hours" | "days";
export const unitSeconds: Record<DurationUnit, number> = {
  seconds: 1,
  minutes: 60,
  hours: 3600,
  days: 86400,
};
const order: DurationUnit[] = ["seconds", "minutes", "hours", "days"];

/** Units at least as large as the stored unit that still fit inside the allowed maximum. */
export function allowedUnits(base: DurationUnit, max: number): DurationUnit[] {
  const maxSeconds = max * unitSeconds[base];
  const units = order.filter(
    (unit) => unitSeconds[unit] >= unitSeconds[base] && unitSeconds[unit] <= maxSeconds,
  );
  return units.length ? units : [base];
}

/** The largest allowed unit that shows the stored value as a whole number. */
export function bestUnit(value: number, base: DurationUnit, units: DurationUnit[]): DurationUnit {
  const seconds = value * unitSeconds[base];
  const sorted = [...units].sort((a, b) => unitSeconds[b] - unitSeconds[a]);
  return (
    sorted.find((unit) => seconds !== 0 && seconds % unitSeconds[unit] === 0) ??
    [...units].sort((a, b) => unitSeconds[a] - unitSeconds[b])[0] ??
    base
  );
}

export function toUnit(value: number, base: DurationUnit, unit: DurationUnit): number {
  return (value * unitSeconds[base]) / unitSeconds[unit];
}

/** A displayed amount in `unit` → the stored whole number in `base` (rounded). */
export function fromUnit(amount: number, unit: DurationUnit, base: DurationUnit): number {
  return Math.round((amount * unitSeconds[unit]) / unitSeconds[base]);
}

const singular: Record<DurationUnit, string> = {
  seconds: "second",
  minutes: "minute",
  hours: "hour",
  days: "day",
};

/** A stored duration in words: 90 seconds → "90 seconds", 3600 → "1 hour", 0 → "no wait". */
export function formatDuration(value: number, base: DurationUnit = "seconds"): string {
  if (value === 0) return "0 seconds";
  const unit = bestUnit(value, base, order);
  const amount = toUnit(value, base, unit);
  return `${amount} ${amount === 1 ? singular[unit] : unit}`;
}

export function hourLabel(hour: number): string {
  const suffix = hour === 0 ? " (midnight)" : hour === 12 ? " (noon)" : "";
  return `${pad(hour)}:00${suffix}`;
}
