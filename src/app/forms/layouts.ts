// Per-kind form layouts: grouped sections, plain-English labels, help text and which
// fields matter for the chosen type. Bounds and validity come from catalog.ts (see schema.ts);
// this file only describes presentation. Hidden fields keep their stored values.
import type { Kind } from "../../server/domain/catalog.ts";
import type { DurationUnit } from "./time.ts";

export type Data = Record<string, unknown>;
export type Option = { value: string; label: string; help?: string };

export type Control =
  | { type: "text"; placeholder?: string; normalize?: (value: string) => string; mono?: boolean }
  | { type: "textarea"; rows?: number; placeholder?: string }
  | { type: "toggle" }
  | { type: "select"; options: Option[] }
  | { type: "number"; suffix?: string; step?: number }
  | { type: "duration"; base: DurationUnit }
  | { type: "datetime"; optional: boolean }
  | { type: "chips"; item: string; placeholder?: string; normalize?: (value: string) => string }
  | { type: "list"; item: string; add: string; multiline: boolean; variables?: "command" | "timer" }
  | { type: "template" }
  | { type: "checks"; options: Option[] }
  | { type: "timezone" }
  | { type: "hour" }
  | { type: "volume" }
  | { type: "asset"; accept: "image" | "sound" }
  | { type: "target" }
  | { type: "grants"; noun: "role" | "user" }
  | { type: "viewer" }
  | { type: "winners" }
  | { type: "json" };

export type FieldSpec = {
  key: string;
  label: string | ((data: Data) => string);
  help?: string | ((data: Data) => string);
  control: Control;
  visible?: (data: Data) => boolean;
  /** Message for a pattern (`invalid_format`) failure. */
  format?: string;
  wide?: boolean;
};

export type Section = {
  title: string;
  description?: string | ((data: Data) => string);
  fields: FieldSpec[];
  preview?: "command" | "timer" | "alert";
  visible?: (data: Data) => boolean;
};

export const labelOf = (spec: FieldSpec, data: Data) =>
  typeof spec.label === "function" ? spec.label(data) : spec.label;
export const helpOf = (spec: FieldSpec, data: Data) =>
  typeof spec.help === "function" ? spec.help(data) : spec.help;

// Normalizers applied when a person finishes typing, so "Welcome" becomes "!welcome".
export const normalizeTrigger = (value: string) => {
  // Runs on every keystroke: keep a typed space as "_" so "welcome back" stays readable.
  const cleaned = value.replace(/^\s+/, "").toLowerCase().replace(/\s+/g, "_");
  return cleaned === "" || cleaned.startsWith("!") ? cleaned : `!${cleaned}`;
};
export const normalizeDomain = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#:].*$/, "")
    .replace(/\.$/, "");
const trimmed = (value: string) => value.trim();

const chatRoles: Option[] = [
  { value: "viewer", label: "Viewers" },
  { value: "subscriber", label: "Subscribers" },
  { value: "vip", label: "VIPs" },
  { value: "moderator", label: "Moderators" },
  { value: "broadcaster", label: "Broadcaster (you)" },
];
const roleHelp =
  "Each viewer counts as one role, checked in the order broadcaster → moderator → VIP → subscriber → viewer. Ticking Subscribers alone does not include moderators or you.";

const actions: Option[] = [
  { value: "warn", label: "Warn in chat" },
  { value: "delete", label: "Delete the message" },
  { value: "timeout", label: "Time out the viewer" },
  { value: "ban", label: "Ban the viewer" },
];

const name = (help: string): FieldSpec => ({
  key: "name",
  label: "Name",
  help,
  control: { type: "text" },
});
const enabled = (help: string): FieldSpec => ({
  key: "enabled",
  label: "Enabled",
  help,
  control: { type: "toggle" },
});

