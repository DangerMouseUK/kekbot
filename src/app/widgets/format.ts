// Pure presentation helpers for OBS sources. They format literal values only; nothing here produces markup.

export type SupportKind = "follow" | "subscription" | "gift" | "support";

export function supportKind(event: unknown): SupportKind {
  if (event === "channel.followed") return "follow";
  if (event === "channel.subscription.new" || event === "channel.subscription.renewal") return "subscription";
  if (event === "channel.subscription.gifts") return "gift";
  return "support";
}

const count = (value: unknown) => (Number.isInteger(value) && Number(value) > 0 ? Number(value) : null);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Human label for an observed supporter event, written to follow the supporter's name. */
export function supportLabel(row: { event?: unknown; months?: unknown; gifts?: unknown }) {
  const months = count(row.months), gifts = count(row.gifts);
  switch (row.event) {
    case "channel.followed": return "followed";
    case "channel.subscription.new": return months && months > 1 ? `subscribed for ${plural(months, "month")}` : "subscribed";
    case "channel.subscription.renewal": return months && months > 1 ? `resubscribed for ${plural(months, "month")}` : "resubscribed";
    case "channel.subscription.gifts": return gifts && gifts > 1 ? `gifted ${gifts} subs` : "gifted a sub";
    default: return "supported the stream";
  }
}

/** Short kicker shown above an alert, derived from the alert configuration's event. */
export function alertKicker(event: unknown) {
  const labels: Record<string, string> = {
    "channel.followed": "New follower", "channel.subscription.new": "New subscriber", "channel.subscription.renewal": "Resubscribed",
    "channel.subscription.gifts": "Gifted subs", goal: "Goal reached", media: "Media request", manual: "Announcement"
  };
  return labels[String(event)] ?? "Alert";
}

const two = (n: number) => String(n).padStart(2, "0");

/** Countdown text: `hh:mm:ss`, or `Nd hh:mm:ss` once a day or more remains. Rounds up so 0.2s left still reads 00:00:01. */
export function formatCountdown(remainingMs: number) {
  const total = Math.max(0, Math.ceil(remainingMs / 1000));
  const days = Math.floor(total / 86400), hours = Math.floor(total % 86400 / 3600), minutes = Math.floor(total % 3600 / 60), seconds = total % 60;
  return `${days ? `${days}d ` : ""}${two(hours)}:${two(minutes)}:${two(seconds)}`;
}

/** Elapsed time such as stream uptime: `m:ss` under an hour, `h:mm:ss` after. */
export function formatElapsed(elapsedMs: number) {
  const total = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(total / 3600), minutes = Math.floor(total % 3600 / 60), seconds = total % 60;
  return hours ? `${hours}:${two(minutes)}:${two(seconds)}` : `${minutes}:${two(seconds)}`;
}

/** Media duration in seconds, or null when unknown. */
export function formatDuration(seconds: unknown) {
  const value = Number(seconds);
  return Number.isFinite(value) && value > 0 ? formatElapsed(value * 1000) : null;
}

export function relativeTime(at: unknown, now: number) {
  const elapsed = Math.max(0, now - Number(at)) / 1000;
  if (!Number.isFinite(elapsed)) return "";
  if (elapsed < 45) return "just now";
  if (elapsed < 3600) return `${Math.max(1, Math.round(elapsed / 60))}m ago`;
  if (elapsed < 86400) return `${Math.round(elapsed / 3600)}h ago`;
  return `${Math.round(elapsed / 86400)}d ago`;
}

export function formatNumber(value: unknown, locale = "en") {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return Math.abs(n) >= 100000 ? new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(n) : new Intl.NumberFormat(locale).format(n);
}

/** Poll rows with whole-number percentages that always sum to 100 when any vote exists (largest remainder). */
export function pollRows(options: readonly unknown[], results: readonly { choice?: unknown; count?: unknown }[]) {
  const counts = options.map((_, index) => Number(results.find(result => String(result.choice) === String(index + 1))?.count ?? 0) || 0);
  const total = counts.reduce((sum, value) => sum + value, 0);
  const exact = counts.map(value => (total ? value * 100 / total : 0));
  const percents = exact.map(Math.floor);
  let spare = total ? 100 - percents.reduce((sum, value) => sum + value, 0) : 0;
  for (const index of exact.map((value, i) => i).sort((a, b) => exact[b] - Math.floor(exact[b]) - (exact[a] - Math.floor(exact[a])) || a - b)) {
    if (spare-- <= 0) break;
    percents[index]++;
  }
  const top = Math.max(0, ...counts);
  return { total, rows: options.map((label, index) => ({ number: index + 1, label: String(label), count: counts[index], percent: percents[index], leading: total > 0 && counts[index] === top })) };
}

