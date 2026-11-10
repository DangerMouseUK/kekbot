import { ZodError } from "zod";
import { isAppError } from "../errors.ts";

/** Discord message presentation: embeds, buttons, custom IDs and plain-English errors. */

export type Embed = {
  title?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
};
export type Button = {
  type: 2;
  style: 1 | 2 | 3 | 4;
  label: string;
  custom_id: string;
  disabled?: boolean;
};
export type Row = { type: 1; components: Button[] };
export type Message = {
  content?: string;
  embeds?: Embed[];
  components?: Row[];
  allowed_mentions: { parse: [] };
};
/** A reply plus an optional replacement for the clicked notification's buttons. */
export type Outcome = { reply: Message; update?: Row[] };

export const colors = {
  success: 0x2f9e6b,
  info: 0x5865f2,
  warning: 0xd4a017,
  error: 0xd9483b,
  neutral: 0x7a8087,
};

// Discord limits: https://docs.discord.com/developers/resources/message#embed-object-embed-limits
const LIMIT = {
  title: 256,
  description: 4096,
  fieldName: 256,
  fieldValue: 1024,
  fields: 25,
  footer: 2048,
  content: 2000,
  label: 80,
  customId: 100,
};

export function clip(text: string, max: number) {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
/** Escape Discord markdown so viewer-provided names and titles render literally. */
export function escape(text: string) {
  return text.replace(/[\\*_~`|>[\]]/g, "\\$&").replace(/\n/g, " ");
}
export function plain(text: string | null | undefined, fallback: string, max = 100) {
  return escape(clip(text?.trim() || fallback, max));
}
export function relative(at: number) {
  return `<t:${Math.floor(at / 1000)}:R>`;
}
export function duration(seconds: number | null | undefined) {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600),
    m = Math.floor((seconds % 3600) / 60),
    s = seconds % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

export function embed(input: Embed): Embed {
  const fields = input.fields?.slice(0, LIMIT.fields).map((field) => ({
    name: clip(field.name || "​", LIMIT.fieldName),
    value: clip(field.value || "​", LIMIT.fieldValue),
    ...(field.inline ? { inline: true } : {}),
  }));
  return {
    ...(input.title ? { title: clip(input.title, LIMIT.title) } : {}),
    ...(input.description ? { description: clip(input.description, LIMIT.description) } : {}),
    color: input.color ?? colors.info,
    ...(fields?.length ? { fields } : {}),
    ...(input.footer ? { footer: { text: clip(input.footer.text, LIMIT.footer) } } : {}),
  };
}
export function message(embeds: Embed[], extra: Partial<Message> = {}): Message {
  return { embeds: embeds.slice(0, 10).map(embed), allowed_mentions: { parse: [] }, ...extra };
}
export function text(content: string): Message {
  return { content: clip(content, LIMIT.content), allowed_mentions: { parse: [] } };
}
export function success(title: string, description?: string, fields?: Embed["fields"]) {
  return message([{ title, description, fields, color: colors.success }]);
}
export function info(title: string, description?: string, fields?: Embed["fields"]) {
  return message([{ title, description, fields, color: colors.info }]);
}
/** A rendered control referred to an older state; describe what is current instead. */
export function changed(
  current: Embed | undefined,
  detail = "Nothing was changed. Here is the current state:",
) {
  return message([
    { title: "This changed", description: detail, color: colors.warning },
    ...(current ? [current] : []),
  ]);
}

// ---- Buttons ---------------------------------------------------------------------------

/** custom_id format: `kb1:<op>:<version>:<id>` (≤100 characters). The ID is last because media and
 * redemption IDs may contain colons. Redemptions have no version column; they use 0 and rely on
 * the one-way pending → decided transition instead. */
export const buttonOps = {
  ma: { action: "media.approve", done: "Approved" },
  mr: { action: "media.reject", done: "Rejected" },
  rc: { action: "reward.complete", done: "Completed" },
  rf: { action: "reward.reject", done: "Refunded" },
  rd: { action: "raffle.draw", done: "Winner drawn" },
} as const;
export type ButtonOp = keyof typeof buttonOps;

export function customId(op: ButtonOp, id: string, version: number) {
  const value = `kb1:${op}:${version}:${id}`;
  return value.length <= LIMIT.customId && /^[\x21-\x7e]+$/.test(id) ? value : undefined;
}
export function parseCustomId(value: string) {
  const match = /^kb1:(ma|mr|rc|rf|rd):(\d{1,12}):([\x21-\x7e]{1,90})$/.exec(value);
  return match ? { op: match[1] as ButtonOp, version: Number(match[2]), id: match[3] } : undefined;
}
export function button(
  label: string,
  style: Button["style"],
  op: ButtonOp,
  id: string,
  version: number,
): Button | undefined {
  const custom = customId(op, id, version);
  return custom
    ? { type: 2, style, label: clip(label, LIMIT.label), custom_id: custom }
    : undefined;
}
export function row(...buttons: (Button | undefined)[]): Row[] {
  const present = buttons.filter((b): b is Button => Boolean(b));
  // All or nothing: never offer Approve without Reject.
  return present.length && present.length === buttons.length
    ? [{ type: 1, components: present }]
    : [];
}
/** Replace a notification's live buttons with one disabled status label. */
export function settled(label: string, style: Button["style"] = 2): Row[] {
  return [
    {
      type: 1,
      components: [
        { type: 2, style, label: clip(label, LIMIT.label), custom_id: "kb1:done", disabled: true },
      ],
    },
  ];
}

// ---- Errors ----------------------------------------------------------------------------

const errors: Record<string, string> = {
  // Authority
  permission_denied: "You don't have permission to do that.",
  owner_required: "Only the installation owner can do that, and not through Discord.",
  discord_permission_denied:
    "Your Discord roles don't grant this KekBot control here. Ask the owner to add a role or user grant for this channel.",
  discord_guild_or_channel_not_allowed: "KekBot controls aren't enabled in this server or channel.",
  account_disabled_or_removed: "That KekBot account is disabled or was removed.",
  api_permission_revoked: "That API token no longer has this permission.",
  operator_acknowledgement_required:
    "This can't be undone. Run it again with `confirm` set to True.",
  // Discord delivery
  discord_interaction_expired: "This command waited too long to run and expired. Try again.",
  discord_not_configured: "Discord isn't connected in KekBot yet.",
  discord_route_revoked: "This channel is no longer routed for KekBot notifications.",
  unsupported_discord_interaction:
    "KekBot doesn't recognise that command or button. Ask the owner to register commands again.",
  invalid_command_input: "One of the options isn't valid.",
  unknown_operation:
    "KekBot doesn't recognise that command. Ask the owner to register commands again.",
  job_backlog_full: "KekBot is very busy right now. Try again in a minute.",
  live_actions_disabled_in_fixture_mode:
    "This installation is in fixture (demo) mode; real provider actions are disabled.",
  // Media
  media_disabled: "Song requests are turned off.",
  media_not_found:
    "No request with that number or ID is in the queue. Use `/kekbot media queue` to see current numbers.",
  media_number_ambiguous:
    "More than one request has that number. Pick the request from the suggestions instead.",
  media_not_waiting: "That request isn't waiting in the approved queue, so it can't be moved.",
  media_changed_reload: "That request changed since you looked at it.",
  invalid_media_transition:
    "That request can't be changed that way in its current state (for example, it's already approved or playing).",
  queue_changed_reload: "The queue changed while moving. Try again.",
  queue_full: "The queue is full.",
  video_already_queued: "That video is already in the queue.",
  request_limit: "That viewer already has the maximum number of requests queued.",
  request_cooldown: "That viewer is on a request cooldown.",
  invalid_youtube_url: "That isn't a supported YouTube link or video ID.",
  player_changed_reload: "The player changed after you sent the command. Try again.",
  player_has_no_current_item: "Nothing is playing, so there's nothing to skip.",
  youtube_key_missing: "The YouTube key isn't configured.",
  youtube_unavailable: "YouTube couldn't be reached.",
  youtube_video_unavailable: "That video is unavailable.",
  youtube_embedding_disabled: "That video doesn't allow embedding.",
  youtube_live_or_duration_unavailable:
    "Live streams and videos without a duration can't be queued.",
  video_duration_rejected: "That video is longer than the configured limit.",
  video_rule_rejected: "That video matches a blocked title or uploader.",
  // Goals
  goal_not_found: "No goal matches that name. Pick one from the suggestions.",
  goal_changed_reload: "That goal changed at the same moment. Try again.",
  // Polls and raffles
  poll_not_found: "No poll matches that name. Pick one from the suggestions.",
  raffle_not_found: "No raffle matches that name. Pick one from the suggestions.",
  activity_not_found: "No poll or raffle matches that name. Pick one from the suggestions.",
  name_ambiguous: "More than one item has that name. Pick one from the suggestions.",
  activity_not_open: "That poll or raffle is already closed.",
  invalid_poll_options:
    "Give 2 to 10 poll options separated by commas or `|`, each at most 80 characters.",
  close_raffle_before_draw:
    "Close the raffle before drawing, or use reroll if a winner was already drawn.",
  raffle_changed_reload: "That raffle changed since this notice was sent.",
  no_eligible_entries: "There are no eligible entries left to draw.",
  poll_closed: "That poll is closed.",
  raffle_closed: "That raffle is closed.",
  open_activity_limit:
    "There are already 10 open polls and raffles. Close one before starting another.",
  discord_commands_outdated:
    "This is the old /kekbot command, which was replaced. Ask the owner to register commands again.",
  configuration_limit:
    "KekBot already has the maximum number of these. Remove old ones in the dashboard first.",
  configuration_changed_reload: "That changed at the same moment. Try again.",
  configuration_not_found: "That item no longer exists.",
  // Rewards and points
  redemption_not_found: "No pending redemption matches. Use `/kekbot reward pending` to list them.",
  redemption_already_decided: "That redemption was already completed or refunded.",
  reward_not_found: "That reward no longer exists.",
  reward_disabled: "That reward or points are turned off.",
  points_disabled: "Points are turned off, so reward and points commands are unavailable.",
  insufficient_points: "That viewer doesn't have enough points.",
  // Moderation and viewers
  viewer_not_found:
    "KekBot hasn't seen a viewer with that name. Pick one from the suggestions or use their numeric Kick ID.",
  message_id_required:
    "Deleting needs the message. Pick it from the suggestions or paste its Kick message ID.",
  duplicate_bulk_target: "The same viewer was listed twice.",
  automatic_moderation_paused: "Automatic moderation is paused.",
};

/** Codes whose presentation is a "this changed" reply rather than a failure. */
export const staleCodes = new Set([
  "media_changed_reload",
  "invalid_media_transition",
  "redemption_already_decided",
  "raffle_changed_reload",
  "close_raffle_before_draw",
  "goal_changed_reload",
  "activity_not_open",
  "player_changed_reload",
  "queue_changed_reload",
]);

export function describeError(code: string) {
  return (
    errors[code] ?? `KekBot couldn't do that. Share the code below with the installation owner.`
  );
}
export function knownErrorCodes() {
  return Object.keys(errors);
}

function zodDetail(error: ZodError) {
  const issue = error.issues[0];
  if (!issue) return describeError("invalid_command_input");
  const field = issue.path.map(String).join(".") || "input";
  return `Check \`${escape(field)}\`: ${issue.message.slice(0, 200)}`;
}

export function errorMessage(error: unknown): Message {
  if (error instanceof ZodError)
    return message([
      {
        title: "That didn't work",
        description: zodDetail(error),
        color: colors.error,
        footer: { text: "Code: invalid_command_input" },
      },
    ]);
  const code = isAppError(error) ? error.code : "invalid_command_input";
  return message([
    {
      title:
        code.endsWith("_denied") || code === "owner_required" ? "Not allowed" : "That didn't work",
      description: describeError(code),
      color: colors.error,
      footer: { text: `Code: ${code}` },
    },
  ]);
}

// ---- Shared views ----------------------------------------------------------------------

export type MediaRow = {
  id: string;
  title: string | null;
  status: string;
  position: number;
  duration?: number | null;
  requesterName?: string | null;
  version: number;
};
const mediaStatus: Record<string, string> = {
  validating: "checking video",
  pending: "awaiting approval",
  approved: "queued",
  playing: "now playing",
  completed: "played",
  skipped: "skipped",
  rejected: "rejected",
  removed: "removed",
  failed: "failed",
};
export function mediaLabel(item: Pick<MediaRow, "position" | "title">) {
  return `#${item.position} · ${plain(item.title, "Untitled video", 80)}`;
}
export function mediaEmbed(item: MediaRow, title?: string): Embed {
  return {
    title: title ?? mediaLabel(item),
    color: colors.neutral,
    fields: [
      { name: "Status", value: mediaStatus[item.status] ?? item.status, inline: true },
      ...(item.duration ? [{ name: "Length", value: duration(item.duration), inline: true }] : []),
      ...(item.requesterName !== undefined
        ? [
            {
              name: "Requested by",
              value: plain(item.requesterName, "Dashboard", 80),
              inline: true,
            },
          ]
        : []),
    ],
  };
}
export function mediaStatusText(status: string) {
  return mediaStatus[status] ?? status;
}
