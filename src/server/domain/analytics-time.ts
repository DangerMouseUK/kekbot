/**
 * Calendar days in a viewer's IANA time zone, using only the built-in Intl time-zone data.
 * Day boundaries are real local midnights, so a daylight-saving day lasts 23 or 25 hours.
 */

const HOUR = 3_600_000;
/** Latest instant whose ISO date is still a four-digit year (9999-12-31T23:59:59.999Z). */
export const MAX_TIME = 253_402_300_799_999;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  let format = formatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    if (formatters.size < 1000) formatters.set(timeZone, format);
  }
  return format;
}

/** True for a time-zone name this runtime's Intl data recognises, e.g. "Europe/London". */
export function validTimeZone(timeZone: string) {
  if (timeZone.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(timeZone)) return false;
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

function parts(at: number, timeZone: string) {
  const values: Record<string, number> = {};
  for (const part of formatter(timeZone).formatToParts(at))
    if (part.type !== "literal") values[part.type] = Number(part.value);
  return values as Record<"year" | "month" | "day" | "hour" | "minute" | "second", number>;
}

const key = (year: number, month: number, day: number) =>
  `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/** The local calendar date of an instant, as YYYY-MM-DD. */
export function localDay(at: number, timeZone: string) {
  const p = parts(at, timeZone);
  return key(p.year, p.month, p.day);
}

function offsetAt(at: number, timeZone: string) {
  const p = parts(at, timeZone);
  return (
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(at / 1000) * 1000
  );
}

/** First instant of a local calendar date. Handles zones whose midnight is skipped or repeated. */
export function localMidnight(year: number, month: number, day: number, timeZone: string) {
  const wall = Date.UTC(year, month - 1, day),
    target = key(year, month, day);
  let guess = wall - offsetAt(wall, timeZone);
  guess = wall - offsetAt(guess, timeZone);
  if (localDay(guess, timeZone) === target && localDay(guess - 1, timeZone) < target) return guess;
  // UTC offsets lie within −12/+14 hours, so the boundary is inside this window.
  let low = wall - 15 * HOUR,
    high = wall + 15 * HOUR;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (localDay(middle, timeZone) >= target) high = middle;
    else low = middle;
  }
  return high;
}

export type LocalDay = { day: string; start: number; end: number };

/** Local calendar days overlapping [from, to], each with its real start and (exclusive) end. */
export function localDays(from: number, to: number, timeZone: string, limit: number) {
  const days: LocalDay[] = [];
  const first = parts(from, timeZone);
  let date = new Date(Date.UTC(first.year, first.month - 1, first.day));
  let start = localMidnight(first.year, first.month, first.day, timeZone);
  while (start <= to && days.length < limit) {
    const day = key(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
    date = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
    const end = localMidnight(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate(),
      timeZone,
    );
    days.push({ day, start, end });
    start = end;
  }
  return days;
}