export function goalProgress(value: unknown, target: unknown) {
  const current = Math.max(0, Number(value) || 0), goal = Math.max(1, Number(target) || 1);
  return { percent: Math.min(100, Math.floor(current * 100 / goal)), complete: current >= goal };
}

/** Offset to add to the local clock to approximate the server clock, measured when a snapshot arrives. */
export function clockOffset(serverNow: unknown, receivedAt: number) {
  const value = Number(serverNow);
  return Number.isFinite(value) && value > 0 ? value - receivedAt : 0;
}

/** Visibility of a timed card (alert/shoutout) against the server clock: hidden, entering, showing or leaving. */
export function timedPhase(window: { startsAt?: unknown; endsAt?: unknown }, serverNow: number, transitionMs = 600) {
  const ends = Number(window.endsAt);
  if (!Number.isFinite(ends) || ends <= 0) return "showing" as const;
  if (serverNow >= ends) return "hidden" as const;
  if (ends - serverNow <= transitionMs) return "leaving" as const;
  return "showing" as const;
}

/** Chat message fade: visible, fading (during the final second) or gone. `fadeSeconds` 0 disables fading. */
export function chatFade(at: unknown, serverNow: number, fadeSeconds: number) {
  if (!fadeSeconds) return "visible" as const;
  const age = serverNow - Number(at);
  if (!Number.isFinite(age) || age < (fadeSeconds - 1) * 1000) return "visible" as const;
  return age < fadeSeconds * 1000 ? "fading" as const : "gone" as const;
}

export function rotation<T>(items: readonly T[], now: number, periodMs = 8000) {
  return items.length ? { item: items[Math.floor(now / periodMs) % items.length], index: Math.floor(now / periodMs) % items.length } : null;
}

const platforms: [RegExp, string][] = [
  [/(^|[\s/.@])(x\.com|twitter\.com)\b|^(x|twitter)\s*[:\-–]/i, "X"], [/youtube\.com|youtu\.be|^youtube\s*[:\-–]/i, "YouTube"],
  [/instagram\.com|^instagram\s*[:\-–]/i, "Instagram"], [/tiktok\.com|^tiktok\s*[:\-–]/i, "TikTok"], [/discord\.(gg|com)|^discord\s*[:\-–]/i, "Discord"],
  [/kick\.com|^kick\s*[:\-–]/i, "Kick"], [/twitch\.tv|^twitch\s*[:\-–]/i, "Twitch"], [/bsky\.app|^bluesky\s*[:\-–]/i, "Bluesky"]
];
/** Platform name for a socials line, recognised from a domain or a `Name:` prefix. */
export function socialPlatform(line: string) {
  return platforms.find(([pattern]) => pattern.test(line.trim()))?.[1] ?? null;
}
export function socialLines(value: unknown) {
  return String(value ?? "").split(/\n|\s*\|\s*/).map(line => line.trim()).filter(Boolean).slice(0, 20);
}

/** Split text around the first case-sensitive occurrence of `highlight`, for literal emphasis without markup. */
export function splitHighlight(text: string, highlight: unknown) {
  // A highlight covering the whole text (a manual alert's reason) adds no emphasis.
  const needle = typeof highlight === "string" && highlight !== text ? highlight : "";
  const at = needle ? text.indexOf(needle) : -1;
  return at < 0 ? [text] : [text.slice(0, at), needle, text.slice(at + needle.length)];
}

/** Stable React keys for rows that carry no public identifier. */
export function rowKeys(rows: readonly { at?: unknown; name?: unknown }[]) {
  const seen = new Map<string, number>();
  return rows.map(row => {
    const base = `${String(row.at ?? "")}:${String(row.name ?? "")}`;
    const n = seen.get(base) ?? 0; seen.set(base, n + 1);
    return n ? `${base}:${n}` : base;
  });
}

/** Readable text for an AppError code shown in a source status line; the code itself stays the API contract. */
export function humanCode(value: unknown) {
  const text = String(value ?? "");
  return /^[a-z0-9]+(_[a-z0-9]+)+$/.test(text) ? `${text[0].toUpperCase()}${text.slice(1).replaceAll("_", " ")}` : text;
}

const roleOrder = ["broadcaster", "moderator", "vip", "subscriber", "viewer"] as const;
export type ChatRole = (typeof roleOrder)[number];
export function chatRoleOf(value: unknown): ChatRole { return roleOrder.includes(value as ChatRole) ? value as ChatRole : "viewer"; }
export const roleBadge: Record<ChatRole, string | null> = { broadcaster: "Host", moderator: "Mod", vip: "VIP", subscriber: "Sub", viewer: null };
