// Viewer-facing wording for every message KekBot sends to Kick chat.
// Pure functions only: callers read state and pass plain values in. Replies must never
// contain internal IDs, versions, error codes or another viewer's private data.

export const CHAT_LIMIT = 500;
const SAFE_USERNAME = /^[A-Za-z0-9_]{1,50}$/;
const number = new Intl.NumberFormat("en-US");

/** A Kick username that is safe to print or mention, otherwise undefined. */
export function safeUsername(name: string | null | undefined) {
  return name && SAFE_USERNAME.test(name) ? name : undefined;
}

/** Bound a reply to Kick's chat limit without cutting mid-way silently. */
export function fit(text: string, limit = CHAT_LIMIT) {
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;
}

/** Address a sentence to a viewer: "@name, you …" when the username is safe, else the sentence as written. */
export function address(username: string | null | undefined, sentence: string) {
  const safe = safeUsername(username);
  return fit(safe ? `@${safe}, ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}` : sentence);
}

export function points(amount: number) {
  return `${number.format(amount)} ${Math.abs(amount) === 1 ? "point" : "points"}`;
}

/** "10 minutes", "1 hour 5 minutes", "45 seconds" — the two largest non-zero units. */
export function duration(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const parts = [["hour", Math.floor(seconds / 3600)], ["minute", Math.floor((seconds % 3600) / 60)], ["second", seconds % 60]] as const;
  const shown = parts.filter(([, value]) => value > 0).slice(0, 2).map(([unit, value]) => `${number.format(value)} ${unit}${value === 1 ? "" : "s"}`);
  return shown.length ? shown.join(" ") : "0 minutes";
}

export function ordinal(value: number) {
  const tens = value % 100, units = value % 10;
  const suffix = tens >= 11 && tens <= 13 ? "th" : units === 1 ? "st" : units === 2 ? "nd" : units === 3 ? "rd" : "th";
  return `${value}${suffix}`;
}

/** Third-party or owner text shown inside quotes, kept short so one reply fits. */
export function quoted(text: string | null | undefined, max = 80) {
  const clean = (text ?? "").replace(/\s+/g, " ").trim() || "Untitled";
  return `"${clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean}"`;
}

/** The public request number (media.position) that chat shows and Discord accepts. */
export function requestNumber(position: number) {
  return `#${position}`;
}

export type ReplyContext = {
  retryAfterSeconds?: number;
  maxDuration?: number;
  duration?: number;
  perUser?: number;
  rewardName?: string;
  cost?: number;
  balance?: number;
  rewards?: { name: string; cost: number }[];
  options?: string[];
  minPoints?: number;
  pointsEnabled?: boolean;
};

const unavailable = "Song requests are unavailable right now. Please try again later.";

export function optionList(options: string[]) {
  return options.map((option, index) => `${index + 1}) ${option}`).join(" · ");
}

export function rewardList(rewards: { name: string; cost: number }[], limit = 5) {
  const shown = [...rewards].sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name)).slice(0, limit).map(reward => `${reward.name} (${points(reward.cost)})`).join(" · ");
  return rewards.length > limit ? `${shown} · +${rewards.length - limit} more` : shown;
}

/**
 * Map an AppError code reachable from chat to a short, friendly, actionable sentence.
 * Unknown codes fall back to a generic sentence; the code itself is never shown.
 */
