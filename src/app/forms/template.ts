// Local preview rendering. Mirrors `renderTemplate` in src/server/domain/presentation.ts
// (tests/forms.test.ts checks they agree); the server remains authoritative for delivery.

export function renderTemplate(template: string, variables: Record<string, string | number>) {
  return template
    .replace(/\{([a-z][a-z0-9_]*)\}/g, (_, key: string) =>
      String(variables[key] ?? `[${key} unavailable]`),
    )
    .slice(0, 500);
}

export type Variable = { name: string; help: string };

export const commandVariables: Variable[] = [
  { name: "user", help: "the viewer who used the command" },
  { name: "args", help: "text typed after the command (up to 200 characters)" },
  { name: "channel", help: "your instance name from Maintenance → Edit settings" },
  { name: "counter", help: "how many times it has been used (turn on Counter)" },
  { name: "points", help: "the viewer's points balance" },
];

export const timerVariables: Variable[] = [
  { name: "channel", help: "your instance name from Maintenance → Edit settings" },
];

/** Sample values used by the server's own command/timer preview action. */
export function commandSample(channel: string): Record<string, string | number> {
  return { user: "Preview viewer", args: "sample arguments", channel, counter: 1, points: 100 };
}

export function timerSample(channel: string): Record<string, string | number> {
  return { channel };
}

type AlertEvent = {
  label: string;
  help: string;
  variables: Variable[];
  sample: Record<string, string | number>;
};

const supporter = (count: string): Variable[] => [
  { name: "user", help: "supporter's Kick username" },
  { name: "name", help: "same as {user}" },
  { name: "count", help: count },
];

export const alertEvents: Record<string, AlertEvent> = {
  "channel.followed": {
    label: "New follower",
    help: "Someone follows your Kick channel.",
    variables: supporter("always 1 for a follow"),
    sample: { user: "Preview viewer", name: "Preview viewer", count: 1 },
  },
  "channel.subscription.new": {
    label: "New subscriber",
    help: "Someone subscribes for the first time.",
    variables: supporter("subscription length in months, when Kick provides it"),
    sample: { user: "Preview viewer", name: "Preview viewer", count: 1 },
  },
  "channel.subscription.renewal": {
    label: "Resubscription",
    help: "An existing subscriber renews.",
    variables: supporter("subscription length in months, when Kick provides it"),
    sample: { user: "Preview viewer", name: "Preview viewer", count: 6 },
  },
  "channel.subscription.gifts": {
    label: "Gifted subscriptions",
    help: "Someone gifts subscriptions to other viewers.",
    variables: supporter("number of gifted subscriptions"),
    sample: { user: "Preview viewer", name: "Preview viewer", count: 5 },
  },
  manual: {
    label: "Manual alert or reward",
    help: "Sent from Alerts → Send manual alert, or when an alert-type reward is fulfilled.",
    variables: [
      { name: "text", help: "the manual alert text or reward description" },
      { name: "name", help: "the manual alert text or reward name" },
      { name: "user", help: "an internal account or viewer ID, not a display name" },
    ],
    sample: { text: "Thanks for the raid!", name: "Thanks for the raid!", user: "operator-id" },
  },
  goal: {
    label: "Goal completed",
    help: "A goal reaches its target.",
    variables: [
      { name: "name", help: "goal name" },
      { name: "value", help: "current amount" },
      { name: "target", help: "goal target" },
    ],
    sample: { name: "Follower goal", value: 100, target: 100 },
  },
  media: {
    label: "New media request",
    help: "A viewer's media request passes validation.",
    variables: [
      { name: "title", help: "video title" },
      { name: "name", help: "same as {title}" },
      { name: "user", help: "the requester's numeric viewer ID" },
    ],
    sample: { title: "Example video", name: "Example video", user: "123456" },
  },
};