export const widgetTypes: Option[] = [
  { value: "alerts", label: "Alerts", help: "Shows queued alerts with their image and sound." },
  { value: "chat", label: "Chat", help: "Recent chat that passed moderation." },
  {
    value: "player",
    label: "Media player",
    help: "The visible YouTube player for approved requests.",
  },
  { value: "nowplaying", label: "Now playing", help: "Current media title and requester." },
  { value: "queue", label: "Request queue", help: "Approved requests waiting to play." },
  { value: "eventfeed", label: "Event feed", help: "Recent follows and subscriptions." },
  {
    value: "supporter",
    label: "Latest supporter",
    help: "The most recent follow or subscription.",
  },
  { value: "goal", label: "Goal", help: "Progress for one goal, or all enabled goals." },
  { value: "multigoal", label: "Several goals", help: "Progress bars for several goals." },
  { value: "status", label: "Stream status", help: "Live/offline state and viewer count." },
  { value: "counter", label: "Command counter", help: "The counter of one custom command." },
  { value: "leaderboard", label: "Points leaderboard", help: "Highest point balances." },
  { value: "poll", label: "Poll", help: "Latest or chosen poll with vote totals." },
  { value: "raffle", label: "Raffle", help: "Latest or chosen raffle and its winners." },
  { value: "countdown", label: "Countdown", help: "Time remaining until a date and time." },
  { value: "shoutout", label: "Shoutout", help: "The latest moderator !so shoutout." },
  {
    value: "socials",
    label: "Socials",
    help: "Your Socials text from Maintenance → Edit settings.",
  },
  { value: "activity", label: "Activity ticker", help: "Rotating recent supporter activity." },
];
const limitTypes = ["chat", "queue", "eventfeed", "goal", "multigoal", "leaderboard", "activity"];
export const targetTypes = ["goal", "multigoal", "poll", "raffle", "counter"];

const ruleThreshold: Record<string, { label: string; help: string; suffix: string }> = {
  repetition: {
    label: "Repeats before acting",
    help: "Act when the same viewer sends the same message this many times within the window (counting the new one).",
    suffix: "messages",
  },
  burst: {
    label: "Messages before acting",
    help: "Act when one viewer sends this many messages within the window (counting the new one).",
    suffix: "messages",
  },
  caps: {
    label: "Capital letters",
    help: "Act when at least this percentage of letters are capitals. Messages with fewer than 10 letters are ignored.",
    suffix: "%",
  },
};
const usesTimeout = (data: Data) =>
  data.action === "timeout" || (data.escalation === true && data.escalationAction === "timeout");