export function errorReply(code: string | undefined, context: ReplyContext = {}): string {
  switch (code) {
    // Song requests
    case "media_disabled": return "Song requests are turned off right now.";
    case "invalid_youtube_url": return "That doesn't look like a YouTube video. Use !sr followed by a YouTube link or video ID.";
    case "queue_full": return "The song queue is full right now. Try again after a few songs have played.";
    case "video_already_queued": return "That video is already in the queue.";
    case "request_limit": return context.perUser ? `You already have ${context.perUser} ${context.perUser === 1 ? "request" : "requests"} waiting. You can request again once one has played.` : "You already have the maximum number of requests waiting.";
    case "request_cooldown": return context.retryAfterSeconds && context.retryAfterSeconds > 0 ? `You can request another song in ${duration(context.retryAfterSeconds)}.` : "Please wait a moment before requesting another song.";
    case "youtube_key_missing":
    case "youtube_unavailable":
    case "youtube_quota_or_key_rejected":
    case "youtube_response_invalid": return unavailable;
    case "youtube_video_unavailable": return "That video couldn't be found. It may be private or removed.";
    case "youtube_embedding_disabled": return "That video can't be played on stream because it is private or its owner doesn't allow embedding.";
    case "youtube_live_or_duration_unavailable": return "Live streams and videos without a fixed length can't be requested.";
    case "video_duration_rejected": return context.duration !== undefined && context.duration <= 0 ? "Live streams and videos without a fixed length can't be requested." : context.maxDuration ? `That video is too long. The limit is ${duration(context.maxDuration)}.` : "That video is too long for song requests.";
    case "video_rule_rejected": return "That video isn't allowed by this channel's request rules.";
    // Player
    case "player_has_no_current_item": return "Nothing is playing, so there is nothing to skip.";
    case "player_changed_reload": return "The player just changed. Try again in a moment.";
    // Shoutouts and permissions
    case "provide_channel_username": return "Who should get the shoutout? Use !so followed by a Kick username, for example !so somestreamer.";
    case "permission_denied":
    case "owner_required":
    case "api_permission_revoked":
    case "discord_permission_denied":
    case "account_disabled_or_removed": return "Only moderators can use that command.";
    // Rewards
    case "reward_not_found": return context.pointsEnabled === false ? "Points aren't enabled on this channel." : context.rewards?.length ? `That reward doesn't exist. Try !redeem with one of: ${rewardList(context.rewards)}.` : "That reward doesn't exist, and there are no rewards to redeem right now.";
    case "reward_disabled": return context.pointsEnabled === false ? "Points aren't enabled on this channel." : "That reward isn't available right now.";
    case "insufficient_points": return context.cost !== undefined && context.balance !== undefined ? `${context.rewardName ? quoted(context.rewardName) : "That reward"} costs ${points(context.cost)} and you have ${points(context.balance)}.` : "You don't have enough points for that.";
    // Polls
    case "no_open_poll":
    case "poll_not_found": return "There's no poll open right now.";
    case "poll_closed": return "That poll has already closed.";
    case "invalid_vote": return context.options?.length ? `Vote with a number from 1 to ${context.options.length}: ${optionList(context.options)}.` : "Vote with the number of an option, for example !vote 1.";
    case "vote_already_cast": return "You've already voted in this poll, and changing votes isn't allowed.";
    // Raffles
    case "no_open_raffle":
    case "raffle_not_found": return "There's no raffle open right now.";
    case "raffle_closed": return "That raffle has already closed.";
    case "raffle_ineligible": return context.minPoints && context.balance !== undefined && context.balance < context.minPoints ? `You need at least ${points(context.minPoints)} to enter this raffle. You have ${points(context.balance)}.` : "This raffle is limited to certain viewers, so you can't enter it.";
    default: return code === undefined ? "That command wasn't quite right. Check the format and try again." : "Sorry, that didn't work. Please try again in a moment.";
  }
}

// Song requests ---------------------------------------------------------------

export function requestReceived(username: string | undefined, position: number) {
  return address(username, `Got it! Checking request ${requestNumber(position)} now.`);
}

export function requestQueued(username: string | undefined, position: number, title: string | null, place: number) {
  return address(username, `Request ${requestNumber(position)} ${quoted(title)} is in the queue (${ordinal(place)} in line).`);
}

export function requestAwaitingApproval(username: string | undefined, position: number, title: string | null) {
  return address(username, `Request ${requestNumber(position)} ${quoted(title)} is waiting for a moderator to approve it.`);
}

export function requestRejected(username: string | undefined, position: number, code: string, context: ReplyContext = {}) {
  const reason = errorReply(code, context);
  return address(username, `Request ${requestNumber(position)} wasn't added. ${reason}`);
}

export type QueueEntry = { position: number; title: string | null; requester?: string };

function entry(item: QueueEntry, titleMax: number) {
  const by = safeUsername(item.requester);
  return `${requestNumber(item.position)} ${quoted(item.title, titleMax)}${by ? ` (${by})` : ""}`;
}

export function queue(items: QueueEntry[], total: number, pending: number) {
  const waiting = pending ? ` ${pending} more ${pending === 1 ? "request is" : "requests are"} waiting for approval.` : "";
  if (!items.length) return fit(`The queue is empty.${waiting || " Request a song with !sr and a YouTube link."}`);
  for (const max of [60, 40, 25]) {
    const more = total > items.length ? ` · +${total - items.length} more` : "";
    const text = `Up next: ${items.map(item => entry(item, max)).join(" · ")}${more}.${waiting}`;
    if (text.length <= CHAT_LIMIT) return text;
  }
  return fit(`Up next: ${items.map(item => entry(item, 25)).join(" · ")}.`);
}

export function nowPlaying(item: QueueEntry | undefined) {
  if (!item) return "Nothing is playing right now.";
  const by = safeUsername(item.requester);
  return fit(`Now playing: ${requestNumber(item.position)} ${quoted(item.title, 120)}${by ? `, requested by ${by}` : ""}.`);
}

export function skipped(item: QueueEntry | undefined, next: QueueEntry | undefined) {
  const what = item ? `Skipped ${requestNumber(item.position)} ${quoted(item.title)}.` : "Skipped the current song.";
  return fit(`${what} ${next ? `Next: ${requestNumber(next.position)} ${quoted(next.title)}.` : "The queue is now empty."}`);
}