export const layouts: Record<Kind, Section[]> = {
  command: [
    {
      title: "Basics",
      fields: [
        name("Only you see this name; it labels the command card."),
        enabled("Turn off to stop the command responding without deleting it."),
        {
          key: "trigger",
          label: "Trigger",
          help: "What viewers type in chat, e.g. !welcome. Lowercase letters, numbers and _ only.",
          control: {
            type: "text",
            placeholder: "!welcome",
            normalize: normalizeTrigger,
            mono: true,
          },
          format:
            "Start with ! then 1–32 lowercase letters, numbers or underscores, e.g. !welcome.",
        },
        {
          key: "aliases",
          label: "Other triggers (aliases)",
          help: "Extra words that run the same command, e.g. !hi. They share its cooldown and counter.",
          control: {
            type: "chips",
            item: "alias",
            placeholder: "!hi",
            normalize: normalizeTrigger,
          },
          format: "Each alias starts with ! then lowercase letters, numbers or underscores.",
          wide: true,
        },
        {
          key: "group",
          label: "Group",
          help: "Groups related commands together, e.g. General or Games.",
          control: { type: "text" },
        },
      ],
    },
    {
      title: "Responses",
      description:
        "KekBot replies with one of these, picked at random each time. Add a few to keep it fresh.",
      preview: "command",
      fields: [
        {
          key: "responses",
          label: "Responses",
          control: {
            type: "list",
            item: "Response",
            add: "Add response",
            multiline: true,
            variables: "command",
          },
          wide: true,
        },
      ],
    },
    {
      title: "Who can use it and when",
      fields: [
        {
          key: "roles",
          label: "Allowed roles",
          help: `Leave all unticked to allow everyone. ${roleHelp}`,
          control: { type: "checks", options: chatRoles },
          wide: true,
        },
        {
          key: "condition",
          label: "When it works",
          control: {
            type: "select",
            options: [
              { value: "always", label: "Any time" },
              { value: "live", label: "Only while live" },
              { value: "offline", label: "Only while offline" },
            ],
          },
        },
        {
          key: "streamOnly",
          label: "Require a live stream",
          help: "Also requires KekBot to have seen your stream go live. Works together with the setting above.",
          control: { type: "toggle" },
        },
        {
          key: "cooldown",
          label: "Cooldown for everyone",
          help: "After anyone uses it, wait this long before it responds again. 0 means no wait.",
          control: { type: "duration", base: "seconds" },
        },
        {
          key: "userCooldown",
          label: "Cooldown per viewer",
          help: "How long each viewer waits before using it again. 0 means no wait.",
          control: { type: "duration", base: "seconds" },
        },
        {
          key: "counter",
          label: "Count uses",
          help: "Keep a running total for {counter} and the Command counter widget.",
          control: { type: "toggle" },
        },
      ],
    },
  ],
  timer: [
    {
      title: "Basics",
      fields: [
        name("Only you see this name."),
        enabled("Turn off to stop this timer without deleting it."),
      ],
    },
    {
      title: "Messages",
      description: "KekBot posts these in order, one each time the timer fires.",
      preview: "timer",
      fields: [
        {
          key: "messages",
          label: "Messages",
          control: {
            type: "list",
            item: "Message",
            add: "Add message",
            multiline: true,
            variables: "timer",
          },
          wide: true,
        },
      ],
    },
    {
      title: "Schedule",
      fields: [
        {
          key: "interval",
          label: "Post every",
          help: "Time between messages. Missed sends are not caught up later.",
          control: { type: "duration", base: "seconds" },
        },
        {
          key: "minMessages",
          label: "Chat messages needed in between",
          help: "Skip a send until chat has had this many messages since the last one. 0 posts regardless.",
          control: { type: "number", suffix: "messages" },
        },
        {
          key: "streamOnly",
          label: "Only while live",
          help: "Only post while KekBot sees your stream as live.",
          control: { type: "toggle" },
        },
      ],
    },
    {
      title: "Quiet hours",
      description:
        "Optionally stop posting during part of the day, e.g. 22:00 to 07:00. Set both or neither.",
      fields: [
        {
          key: "timezone",
          label: "Timezone",
          help: "Quiet hours follow this timezone.",
          control: { type: "timezone" },
          wide: true,
        },
        {
          key: "quietStart",
          label: "Quiet from",
          help: "First quiet hour (included).",
          control: { type: "hour" },
        },
        {
          key: "quietEnd",
          label: "Quiet until",
          help: "Posting resumes at this hour.",
          control: { type: "hour" },
        },
      ],
    },
  ],
  alert: [
    {
      title: "Basics",
      fields: [
        name("Only you see this name."),
        enabled("Turn off to stop this alert without deleting it."),
        {
          key: "event",
          label: "Show this alert for",
          control: {
            type: "select",
            options: [
              { value: "channel.followed", label: "New follower" },
              { value: "channel.subscription.new", label: "New subscriber" },
              { value: "channel.subscription.renewal", label: "Resubscription" },
              { value: "channel.subscription.gifts", label: "Gifted subscriptions" },
              { value: "manual", label: "Manual alert or reward" },
              { value: "goal", label: "Goal completed" },
              { value: "media", label: "New media request" },
            ],
          },
          wide: true,
        },
      ],
    },
    {
      title: "Message",
      preview: "alert",
      fields: [
        {
          key: "template",
          label: "Alert text",
          help: "Shown on stream. Use the variable buttons to insert details about the event.",
          control: { type: "template" },
          wide: true,
        },
      ],
    },
    {
      title: "Image and sound",
      fields: [
        {
          key: "image",
          label: "Image",
          help: "PNG, JPG, GIF or WebP.",
          control: { type: "asset", accept: "image" },
        },
        {
          key: "sound",
          label: "Sound",
          help: "WAV, OGG or MP3.",
          control: { type: "asset", accept: "sound" },
        },
        {
          key: "volume",
          label: "Sound volume",
          help: "Separate from the media player volume.",
          control: { type: "volume" },
        },
      ],
    },
    {
      title: "Display",
      fields: [
        {
          key: "duration",
          label: "Show for",
          help: "How long the alert stays on screen.",
          control: { type: "duration", base: "seconds" },
        },
        {
          key: "priority",
          label: "Priority",
          help: "When several alerts are waiting, higher numbers show first.",
          control: { type: "number" },
        },
        {
          key: "animation",
          label: "Animation",
          control: {
            type: "select",
            options: [
              { value: "fade", label: "Fade" },
              { value: "slide", label: "Slide" },
              { value: "none", label: "None" },
            ],
          },
        },
      ],
    },
  ],
  widget: [
    {
      title: "Basics",
      fields: [
        name("Only you see this name."),
        enabled("A disabled widget shows nothing in OBS."),
        {
          key: "type",
          label: "What it shows",
          help: (data) => widgetTypes.find((type) => type.value === data.type)?.help ?? "",
          control: { type: "select", options: widgetTypes },
          wide: true,
        },
      ],
    },
    {
      title: "Content",
      description: (data) =>
        data.type === "socials"
          ? "This widget shows the Socials text from Maintenance → Edit settings."
          : data.type === "shoutout"
            ? "This widget shows the latest moderator !so shoutout."
            : "",
      fields: [
        {
          key: "target",
          label: (data) =>
            data.type === "counter"
              ? "Command"
              : data.type === "poll"
                ? "Poll"
                : data.type === "raffle"
                  ? "Raffle"
                  : "Goal",
          help: (data) =>
            data.type === "counter"
              ? "Choose a command with Count uses turned on."
              : "Leave on automatic to follow the latest one, or pick a specific one.",
          control: { type: "target" },
          visible: (data) => targetTypes.includes(String(data.type)),
          wide: true,
        },
        {
          key: "text",
          label: "Countdown label",
          help: "Optional text shown with the countdown, e.g. Stream starts in.",
          control: { type: "text" },
          visible: (data) => data.type === "countdown",
        },
        {
          key: "endsAt",
          label: "Count down to",
          control: { type: "datetime", optional: true },
          visible: (data) => data.type === "countdown",
        },
        {
          key: "limit",
          label: "Items to show",
          help: "Maximum number of rows, messages or goals.",
          control: { type: "number", suffix: "items" },
          visible: (data) => limitTypes.includes(String(data.type)),
        },
      ],
    },
    {
      title: "Look",
      fields: [
        {
          key: "theme",
          label: "Theme",
          control: {
            type: "select",
            options: [
              { value: "mint", label: "Mint (green)" },
              { value: "midnight", label: "Midnight (dark blue)" },
              { value: "paper", label: "Paper (light)" },
            ],
          },
        },
        {
          key: "width",
          label: "Width",
          help: "Match the OBS Browser Source width.",
          control: { type: "number", suffix: "px" },
        },
        {
          key: "height",
          label: "Height",
          help: "Match the OBS Browser Source height.",
          control: { type: "number", suffix: "px" },
        },
        {
          key: "reducedMotion",
          label: "Reduce motion",
          help: "Minimise animation on stream.",
          control: { type: "toggle" },
        },
      ],
    },
  ],
  rule: [
    {
      title: "Basics",
      fields: [
        name("Shown to moderators and used as the reason for actions."),
        enabled(
          "New rules start turned off. Test the rule first, then turn it on when you are ready.",
        ),
        {
          key: "type",
          label: "What to look for",
          control: {
            type: "select",
            options: [
              { value: "link", label: "Links to other websites" },
              { value: "phrase", label: "Blocked words or phrases" },
              { value: "repetition", label: "The same message repeated" },
              { value: "caps", label: "Too many capital letters" },
              { value: "burst", label: "Too many messages at once" },
            ],
          },
          wide: true,
        },
      ],
    },
    {
      title: "What counts",
      fields: [
        {
          key: "allowedDomains",
          label: "Allowed websites",
          help: "Links to these sites (and their subdomains) are fine, e.g. youtube.com. Every other link matches.",
          control: {
            type: "chips",
            item: "website",
            placeholder: "youtube.com",
            normalize: normalizeDomain,
          },
          format: "Enter just the website name, e.g. youtube.com (letters, numbers, dots, dashes).",
          visible: (data) => data.type === "link",
          wide: true,
        },
        {
          key: "patterns",
          label: "Blocked words or phrases",
          help: "A message matches if it contains any of these anywhere (capitals are ignored).",
          control: { type: "chips", item: "phrase", normalize: trimmed },
          visible: (data) => data.type === "phrase",
          wide: true,
        },
        {
          key: "threshold",
          label: (data) => ruleThreshold[String(data.type)]?.label ?? "Threshold",
          help: (data) => ruleThreshold[String(data.type)]?.help ?? "",
          control: { type: "number" },
          visible: (data) => ["repetition", "burst", "caps"].includes(String(data.type)),
        },
        {
          key: "windowSeconds",
          label: "Within",
          help: "How far back to look at the viewer's recent messages (up to 10 minutes).",
          control: { type: "duration", base: "seconds" },
          visible: (data) => ["repetition", "burst"].includes(String(data.type)),
        },
        {
          key: "trustedRoles",
          label: "Roles the rule ignores",
          help: roleHelp,
          control: { type: "checks", options: chatRoles },
          wide: true,
        },
      ],
    },
    {
      title: "What happens",
      fields: [
        { key: "action", label: "Action", control: { type: "select", options: actions } },
        {
          key: "duration",
          label: "Timeout length",
          help: "How long a timeout lasts (up to 7 days).",
          control: { type: "duration", base: "minutes" },
          visible: usesTimeout,
        },
        {
          key: "escalation",
          label: "Escalate repeat offences",
          help: "Use a stronger action when the same viewer keeps matching this rule.",
          control: { type: "toggle" },
        },
        {
          key: "escalationAfter",
          label: "Escalate after",
          help: "Number of earlier matches before the stronger action is used.",
          control: { type: "number", suffix: "earlier matches" },
          visible: (data) => data.escalation === true,
        },
        {
          key: "escalationWindowSeconds",
          label: "Counting matches within",
          help: "Only earlier matches this recent count.",
          control: { type: "duration", base: "seconds" },
          visible: (data) => data.escalation === true,
        },
        {
          key: "escalationAction",
          label: "Stronger action",
          control: { type: "select", options: actions },
          visible: (data) => data.escalation === true,
        },
      ],
    },
    {
      title: "Active period",
      description:
        "Optional. Leave both blank for a rule that is always active while enabled. Times are in your computer's timezone.",
      fields: [
        {
          key: "startsAt",
          label: "Starts",
          control: { type: "datetime", optional: true },
        },
        {
          key: "endsAt",
          label: "Ends",
          help: "The rule stops matching at this time.",
          control: { type: "datetime", optional: true },
        },
      ],
    },
  ],
  goal: [
    {
      title: "Goal",
      fields: [
        name("Shown on stream, e.g. Follower goal."),
        enabled("A disabled goal is hidden from goal widgets and !goal."),
        {
          key: "metric",
          label: "What it counts",
          control: {
            type: "select",
            options: [
              { value: "manual", label: "Manual — you adjust it yourself" },
              { value: "follow", label: "New followers" },
              { value: "subscription", label: "Subscriptions (gifts count each one)" },
              { value: "points", label: "Points earned by viewers" },
              { value: "media", label: "Media requests" },
            ],
          },
          wide: true,
        },
        {
          key: "target",
          label: "Target",
          help: "The goal completes when progress reaches this number.",
          control: { type: "number" },
        },
      ],
    },
    {
      title: "Progress",
      description:
        "Progress updates automatically from events. Use Adjust and Reset on the goal card for day-to-day changes.",
      fields: [
        {
          key: "value",
          label: "Current progress",
          control: { type: "number" },
        },
        {
          key: "completed",
          label: "Marked complete",
          help: "Set automatically when the target is reached.",
          control: { type: "toggle" },
        },
      ],
    },
  ],
  reward: [
    {
      title: "Reward",
      fields: [
        name("Viewers redeem it in chat with !redeem followed by this name."),
        enabled("Turn off to stop new redemptions."),
        {
          key: "cost",
          label: "Cost",
          help: "Points a viewer spends to redeem it.",
          control: { type: "number", suffix: "points" },
        },
        {
          key: "description",
          label: "Description",
          help: "Optional. What the viewer gets; shown in an alert-type reward.",
          control: { type: "textarea", rows: 2 },
          wide: true,
        },
        {
          key: "fulfillment",
          label: "When a moderator completes it",
          help: "Every redemption waits for a moderator to complete or refund it.",
          control: {
            type: "select",
            options: [
              { value: "manual", label: "Just mark it done" },
              { value: "alert", label: "Also show a Manual alert on stream" },
            ],
          },
          wide: true,
        },
      ],
    },
  ],
  poll: [
    {
      title: "Poll",
      fields: [
        name("The question, e.g. Which game next?"),
        enabled("A disabled poll ignores votes."),
        {
          key: "options",
          label: "Choices",
          help: "Viewers vote with !vote 1, !vote 2 and so on, in this order.",
          control: { type: "list", item: "Choice", add: "Add choice", multiline: false },
          wide: true,
        },
      ],
    },
    {
      title: "Voting",
      fields: [
        {
          key: "endsAt",
          label: "Voting closes",
          control: { type: "datetime", optional: false },
        },
        {
          key: "status",
          label: "Status",
          help: "Use Close on the poll card to end voting early.",
          control: {
            type: "select",
            options: [
              { value: "open", label: "Open for votes" },
              { value: "closed", label: "Closed" },
            ],
          },
        },
        {
          key: "allowChange",
          label: "Let viewers change their vote",
          control: { type: "toggle" },
        },
      ],
    },
  ],
  raffle: [
    {
      title: "Raffle",
      fields: [
        name("Shown on stream, e.g. Weekend giveaway."),
        enabled("A disabled raffle ignores entries."),
        {
          key: "endsAt",
          label: "Entries close",
          control: { type: "datetime", optional: false },
        },
        {
          key: "status",
          label: "Status",
          help: "Use Close and Draw on the raffle card rather than changing this by hand.",
          control: {
            type: "select",
            options: [
              { value: "open", label: "Open for entries" },
              { value: "closed", label: "Closed" },
              { value: "drawn", label: "Winner drawn" },
            ],
          },
        },
      ],
    },
    {
      title: "Who can enter",
      description: "Viewers enter by typing !enter in chat.",
      fields: [
        {
          key: "roles",
          label: "Allowed roles",
          help: `Leave all unticked to allow everyone. ${roleHelp}`,
          control: { type: "checks", options: chatRoles },
          wide: true,
        },
        {
          key: "minPoints",
          label: "Minimum points balance",
          help: "Viewers need at least this many points to enter. 0 allows anyone.",
          control: { type: "number", suffix: "points" },
        },
        { key: "winners", label: "Winners", control: { type: "winners" }, wide: true },
      ],
    },
  ],
  note: [
    {
      title: "Moderator note",
      description: "Private to moderators. Notes are never shown on stream or in chat.",
      fields: [
        name("A short label, e.g. Warned about spoilers."),
        enabled("Kept for your records; turning it off does not hide the note."),
        {
          key: "viewer",
          label: "Viewer",
          help: "Start typing a recent viewer's name, or paste their numeric Kick viewer ID.",
          control: { type: "viewer" },
          format: "Choose a viewer from the list, or enter their numeric Kick viewer ID.",
        },
        {
          key: "text",
          label: "Note",
          control: { type: "textarea", rows: 4 },
          wide: true,
        },
      ],
    },
  ],
  guild: [
    {
      title: "Discord server and channel",
      description:
        "To copy IDs, turn on Developer Mode in Discord (User Settings → Advanced), then right-click the server or channel and choose Copy ID.",
      fields: [
        name("A label for this route, e.g. Main server announcements."),
        enabled("A disabled route ignores commands and stops notifications."),
        {
          key: "guildId",
          label: "Server ID",
          control: { type: "text", mono: true, normalize: trimmed },
          format: "A Discord server ID is 1–24 digits only.",
        },
        {
          key: "channelId",
          label: "Channel ID",
          help: "Notifications go here, and /kekbot commands are only accepted here.",
          control: { type: "text", mono: true, normalize: trimmed },
          format: "A Discord channel ID is 1–24 digits only.",
        },
      ],
    },
    {
      title: "Notifications",
      fields: [
        {
          key: "events",
          label: "Post to this channel when",
          control: {
            type: "checks",
            options: [
              { value: "live", label: "You go live" },
              { value: "offline", label: "Your stream ends" },
              { value: "alert", label: "An alert is shown" },
              { value: "media", label: "Media requests change" },
              { value: "goal", label: "A goal completes" },
              { value: "moderation", label: "A moderation action is taken" },
              { value: "engagement", label: "Polls, raffles and rewards update" },
            ],
          },
          wide: true,
        },
      ],
    },
    {
      title: "Who can use /kekbot commands",
      description:
        "Nobody can run commands until you grant a permission. Add a row per role or person; repeat an ID to grant several permissions. Discord's Administrator permission does not bypass these.",
      fields: [
        {
          key: "roles",
          label: "Discord roles",
          control: { type: "grants", noun: "role" },
          wide: true,
        },
        {
          key: "users",
          label: "Individual Discord users",
          control: { type: "grants", noun: "user" },
          wide: true,
        },
      ],
    },
  ],
  settings: [
    {
      title: "Chat text",
      fields: [
        {
          key: "name",
          label: "Instance name",
          help: "Used for {channel} in commands and timers.",
          control: { type: "text" },
        },
        {
          key: "rules",
          label: "!rules reply",
          control: { type: "textarea", rows: 2 },
          wide: true,
        },
        {
          key: "discord",
          label: "!discord reply",
          control: { type: "textarea", rows: 2 },
          wide: true,
        },
        {
          key: "socials",
          label: "!socials reply",
          help: "Also shown by the Socials widget.",
          control: { type: "textarea", rows: 2 },
          wide: true,
        },
      ],
    },
    {
      title: "Media requests",
      fields: [
        {
          key: "mediaEnabled",
          label: "Allow media requests",
          help: "Viewers can request YouTube videos with !sr. Also needs YouTube set up and a player widget in OBS.",
          control: { type: "toggle" },
          wide: true,
        },
        {
          key: "autoApprove",
          label: "Approve viewer requests automatically",
          help: "Otherwise each request waits for a moderator.",
          control: { type: "toggle" },
          visible: (data) => data.mediaEnabled === true,
        },
        {
          key: "allowDuplicates",
          label: "Allow the same video twice in the queue",
          control: { type: "toggle" },
          visible: (data) => data.mediaEnabled === true,
        },
        {
          key: "maxDuration",
          label: "Longest video allowed",
          control: { type: "duration", base: "seconds" },
          visible: (data) => data.mediaEnabled === true,
        },
        {
          key: "capacity",
          label: "Queue size",
          help: "Most requests waiting or playing at once.",
          control: { type: "number", suffix: "requests" },
          visible: (data) => data.mediaEnabled === true,
        },
        {
          key: "perUser",
          label: "Requests per viewer",
          help: "Most active requests one viewer can have.",
          control: { type: "number", suffix: "requests" },
          visible: (data) => data.mediaEnabled === true,
        },
        {
          key: "requestCooldown",
          label: "Wait between a viewer's requests",
          control: { type: "duration", base: "seconds" },
          visible: (data) => data.mediaEnabled === true,
        },
        {
          key: "blockedUploaders",
          label: "Blocked channels",
          help: "YouTube channel names to reject (exact name, capitals ignored).",
          control: { type: "chips", item: "channel", normalize: trimmed },
          visible: (data) => data.mediaEnabled === true,
          wide: true,
        },
        {
          key: "blockedTitles",
          label: "Blocked title words",
          help: "Reject videos whose title contains any of these (capitals ignored).",
          control: { type: "chips", item: "word", normalize: trimmed },
          visible: (data) => data.mediaEnabled === true,
          wide: true,
        },
      ],
    },
    {
      title: "Points",
      fields: [
        {
          key: "pointsEnabled",
          label: "Give viewers points",
          help: "Viewers earn points for chatting while you are live, and spend them on rewards.",
          control: { type: "toggle" },
          wide: true,
        },
        {
          key: "pointsAmount",
          label: "Points per award",
          control: { type: "number", suffix: "points" },
          visible: (data) => data.pointsEnabled === true,
        },
        {
          key: "pointsInterval",
          label: "Award every",
          help: "Also the step used to estimate watchtime.",
          control: { type: "duration", base: "seconds" },
          visible: (data) => data.pointsEnabled === true,
        },
        {
          key: "activeWindow",
          label: "Counts as active if they chatted within",
          help: "Silent viewers do not earn points.",
          control: { type: "duration", base: "seconds" },
          visible: (data) => data.pointsEnabled === true,
        },
      ],
    },
    {
      title: "Emergency pauses",
      fields: [
        {
          key: "moderationPaused",
          label: "Pause automatic moderation",
          help: "Rules and incident presets stop acting; manual moderation still works.",
          control: { type: "toggle" },
        },
        {
          key: "timersPaused",
          label: "Pause all timers",
          help: "Prefer the pause/resume control on the Timers page, which also resets schedules.",
          control: { type: "toggle" },
        },
      ],
    },
    {
      title: "Data retention",
      description:
        "How long KekBot keeps history. Shorter keeps less personal data; unfinished work is always kept until it completes.",
      fields: [
        {
          key: "chatDays",
          label: "Chat messages",
          help: "0 deletes chat text right after processing.",
          control: { type: "number", suffix: "days" },
        },
        {
          key: "receiptDays",
          label: "Event receipts",
          help: "Used to ignore duplicate deliveries.",
          control: { type: "number", suffix: "days" },
        },
        {
          key: "summaryDays",
          label: "Analytics observations",
          control: { type: "number", suffix: "days" },
        },
        {
          key: "auditDays",
          label: "Audit log and incidents",
          control: { type: "number", suffix: "days" },
        },
      ],
    },
  ],
};