// Utility commands ------------------------------------------------------------

export function utilityText(kind: "rules" | "discord" | "socials", configured: string) {
  if (configured.trim()) return fit(configured);
  return { rules: "No chat rules have been set up yet.", discord: "No Discord link has been set up yet.", socials: "No social links have been set up yet." }[kind];
}

export function uptime(live: boolean, startedAt: number, now = Date.now()) {
  if (!live) return "The stream is offline right now, or its status isn't available yet.";
  if (!Number.isFinite(startedAt)) return "The stream is live, but its start time isn't available yet.";
  const minutes = Math.max(0, Math.floor((now - startedAt) / 60000));
  return minutes < 1 ? "The stream just went live." : `The stream has been live for ${duration(minutes * 60)}.`;
}

export function shoutout(target: string) {
  return `Go check out ${target} at https://kick.com/${target} and show them some love!`;
}

export function goals(items: { name: string; value: number; target: number; completed?: boolean }[]) {
  if (!items.length) return "There are no active goals right now.";
  const percent = (value: number, target: number) => Math.min(100, Math.floor((value / target) * 100));
  return fit(`Goals: ${items.map(goal => `${goal.name} ${number.format(goal.value)}/${number.format(goal.target)} (${goal.completed || goal.value >= goal.target ? "complete" : `${percent(goal.value, goal.target)}%`})`).join(" · ")}`);
}

export function balance(username: string | undefined, enabled: boolean, amount: number) {
  if (!enabled) return "Points aren't enabled on this channel.";
  return address(username, `You have ${points(amount)}.`);
}

export function watchtime(username: string | undefined, minutes: number) {
  const estimate = minutes > 0 ? `about ${duration(minutes * 60)}` : "less than a minute so far";
  return address(username, `Your estimated watchtime is ${estimate}. It is based on chat activity while the stream is live, so it isn't exact.`);
}

export function leaderboard(rows: { name: string | null; balance: number }[]) {
  if (!rows.length) return "No points have been awarded yet.";
  return fit(`Top points: ${rows.map((row, index) => `${index + 1}. ${safeUsername(row.name) ?? "a viewer"} ${number.format(row.balance)}`).join(" · ")}`);
}

export function redeemed(username: string | undefined, reward: string, cost: number, newBalance: number) {
  return address(username, `You redeemed ${quoted(reward)} for ${points(cost)}. New balance: ${points(newBalance)}. A moderator will take care of it soon.`);
}

export function rewardsAvailable(rewards: { name: string; cost: number }[], enabled: boolean) {
  if (!enabled) return "Points aren't enabled on this channel.";
  if (!rewards.length) return "There are no rewards to redeem right now.";
  return fit(`Redeem with !redeem <reward>: ${rewardList(rewards, 8)}`);
}

export function pollOptions(name: string, options: string[]) {
  return fit(`Poll ${quoted(name)}: vote with !vote <number>. ${optionList(options)}`);
}

export function voted(username: string | undefined, choice: number, option: string) {
  return address(username, `Your vote for ${choice}) ${quoted(option)} is in.`);
}

export function entered(username: string | undefined, raffle: string) {
  return address(username, `You're entered in the ${quoted(raffle)} raffle. Good luck!`);
}

// !commands ---------------------------------------------------------------------

export type CommandGroup = { key: string; label: string; commands: { trigger: string; help?: string }[]; custom?: boolean };

export function commandSummary(groups: CommandGroup[]) {
  const visible = groups.filter(group => group.commands.length);
  if (!visible.length) return "No commands are available right now.";
  const hint = " · Details: !commands <group>";
  const render = (limit: number) => `Commands — ${visible.map(group => {
    const shown = group.commands.slice(0, limit).map(command => command.trigger).join(" ");
    return `${group.label}: ${shown}${group.commands.length > limit ? ` +${group.commands.length - limit}` : ""}`;
  }).join(" | ")}${hint}`;
  for (const limit of [20, 10, 6, 4, 2]) {
    const text = render(limit);
    if (text.length <= CHAT_LIMIT) return text;
  }
  return fit(render(1));
}

export function commandDetail(groups: CommandGroup[], requested: string) {
  const wanted = requested.trim().toLowerCase();
  const matches = groups.filter(group => group.commands.length && (group.key === wanted || group.label.toLowerCase() === wanted));
  if (!matches.length) {
    const names = groups.filter(group => group.commands.length).map(group => group.key).join(", ");
    // Never repeat the viewer's argument: chat must not echo arbitrary viewer text.
    return fit(`That isn't a command group. Try one of: ${names || "none available"}.`);
  }
  return fit(matches.map(group => `${group.label}: ${group.commands.map(command => command.help ? `${command.trigger} ${command.help}` : command.trigger).join(" · ")}`).join(" | "));
}
