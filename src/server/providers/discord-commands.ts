import type { Actor, Permission } from "../auth.ts";
import { AppError, isAppError } from "../errors.ts";
import { ERASED_VIEWER, type State } from "../domain/state.ts";
import type { MediaItem } from "../domain/media.ts";
import * as format from "./discord-format.ts";
import type { Embed, Message, Outcome, Row } from "./discord-format.ts";

/** The `/kekbot` command tree, its autocomplete sources and how each subcommand maps to a domain action. */

export type ActionFn = (
  actor: Actor,
  name: string,
  input: Record<string, unknown>,
  id: string,
) => Promise<unknown>;
export type Value = string | number | boolean;
export type RawOption = {
  name: string;
  type?: number;
  value?: Value;
  focused?: boolean;
  options?: RawOption[];
};
/** A target resolved when the member submitted the command, or the error that resolution hit. */
export type Target =
  { id: string; version: number; name?: string; value?: number; goal?: number } | { error: string };
/** Everything a slash command acts on, captured at intake and stored in the encrypted job. */
export type Prepared = { targets: Record<string, Target>; player: number };
type Ctx = { actor: Actor; state: State; action: ActionFn; id: string; prepared?: Prepared };
type Source =
  | "media-pending"
  | "media-decidable"
  | "media-waiting"
  | "goal"
  | "poll-open"
  | "poll-any"
  | "raffle-open"
  | "raffle-closed"
  | "raffle-drawn"
  | "redemption"
  | "viewer"
  | "message";
type OptionSpec = {
  name: string;
  description: string;
  type: "string" | "integer" | "boolean";
  required?: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
  choices?: { name: string; value: string }[];
  source?: Source;
};
type Spec = {
  description: string;
  permission: Permission | "any";
  options?: OptionSpec[];
  run(ctx: Ctx, options: Record<string, Value>): Promise<Message | Outcome>;
};
type Group = { description: string; module?: "media" | "points"; commands: Record<string, Spec> };
type Entry = (Spec & { module?: "media" | "points" }) | Group;

const ACTIVE = ["validating", "pending", "approved", "playing"];
const DISCORD_TYPES = { string: 3, integer: 4, boolean: 5 } as const;

// ---- Option helpers --------------------------------------------------------------------

const target = (name: string, description: string, source: Source): OptionSpec => ({
  name,
  description,
  type: "string",
  required: true,
  maxLength: 100,
  source,
});
const request = (source: Source) =>
  target("request", "Request number (#12 or 12) or pick from the list", source);
const viewer = target(
  "viewer",
  "Viewer name (pick from recently seen viewers) or numeric Kick ID",
  "viewer",
);
const reason: OptionSpec = {
  name: "reason",
  description: "Reason shown in the audit log (1–100 characters)",
  type: "string",
  required: true,
  maxLength: 100,
};
const confirm = (what: string): OptionSpec => ({
  name: "confirm",
  description: `Set True to confirm: ${what}`,
  type: "boolean",
  required: true,
});
const minutes = (description: string, max: number, required = false): OptionSpec => ({
  name: "minutes",
  description,
  type: "integer",
  required,
  min: 1,
  max,
});

// ---- Small utilities -------------------------------------------------------------------

function str(value: Value | undefined) {
  return value === undefined ? "" : String(value).trim();
}
function ago(at: number, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - at) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / 1440)}d ago`;
}
function like(query: string) {
  return `%${query.replace(/[\\%_]/g, "\\$&")}%`;
}
function bar(value: number, total: number, width = 12) {
  const filled = total > 0 ? Math.round((Math.min(value, total) / total) * width) : 0;
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
}
function choice(name: string, value: string) {
  return { name: format.clip(name.replace(/\s+/g, " ").trim() || "Untitled", 100), value };
}
function outcome(reply: Message, update?: Row[]): Outcome {
  return { reply, update };
}

// ---- Resolution ------------------------------------------------------------------------

function mediaRow(state: State, item: MediaItem): format.MediaRow {
  return { ...item, requesterName: state.viewerName(item.requester) ?? null };
}
function resolveMedia(state: State, raw: Value | undefined, statuses: string[]) {
  const value = str(raw);
  const number = /^#?\s*(\d{1,9})$/.exec(value);
  if (number) {
    const position = Number(number[1]);
    const query = (list: string[]) =>
      state.db
        .prepare(
          `SELECT * FROM media WHERE position=? AND status IN (${list.map(() => "?").join(",")}) ORDER BY created_at,id LIMIT 2`,
        )
        .all(position, ...list) as MediaItem[];
    let rows = query(statuses);
    // Fall back to any active state so a decided request is reported as changed, not missing.
    if (!rows.length) rows = query(ACTIVE);
    if (rows.length > 1) throw new AppError("media_number_ambiguous", 409);
    if (!rows.length) throw new AppError("media_not_found", 404);
    return rows[0];
  }
  const item = value
    ? (state.db.prepare("SELECT * FROM media WHERE id=?").get(value) as MediaItem | undefined)
    : undefined;
  if (!item) throw new AppError("media_not_found", 404);
  return item;
}
function resolveDocument<K extends "goal" | "poll" | "raffle">(
  state: State,
  kind: K,
  raw: Value | undefined,
  prefer?: (data: Record<string, unknown>) => boolean,
) {
  const value = str(raw);
  const documents = state.list(kind);
  const byId = documents.find((doc) => doc.id === value);
  if (byId) return byId;
  const named = documents.filter(
    (doc) => String(doc.data.name).toLowerCase() === value.toLowerCase(),
  );
  const preferred = prefer
    ? named.filter((doc) => prefer(doc.data as Record<string, unknown>))
    : named;
  const matches = preferred.length ? preferred : named;
  if (matches.length > 1) throw new AppError("name_ambiguous", 409);
  if (!matches.length) throw new AppError(`${kind}_not_found`, 404);
  return matches[0];
}
function resolveViewer(state: State, raw: Value | undefined) {
  const value = str(raw).replace(/^@/, "");
  if (/^\d{1,24}$/.test(value)) return value;
  const row = value
    ? (state.db
        .prepare(
          "SELECT id FROM viewers WHERE lower(name)=lower(?) AND name!=? ORDER BY last_seen DESC LIMIT 1",
        )
        .get(value, ERASED_VIEWER) as { id: string } | undefined)
    : undefined;
  if (!row) throw new AppError("viewer_not_found", 404);
  return row.id;
}
function viewerLabel(state: State, id: string) {
  return format.plain(state.viewerName(id), `Viewer ${id}`, 80);
}
function playerVersion(state: State) {
  return (JSON.parse(state.repository.setting("player") ?? '{"version":0}') as { version: number })
    .version;
}

const MEDIA_STATUSES: Partial<Record<Source, string[]>> = {
  "media-pending": ["pending"],
  "media-decidable": ["pending", "approved"],
  "media-waiting": ["approved"],
};
const PREFERRED_STATUS: Partial<Record<Source, string>> = {
  "poll-open": "open",
  "poll-any": "open",
  "raffle-open": "open",
  "raffle-closed": "closed",
  "raffle-drawn": "drawn",
};
function resolveTarget(state: State, source: Source, raw: Value): Target {
  try {
    const statuses = MEDIA_STATUSES[source];
    if (statuses) {
      const item = resolveMedia(state, raw, statuses);
      return { id: item.id, version: item.version };
    }
    if (source === "goal") {
      const goal = resolveDocument(state, "goal", raw);
      return {
        id: goal.id,
        version: goal.version,
        name: goal.data.name,
        value: goal.data.value,
        goal: goal.data.target,
      };
    }
    if (source.startsWith("poll-") || source.startsWith("raffle-")) {
      const kind = source.startsWith("poll-") ? "poll" : "raffle";
      const doc = resolveDocument(
        state,
        kind,
        raw,
        (data) => data.status === PREFERRED_STATUS[source],
      );
      return { id: doc.id, version: doc.version, name: String(doc.data.name) };
    }
    if (source === "viewer") return { id: resolveViewer(state, raw), version: 0 };
    return { id: str(raw), version: 0 };
  } catch (error) {
    if (isAppError(error)) return { error: error.code };
    throw error;
  }
}

/**
 * Resolve a slash command's targets (ID plus version) and the player version when the member
 * submits it, inside the 3-second intake path. The deferred job then acts on exactly these
 * versions, so anything changed in between replies "This changed" instead of acting on newer
 * state. Resolution errors are only revealed after the permission check at execution.
 */
export function prepare(state: State, options: RawOption[] = []): Prepared {
  const { path, values } = invocation(options);
  const targets: Record<string, Target> = {};
  for (const option of lookup(path)?.spec.options ?? [])
    if (option.source && option.source !== "message" && values[option.name] !== undefined)
      targets[option.name] = resolveTarget(state, option.source, values[option.name]);
  return { targets, player: playerVersion(state) };
}
function picked(ctx: Ctx, name: string) {
  const resolved = ctx.prepared?.targets[name];
  if (!resolved) throw new AppError("invalid_command_input", 400);
  if ("error" in resolved) throw new AppError(resolved.error, 409);
  return resolved;
}
function playerAtIntake(ctx: Ctx) {
  return ctx.prepared?.player ?? playerVersion(ctx.state);
}

// ---- Shared action flows (slash commands and buttons) ----------------------------------

function stale(error: unknown) {
  return isAppError(error) && format.staleCodes.has(error.code);
}

async function mediaDecision(
  ctx: Ctx,
  op: "approve" | "reject" | "remove",
  id: string,
  version: number,
): Promise<Outcome> {
  try {
    const item = (await ctx.action(
      ctx.actor,
      `media.${op}`,
      { target: id, version },
      ctx.id,
    )) as MediaItem;
    const done = op === "approve" ? "Approved" : op === "reject" ? "Rejected" : "Removed";
    return outcome(
      format.message([
        {
          ...format.mediaEmbed(mediaRow(ctx.state, item), `${done} ${format.mediaLabel(item)}`),
          color: format.colors.success,
        },
      ]),
      format.settled(done, op === "approve" ? 3 : 2),
    );
  } catch (error) {
    if (!stale(error)) throw error;
    const current = ctx.state.db.prepare("SELECT * FROM media WHERE id=?").get(id) as
      MediaItem | undefined;
    return outcome(
      format.changed(
        current ? format.mediaEmbed(mediaRow(ctx.state, current)) : undefined,
        current ? undefined : "That request no longer exists. Nothing was changed.",
      ),
      format.settled(current ? `Now ${format.mediaStatusText(current.status)}` : "Out of date"),
    );
  }
}

async function rewardDecision(ctx: Ctx, op: "complete" | "reject", id: string): Promise<Outcome> {
  const row = () =>
    ctx.state.db.prepare("SELECT viewer,reward,cost,status FROM redemptions WHERE id=?").get(id) as
      { viewer: string; reward: string; cost: number; status: string } | undefined;
  const before = row();
  if (!before) throw new AppError("redemption_not_found", 404);
  const reward = format.plain(
    String(ctx.state.document(before.reward)?.data.name ?? ""),
    "Removed reward",
    80,
  );
  const who = viewerLabel(ctx.state, before.viewer);
  try {
    await ctx.action(
      ctx.actor,
      op === "complete" ? "reward.complete" : "reward.reject",
      { target: id },
      ctx.id,
    );
    return op === "complete"
      ? outcome(
          format.success(`Completed: ${reward}`, `Marked fulfilled for ${who}.`),
          format.settled("Completed", 3),
        )
      : outcome(
          format.success(`Refunded: ${reward}`, `Returned ${before.cost} points to ${who}.`),
          format.settled("Refunded"),
        );
  } catch (error) {
    if (!stale(error)) throw error;
    const status = row()?.status ?? "removed";
    return outcome(
      format.changed({
        title: `${reward} · ${who}`,
        color: format.colors.neutral,
        fields: [{ name: "Status", value: status }],
      }),
      format.settled(`Already ${status}`),
    );
  }
}

function raffleEmbed(state: State, id: string): Embed | undefined {
  const doc = state.list("raffle").find((raffle) => raffle.id === id);
  if (!doc) return undefined;
  const entries = (
    state.db.prepare("SELECT count(*) AS n FROM participation WHERE activity=?").get(id) as {
      n: number;
    }
  ).n;
  return {
    title: format.plain(doc.data.name, "Raffle", 200),
    color: format.colors.neutral,
    fields: [
      { name: "Status", value: doc.data.status, inline: true },
      { name: "Entries", value: String(entries), inline: true },
      ...(doc.data.winners.length
        ? [
            {
              name: "Winners so far",
              value: doc.data.winners.map((winner) => viewerLabel(state, winner)).join(", "),
            },
          ]
        : []),
    ],
  };
}

async function raffleDraw(
  ctx: Ctx,
  id: string,
  reroll: boolean,
  version?: number,
): Promise<Outcome> {
  try {
    const result = (await ctx.action(
      ctx.actor,
      reroll ? "raffle.reroll" : "raffle.draw",
      { target: id, ...(version === undefined ? {} : { version }) },
      ctx.id,
    )) as { winner: string; winnerName: string };
    const raffle = ctx.state.list("raffle").find((doc) => doc.id === id);
    return outcome(
      format.success(
        `${reroll ? "New winner" : "Winner"}: ${format.plain(result.winnerName, "Viewer name unavailable", 80)}`,
        `Raffle: ${format.plain(raffle?.data.name, "Raffle", 200)}. Announce the winner in chat.`,
      ),
      format.settled("Winner drawn", 3),
    );
  } catch (error) {
    if (!stale(error)) throw error;
    return outcome(format.changed(raffleEmbed(ctx.state, id)), format.settled("Out of date"));
  }
}

async function pollResults(ctx: Ctx, id: string) {
  const result = (await ctx.action(ctx.actor, "poll.results", { target: id }, ctx.id)) as {
    name: string;
    status: string;
    endsAt: number;
    options: { option: string; votes: number }[];
  };
  const total = result.options.reduce((sum, option) => sum + option.votes, 0);
  const lines = result.options.map(
    (option, index) =>
      `**${index + 1}. ${format.plain(option.option, "Option", 80)}**\n${bar(option.votes, total)} ${option.votes} (${total ? Math.round((option.votes / total) * 100) : 0}%)`,
  );
  return {
    title: `Poll: ${format.plain(result.name, "Poll", 200)}`,
    description: lines.join("\n"),
    color: format.colors.info,
    footer: {
      text: `${total} vote${total === 1 ? "" : "s"} · ${result.status === "open" ? "open" : "closed"}`,
    },
  } satisfies Embed;
}

// ---- The tree --------------------------------------------------------------------------

type Status = {
  stream: string;
  player: { state: string; volume?: number };
  jobs: { status: string; count: number }[];
  timersPaused?: boolean;
  moderationPaused?: boolean;
  incidentMode?: { preset: string; endsAt: number } | null;
  mediaEnabled?: boolean;
  requests?: { title: string | null; status: string; position: number }[];
};

export const tree: Record<string, Entry> = {
  status: {
    description: "Stream, player, timers and moderation at a glance",
    permission: "any",
    async run(ctx) {
      const status = (await ctx.action(ctx.actor, "status", {}, ctx.id)) as Status;
      const count = (name: string) => status.jobs.find((job) => job.status === name)?.count ?? 0;
      const fields: Embed["fields"] = [
        {
          name: "Stream",
          value:
            status.stream === "true"
              ? "🔴 Live"
              : status.stream === "false"
                ? "Offline"
                : "Not observed yet",
          inline: true,
        },
        ...(status.mediaEnabled
          ? [
              {
                name: "Player",
                value:
                  status.player.state === "playing"
                    ? `Playing · ${status.player.volume ?? 50}% volume`
                    : "Paused",
                inline: true,
              },
            ]
          : []),
        { name: "Timers", value: status.timersPaused ? "Paused" : "Running", inline: true },
        { name: "Auto-moderation", value: status.moderationPaused ? "Paused" : "On", inline: true },
        {
          name: "Incident mode",
          value: status.incidentMode
            ? `${status.incidentMode.preset} · ends ${format.relative(status.incidentMode.endsAt)}`
            : "Off",
          inline: true,
        },
        {
          name: "Background work",
          value: `${count("pending") + count("running")} waiting${count("uncertain") ? ` · ${count("uncertain")} need review in the dashboard` : ""}`,
          inline: true,
        },
      ];
      if (status.requests)
        fields.push({
          name: "Requests",
          value: status.requests.length
            ? status.requests
                .map(
                  (item) => `${format.mediaLabel(item)} · ${format.mediaStatusText(item.status)}`,
                )
                .join("\n")
            : "Queue is empty",
        });
      return format.info("KekBot status", undefined, fields);
    },
  },
  media: {
    description: "Song requests and the player",
    module: "media",
    commands: {
      queue: {
        description: "Show the request queue, with approve/reject buttons for waiting requests",
        permission: "media",
        async run(ctx) {
          const result = (await ctx.action(ctx.actor, "media.queue", {}, ctx.id)) as {
            player: { state: string; volume: number };
            items: format.MediaRow[];
            total: number;
          };
          const lines = result.items.map(
            (item) =>
              `${item.status === "playing" ? "▶️ " : ""}${format.mediaLabel(item)}${item.duration ? ` · ${format.duration(item.duration)}` : ""} · ${format.plain(item.requesterName, "Dashboard", 40)} · ${format.mediaStatusText(item.status)}`,
          );
          const pending = result.items.filter((item) => item.status === "pending").slice(0, 5);
          const components = pending.flatMap((item) =>
            format.row(
              format.button(`Approve #${item.position}`, 3, "ma", item.id, item.version),
              format.button(`Reject #${item.position}`, 4, "mr", item.id, item.version),
            ),
          );
          return format.message(
            [
              {
                title: "Request queue",
                description: lines.join("\n") || "The queue is empty.",
                color: format.colors.info,
                footer: {
                  text: `${result.total} active request${result.total === 1 ? "" : "s"}${result.total > result.items.length ? ` · showing ${result.items.length}` : ""} · player ${result.player.state} at ${result.player.volume}%`,
                },
              },
            ],
            components.length ? { components } : {},
          );
        },
      },
      approve: {
        description: "Approve a waiting request",
        permission: "media",
        options: [request("media-pending")],
        async run(ctx) {
          const item = picked(ctx, "request");
          return mediaDecision(ctx, "approve", item.id, item.version);
        },
      },
      reject: {
        description: "Reject a waiting request",
        permission: "media",
        options: [request("media-pending")],
        async run(ctx) {
          const item = picked(ctx, "request");
          return mediaDecision(ctx, "reject", item.id, item.version);
        },
      },
      remove: {
        description: "Remove a queued or waiting request (use skip for the current song)",
        permission: "media",
        options: [request("media-decidable")],
        async run(ctx) {
          const item = picked(ctx, "request");
          return mediaDecision(ctx, "remove", item.id, item.version);
        },
      },
      move: {
        description: "Move an approved request to another place in the queue",
        permission: "media",
        options: [
          request("media-waiting"),
          {
            name: "position",
            description: "New place in the approved queue (1 = next)",
            type: "integer",
            required: true,
            min: 1,
            max: 500,
          },
        ],
        async run(ctx, o) {
          const item = picked(ctx, "request");
          const result = (await ctx.action(
            ctx.actor,
            "media.move",
            { target: item.id, version: item.version, position: o.position },
            ctx.id,
          )) as { item: MediaItem; total: number };
          return format.success(
            `Moved to place ${Math.min(Number(o.position), result.total)} of ${result.total}`,
            `${format.plain(result.item.title, "Untitled video", 200)} is now **#${result.item.position}**. Approved requests were renumbered in their new order.`,
          );
        },
      },
      clear: {
        description: "Remove every waiting and queued request (keeps the current song)",
        permission: "media",
        options: [confirm("remove all waiting and queued requests")],
        async run(ctx, o) {
          const result = (await ctx.action(
            ctx.actor,
            "media.clear",
            { acknowledge: o.confirm === true },
            ctx.id,
          )) as { removed: number };
          return format.success(
            "Queue cleared",
            `Removed ${result.removed} request${result.removed === 1 ? "" : "s"}. The current song keeps playing.`,
          );
        },
      },
      skip: {
        description: "Skip the current song",
        permission: "media",
        async run(ctx) {
          const player = (await ctx.action(
            ctx.actor,
            "player.skip",
            { version: playerAtIntake(ctx) },
            ctx.id,
          )) as { current: string | null };
          const next = player.current
            ? (ctx.state.db.prepare("SELECT * FROM media WHERE id=?").get(player.current) as
                MediaItem | undefined)
            : undefined;
          return format.success(
            "Skipped",
            next
              ? `Now playing ${format.mediaLabel(next)}.`
              : "The queue is empty, so the player paused.",
          );
        },
      },
      pause: {
        description: "Pause the player",
        permission: "media",
        async run(ctx) {
          await ctx.action(ctx.actor, "player.pause", { version: playerAtIntake(ctx) }, ctx.id);
          return format.success("Player paused");
        },
      },
      resume: {
        description: "Resume the player",
        permission: "media",
        async run(ctx) {
          const player = (await ctx.action(
            ctx.actor,
            "player.resume",
            { version: playerAtIntake(ctx) },
            ctx.id,
          )) as { current: string | null };
          return format.success(
            "Player resumed",
            player.current
              ? undefined
              : "Nothing is queued yet; the player starts when a request is approved.",
          );
        },
      },
      volume: {
        description: "Set the player volume",
        permission: "media",
        options: [
          {
            name: "level",
            description: "Volume from 0 to 100",
            type: "integer",
            required: true,
            min: 0,
            max: 100,
          },
        ],
        async run(ctx, o) {
          await ctx.action(
            ctx.actor,
            "player.volume",
            { version: playerAtIntake(ctx), value: o.level },
            ctx.id,
          );
          return format.success(`Volume set to ${Number(o.level)}%`);
        },
      },
    },
  },
  goal: {
    description: "Stream goals",
    commands: {
      list: {
        description: "Show goals and their progress",
        permission: "operate",
        async run(ctx) {
          const result = (await ctx.action(ctx.actor, "goal.list", {}, ctx.id)) as {
            goals: {
              name: string;
              value: number;
              target: number;
              completed: boolean;
              enabled: boolean;
            }[];
          };
          const lines = result.goals.map(
            (goal) =>
              `**${format.plain(goal.name, "Goal", 80)}**${goal.enabled ? "" : " (disabled)"}\n${bar(goal.value, goal.target)} ${goal.value}/${goal.target}${goal.completed ? " ✅" : ""}`,
          );
          return format.info(
            "Goals",
            lines.join("\n") || "No goals yet. Create them in the dashboard.",
          );
        },
      },
      add: {
        description: "Add to (or subtract from) a goal",
        permission: "operate",
        options: [
          target("goal", "Goal name (pick from the list)", "goal"),
          {
            name: "amount",
            description: "Amount to add; negative subtracts",
            type: "integer",
            required: true,
            min: -1000000000,
            max: 1000000000,
          },
        ],
        async run(ctx, o) {
          const goal = picked(ctx, "goal");
          return setGoal(
            ctx,
            goal,
            Math.min(1000000000, Math.max(0, (goal.value ?? 0) + Number(o.amount))),
          );
        },
      },
      set: {
        description: "Set a goal's current value",
        permission: "operate",
        options: [
          target("goal", "Goal name (pick from the list)", "goal"),
          {
            name: "value",
            description: "New current value",
            type: "integer",
            required: true,
            min: 0,
            max: 1000000000,
          },
        ],
        async run(ctx, o) {
          return setGoal(ctx, picked(ctx, "goal"), Number(o.value));
        },
      },
      reset: {
        description: "Reset a goal to zero",
        permission: "operate",
        options: [target("goal", "Goal name (pick from the list)", "goal")],
        async run(ctx) {
          return setGoal(ctx, picked(ctx, "goal"), 0);
        },
      },
    },
  },
  poll: {
    description: "Chat polls",
    commands: {
      create: {
        description: "Start a poll; viewers vote with !vote <number>",
        permission: "engage",
        options: [
          {
            name: "question",
            description: "Poll question (up to 80 characters)",
            type: "string",
            required: true,
            maxLength: 80,
          },
          {
            name: "options",
            description: "2–10 answers separated by commas or |",
            type: "string",
            required: true,
            maxLength: 900,
          },
          minutes("How long the poll stays open (default 5)", 1440),
          {
            name: "allow_change",
            description: "Let viewers change their vote (default False)",
            type: "boolean",
          },
        ],
        async run(ctx, o) {
          const raw = str(o.options);
          const options = raw
            .split(raw.includes("|") ? "|" : ",")
            .map((option) => option.trim())
            .filter(Boolean);
          if (
            options.length < 2 ||
            options.length > 10 ||
            options.some((option) => option.length > 80)
          )
            throw new AppError("invalid_poll_options", 400);
          const doc = (await ctx.action(
            ctx.actor,
            "poll.create",
            {
              name: str(o.question),
              options,
              minutes: o.minutes ?? 5,
              allowChange: o.allow_change === true,
            },
            ctx.id,
          )) as { data: { endsAt: number } };
          return format.success(
            `Poll started: ${format.plain(str(o.question), "Poll", 200)}`,
            options
              .map((option, index) => `**${index + 1}.** ${format.plain(option, "Option", 80)}`)
              .join("\n"),
            [
              { name: "Ends", value: format.relative(doc.data.endsAt), inline: true },
              {
                name: "How to vote",
                value: `\`!vote 1\` to \`!vote ${options.length}\` in Kick chat`,
                inline: true,
              },
            ],
          );
        },
      },
      close: {
        description: "Close a poll and show the final results",
        permission: "engage",
        options: [target("poll", "Poll name (pick from the list)", "poll-open")],
        async run(ctx) {
          const poll = picked(ctx, "poll");
          await ctx.action(ctx.actor, "activity.close", { target: poll.id }, ctx.id);
          return format.message([
            { title: "Poll closed", color: format.colors.success },
            await pollResults(ctx, poll.id),
          ]);
        },
      },
      results: {
        description: "Show a poll's current results",
        permission: "engage",
        options: [target("poll", "Poll name (pick from the list)", "poll-any")],
        async run(ctx) {
          return format.message([await pollResults(ctx, picked(ctx, "poll").id)]);
        },
      },
    },
  },
  raffle: {
    description: "Chat raffles",
    commands: {
      create: {
        description: "Start a raffle; viewers enter with !enter",
        permission: "engage",
        options: [
          {
            name: "name",
            description: "Raffle name (up to 80 characters)",
            type: "string",
            required: true,
            maxLength: 80,
          },
          minutes("How long entries stay open (default 5)", 1440),
          {
            name: "min_points",
            description: "Points a viewer needs to enter (default 0)",
            type: "integer",
            min: 0,
            max: 100000000,
          },
        ],
        async run(ctx, o) {
          const doc = (await ctx.action(
            ctx.actor,
            "raffle.create",
            { name: str(o.name), minutes: o.minutes ?? 5, minPoints: o.min_points ?? 0 },
            ctx.id,
          )) as { data: { endsAt: number } };
          return format.success(
            `Raffle started: ${format.plain(str(o.name), "Raffle", 200)}`,
            undefined,
            [
              { name: "Ends", value: format.relative(doc.data.endsAt), inline: true },
              { name: "How to enter", value: "`!enter` in Kick chat", inline: true },
            ],
          );
        },
      },
      close: {
        description: "Stop raffle entries",
        permission: "engage",
        options: [target("raffle", "Raffle name (pick from the list)", "raffle-open")],
        async run(ctx) {
          const raffle = picked(ctx, "raffle");
          await ctx.action(ctx.actor, "activity.close", { target: raffle.id }, ctx.id);
          const closed = ctx.state.list("raffle").find((doc) => doc.id === raffle.id);
          const draw = closed
            ? format.row(format.button("Draw winner", 1, "rd", closed.id, closed.version))
            : [];
          return format.message(
            [
              {
                ...raffleEmbed(ctx.state, raffle.id),
                title: `Raffle closed: ${format.plain(raffle.name, "Raffle", 200)}`,
                color: format.colors.success,
              },
            ],
            draw.length ? { components: draw } : {},
          );
        },
      },
      draw: {
        description: "Draw a winner from a closed raffle",
        permission: "engage",
        options: [target("raffle", "Raffle name (pick from the list)", "raffle-closed")],
        async run(ctx) {
          const raffle = picked(ctx, "raffle");
          return raffleDraw(ctx, raffle.id, false, raffle.version);
        },
      },
      reroll: {
        description: "Draw another winner, excluding earlier winners",
        permission: "engage",
        options: [target("raffle", "Raffle name (pick from the list)", "raffle-drawn")],
        async run(ctx) {
          const raffle = picked(ctx, "raffle");
          return raffleDraw(ctx, raffle.id, true, raffle.version);
        },
      },
    },
  },
  reward: {
    description: "Point reward redemptions",
    module: "points",
    commands: {
      pending: {
        description: "List redemptions waiting for fulfilment, with buttons",
        permission: "engage",
        async run(ctx) {
          const result = (await ctx.action(ctx.actor, "reward.pending", {}, ctx.id)) as {
            items: {
              id: string;
              viewer: string;
              rewardName: string;
              viewerName: string | null;
              cost: number;
              createdAt: number;
            }[];
            total: number;
          };
          const lines = result.items.map(
            (item, index) =>
              `**${index + 1}.** ${format.plain(item.rewardName, "Reward", 80)} · ${format.plain(item.viewerName, `Viewer ${item.viewer}`, 40)} · ${item.cost} pts · ${format.relative(item.createdAt)}`,
          );
          const components = result.items
            .slice(0, 5)
            .flatMap((item, index) =>
              format.row(
                format.button(`Complete ${index + 1}`, 3, "rc", item.id, 0),
                format.button(`Refund ${index + 1}`, 2, "rf", item.id, 0),
              ),
            );
          return format.message(
            [
              {
                title: "Pending redemptions",
                description: lines.join("\n") || "Nothing is waiting.",
                color: format.colors.info,
                ...(result.total > result.items.length
                  ? { footer: { text: `Showing ${result.items.length} of ${result.total}` } }
                  : {}),
              },
            ],
            components.length ? { components } : {},
          );
        },
      },
      complete: {
        description: "Mark a redemption as fulfilled",
        permission: "engage",
        options: [target("redemption", "Pending redemption (pick from the list)", "redemption")],
        async run(ctx) {
          return rewardDecision(ctx, "complete", picked(ctx, "redemption").id);
        },
      },
      refund: {
        description: "Refund a redemption's points",
        permission: "engage",
        options: [target("redemption", "Pending redemption (pick from the list)", "redemption")],
        async run(ctx) {
          return rewardDecision(ctx, "reject", picked(ctx, "redemption").id);
        },
      },
    },
  },
  points: {
    description: "Look up a viewer's points and watchtime",
    module: "points",
    permission: "engage",
    options: [viewer],
    async run(ctx) {
      const result = (await ctx.action(
        ctx.actor,
        "points.lookup",
        { viewer: picked(ctx, "viewer").id },
        ctx.id,
      )) as {
        viewer: string;
        name: string | null;
        balance: number;
        watchMinutes: number;
        lastSeen: number | null;
        pointsEnabled: boolean;
      };
      return format.info(
        format.plain(result.name, `Viewer ${result.viewer}`, 80),
        result.pointsEnabled ? undefined : "Points are currently turned off.",
        [
          { name: "Points", value: String(result.balance), inline: true },
          { name: "Watchtime (estimated)", value: `${result.watchMinutes} min`, inline: true },
          {
            name: "Last seen",
            value: result.lastSeen ? format.relative(result.lastSeen) : "Never",
            inline: true,
          },
        ],
      );
    },
  },
  mod: {
    description: "Moderation",
    commands: {
      warn: {
        description: "Warn a viewer in Kick chat",
        permission: "moderate",
        options: [viewer, reason],
        async run(ctx, o) {
          return moderate(ctx, "warn", o);
        },
      },
      timeout: {
        description: "Time out a viewer on Kick",
        permission: "moderate",
        options: [
          viewer,
          reason,
          minutes("Timeout length in minutes (default 10, max 7 days)", 10080),
        ],
        async run(ctx, o) {
          return moderate(ctx, "timeout", o);
        },
      },
      ban: {
        description: "Ban a viewer on Kick",
        permission: "moderate",
        options: [viewer, reason, confirm("ban this viewer")],
        async run(ctx, o) {
          return moderate(ctx, "ban", o);
        },
      },
      delete: {
        description: "Delete one of a viewer's chat messages on Kick",
        permission: "moderate",
        options: [
          viewer,
          target(
            "message",
            "Message (pick from the viewer's recent messages) or Kick message ID",
            "message",
          ),
          reason,
          confirm("delete this message"),
        ],
        async run(ctx, o) {
          return moderate(ctx, "delete", o);
        },
      },
      pause: {
        description: "Pause automatic moderation rules",
        permission: "moderate",
        async run(ctx) {
          await ctx.action(ctx.actor, "moderation.pause", {}, ctx.id);
          return format.success(
            "Automatic moderation paused",
            "Manual moderation still works. Resume with `/kekbot mod resume`.",
          );
        },
      },
      resume: {
        description: "Resume automatic moderation rules",
        permission: "moderate",
        async run(ctx) {
          await ctx.action(ctx.actor, "moderation.resume", {}, ctx.id);
          return format.success("Automatic moderation resumed");
        },
      },
      "incident-start": {
        description: "Turn on temporary raid protection that warns on links and/or bursts",
        permission: "moderate",
        options: [
          {
            name: "preset",
            description: "What to catch",
            type: "string",
            required: true,
            choices: [
              { name: "Links", value: "links" },
              { name: "Message bursts", value: "burst" },
              { name: "Links and bursts", value: "combined" },
            ],
          },
          minutes("How long it stays on (1–120)", 120, true),
          confirm("start incident mode"),
        ],
        async run(ctx, o) {
          const result = (await ctx.action(
            ctx.actor,
            "moderation.incident.start",
            { preset: o.preset, minutes: o.minutes, acknowledge: o.confirm === true },
            ctx.id,
          )) as { preset: string; endsAt: number };
          return format.success(
            "Incident mode on",
            `Preset **${result.preset}** warns matching messages until ${format.relative(result.endsAt)}. Saved rules are unchanged.`,
          );
        },
      },
      "incident-stop": {
        description: "Turn off incident mode now",
        permission: "moderate",
        async run(ctx) {
          await ctx.action(ctx.actor, "moderation.incident.stop", {}, ctx.id);
          return format.success("Incident mode off");
        },
      },
    },
  },
  timers: {
    description: "Chat timers",
    commands: {
      pause: {
        description: "Pause all chat timers",
        permission: "operate",
        async run(ctx) {
          await ctx.action(ctx.actor, "timers.pause", {}, ctx.id);
          return format.success("Timers paused");
        },
      },
      resume: {
        description: "Resume chat timers (no catch-up messages)",
        permission: "operate",
        async run(ctx) {
          await ctx.action(ctx.actor, "timers.resume", {}, ctx.id);
          return format.success("Timers resumed");
        },
      },
    },
  },
  alert: {
    description: "On-stream alerts",
    commands: {
      send: {
        description: "Show a manual alert in OBS",
        permission: "operate",
        options: [
          {
            name: "text",
            description: "Alert text (up to 500 characters)",
            type: "string",
            required: true,
            maxLength: 500,
          },
        ],
        async run(ctx, o) {
          await ctx.action(ctx.actor, "alert.manual", { reason: str(o.text) }, ctx.id);
          return format.success("Alert sent", format.plain(str(o.text), "Alert", 500));
        },
      },
    },
  },
};

async function setGoal(
  ctx: Ctx,
  picked: { id: string; version: number; name?: string; goal?: number },
  value: number,
) {
  const goal = { ...picked, data: { name: picked.name ?? "Goal", target: picked.goal ?? 0 } };
  await ctx.action(
    ctx.actor,
    "goal.adjust",
    { target: goal.id, value, version: goal.version },
    ctx.id,
  );
  return format.success(
    `${format.plain(goal.data.name, "Goal", 200)}: ${value}/${goal.data.target}`,
    `${bar(value, goal.data.target)}${value >= goal.data.target ? " ✅ complete" : ""}`,
  );
}

async function moderate(
  ctx: Ctx,
  op: "warn" | "timeout" | "ban" | "delete",
  o: Record<string, Value>,
) {
  const id = picked(ctx, "viewer").id;
  await ctx.action(
    ctx.actor,
    `moderation.${op}`,
    {
      target: id,
      reason: str(o.reason),
      ...(op === "timeout" ? { value: o.minutes ?? 10 } : {}),
      ...(op === "delete" ? { message: str(o.message) } : {}),
      acknowledge: o.confirm === true,
    },
    ctx.id,
  );
  const who = viewerLabel(ctx.state, id);
  const what = {
    warn: `Warning for ${who}`,
    timeout: `${Number(o.minutes ?? 10)}-minute timeout for ${who}`,
    ban: `Ban for ${who}`,
    delete: `Message deletion for ${who}`,
  }[op];
  return format.success(
    `${what} sent to Kick`,
    "Kick confirms separately. If it fails, the dashboard shows it under incidents and jobs.",
  );
}

// ---- Registration ----------------------------------------------------------------------

type Modules = { media: boolean; points: boolean };
function enabled(entry: { module?: "media" | "points" }, modules: Modules) {
  return !entry.module || modules[entry.module];
}
function optionJson(option: OptionSpec) {
  return {
    type: DISCORD_TYPES[option.type],
    name: option.name,
    description: option.description,
    ...(option.required ? { required: true } : {}),
    ...(option.min !== undefined ? { min_value: option.min } : {}),
    ...(option.max !== undefined ? { max_value: option.max } : {}),
    ...(option.maxLength !== undefined ? { min_length: 1, max_length: option.maxLength } : {}),
    ...(option.choices ? { choices: option.choices } : {}),
    ...(option.source ? { autocomplete: true } : {}),
  };
}
function subcommandJson(name: string, spec: Spec) {
  return {
    type: 1,
    name,
    description: spec.description,
    ...(spec.options?.length ? { options: spec.options.map(optionJson) } : {}),
  };
}
export function commandTree(modules: Modules) {
  return [
    {
      name: "kekbot",
      description: "Operate your self-hosted KekBot",
      dm_permission: false,
      options: Object.entries(tree)
        .filter(([, entry]) => enabled(entry, modules))
        .map(([name, entry]) =>
          "commands" in entry
            ? {
                type: 2,
                name,
                description: entry.description,
                options: Object.entries(entry.commands).map(([sub, spec]) =>
                  subcommandJson(sub, spec),
                ),
              }
            : subcommandJson(name, entry),
        ),
    },
  ];
}
/** Every registered path, for documentation and tests. */
export function commandPaths(modules: Modules = { media: true, points: true }) {
  return Object.entries(tree)
    .filter(([, entry]) => enabled(entry, modules))
    .flatMap(([name, entry]) =>
      "commands" in entry ? Object.keys(entry.commands).map((sub) => `${name} ${sub}`) : [name],
    );
}

// ---- Invocation ------------------------------------------------------------------------

export function invocation(options: RawOption[] = []) {
  const path: string[] = [];
  let current = options;
  while (current.length === 1 && (current[0].type === 1 || current[0].type === 2)) {
    path.push(current[0].name);
    current = current[0].options ?? [];
  }
  const values = Object.fromEntries(
    current
      .filter((option) => option.value !== undefined)
      .map((option) => [option.name, option.value!]),
  ) as Record<string, Value>;
  const focused = current.find((option) => option.focused);
  return {
    path,
    values,
    focused: focused ? { name: focused.name, value: str(focused.value) } : undefined,
  };
}
function lookup(path: string[]) {
  const entry = tree[path[0] ?? ""];
  if (!entry) return undefined;
  if ("commands" in entry) {
    const spec = path.length === 2 ? entry.commands[path[1]] : undefined;
    return spec ? { spec, module: entry.module } : undefined;
  }
  return path.length === 1 ? { spec: entry, module: entry.module } : undefined;
}
function permitted(state: State, actor: Actor, permission: Permission | "any") {
  if (permission === "any") {
    if (!actor.permissions.length) throw new AppError("discord_permission_denied", 403);
  } else state.assertActor(actor, permission);
}

function moduleEnabled(state: State, module: "media" | "points" | undefined) {
  if (module === "media" && !state.settings.mediaEnabled) throw new AppError("media_disabled", 409);
  if (module === "points" && !state.settings.pointsEnabled)
    throw new AppError("points_disabled", 409);
}

/**
 * Run a slash command on the targets captured at intake. Permission is checked before any
 * resolution result (including "not found") is revealed, and again by the domain.
 * `legacy` is true only for jobs queued before this command tree existed.
 */
export async function runCommand(
  ctx: Ctx,
  options: RawOption[] = [],
  legacy = false,
): Promise<Outcome> {
  const { path, values } = invocation(options);
  if (!path.length && typeof values.action === "string") {
    // Old single-command format: run only if it was queued before the upgrade.
    if (!legacy) throw new AppError("discord_commands_outdated", 409);
    await ctx.action(ctx.actor, values.action, values, ctx.id);
    return outcome(
      format.success(
        "Done",
        `\`${format.escape(values.action.slice(0, 80))}\` finished. Ask the owner to register the new commands.`,
      ),
    );
  }
  const found = lookup(path);
  if (!found) throw new AppError("unknown_operation", 400);
  moduleEnabled(ctx.state, found.module);
  permitted(ctx.state, ctx.actor, found.spec.permission);
  try {
    const result = await found.spec.run(
      { ...ctx, prepared: ctx.prepared ?? prepare(ctx.state, options) },
      values,
    );
    return "reply" in result ? { reply: result.reply } : { reply: result };
  } catch (error) {
    if (!stale(error)) throw error;
    return outcome(
      format.changed(
        undefined,
        "This changed after you sent the command, so nothing was changed. Check the current state and try again.",
      ),
    );
  }
}

/** Run a button click. The button's ID and version are used verbatim; never the newest state. */
export async function runButton(ctx: Ctx, customId: string): Promise<Outcome> {
  const parsed = format.parseCustomId(customId);
  if (!parsed) throw new AppError("unsupported_discord_interaction", 400);
  const { op, id, version } = parsed;
  if (op === "ma" || op === "mr") {
    if (!ctx.state.settings.mediaEnabled) throw new AppError("media_disabled", 409);
    permitted(ctx.state, ctx.actor, "media");
    return mediaDecision(ctx, op === "ma" ? "approve" : "reject", id, version);
  }
  if (op !== "rd") moduleEnabled(ctx.state, "points");
  permitted(ctx.state, ctx.actor, "engage");
  if (op === "rd") return raffleDraw(ctx, id, false, version);
  return rewardDecision(ctx, op === "rc" ? "complete" : "reject", id);
}

// ---- Autocomplete ----------------------------------------------------------------------

/** Suggestions for the focused option. SQLite only, bounded, and empty for members without the
 * command's permission so nothing leaks to unauthorised members. */
export function autocomplete(
  state: State,
  actor: Actor,
  options: RawOption[] = [],
  now = Date.now(),
) {
  const { path, values, focused } = invocation(options);
  const found = lookup(path);
  const option = found?.spec.options?.find((spec) => spec.name === focused?.name);
  if (!found || !focused || !option?.source) return [];
  try {
    moduleEnabled(state, found.module);
    permitted(state, actor, found.spec.permission);
  } catch {
    return [];
  }
  const query = focused.value.slice(0, 100);
  const lowered = query.toLowerCase().replace(/^@/, "");
  const statuses: Partial<Record<Source, string[]>> = {
    "media-pending": ["pending"],
    "media-decidable": ["pending", "approved"],
    "media-waiting": ["approved"],
  };
  switch (option.source) {
    case "media-pending":
    case "media-decidable":
    case "media-waiting": {
      const list = statuses[option.source]!;
      const rows = state.db
        .prepare(
          `SELECT id,title,status,position FROM media WHERE status IN (${list.map(() => "?").join(",")}) AND (coalesce(title,'') LIKE ? ESCAPE '\\' OR ('#'||position) LIKE ? ESCAPE '\\') ORDER BY position,created_at,id LIMIT 25`,
        )
        .all(...list, like(query), like(query)) as {
        id: string;
        title: string | null;
        status: string;
        position: number;
      }[];
      return rows.map((row) =>
        choice(
          `#${row.position} · ${row.title ?? "Checking video…"} · ${format.mediaStatusText(row.status)}`,
          row.id.length <= 100 ? row.id : `#${row.position}`,
        ),
      );
    }
    case "goal":
      return state
        .list("goal")
        .filter((goal) => goal.data.name.toLowerCase().includes(lowered))
        .slice(0, 25)
        .map((goal) =>
          choice(
            `${goal.data.name} · ${goal.data.value}/${goal.data.target}${goal.data.enabled ? "" : " · disabled"}`,
            goal.id,
          ),
        );
    case "poll-open":
    case "poll-any":
      return state
        .list("poll")
        .reverse()
        .filter(
          (poll) =>
            (option.source === "poll-any" ||
              (poll.data.status === "open" && poll.data.endsAt > now)) &&
            poll.data.name.toLowerCase().includes(lowered),
        )
        .slice(0, 25)
        .map((poll) =>
          choice(
            `${poll.data.name} · ${poll.data.status === "open" && poll.data.endsAt > now ? `open, ends in ${Math.max(1, Math.round((poll.data.endsAt - now) / 60000))}m` : "closed"}`,
            poll.id,
          ),
        );
    case "raffle-open":
    case "raffle-closed":
    case "raffle-drawn": {
      const wanted = option.source.slice(7);
      return state
        .list("raffle")
        .reverse()
        .filter(
          (raffle) =>
            raffle.data.status === wanted && raffle.data.name.toLowerCase().includes(lowered),
        )
        .slice(0, 25)
        .map((raffle) => {
          const entries = (
            state.db
              .prepare("SELECT count(*) AS n FROM participation WHERE activity=?")
              .get(raffle.id) as { n: number }
          ).n;
          return choice(
            `${raffle.data.name} · ${entries} entr${entries === 1 ? "y" : "ies"}`,
            raffle.id,
          );
        });
    }
    case "redemption": {
      const rows = state.db
        .prepare(
          "SELECT id,viewer,reward,cost,created_at AS createdAt FROM redemptions WHERE status='pending' ORDER BY created_at,id LIMIT 200",
        )
        .all() as { id: string; viewer: string; reward: string; cost: number; createdAt: number }[];
      const names = new Map(state.list("reward").map((reward) => [reward.id, reward.data.name]));
      return rows
        .filter((row) => row.id.length <= 100)
        .map((row) =>
          choice(
            `${names.get(row.reward) ?? "Removed reward"} · ${state.viewerName(row.viewer) ?? `Viewer ${row.viewer}`} · ${row.cost} pts · ${ago(row.createdAt, now)}`,
            row.id,
          ),
        )
        .filter((entry) => entry.name.toLowerCase().includes(lowered))
        .slice(0, 25);
    }
    case "viewer": {
      const rows = state.db
        .prepare(
          "SELECT id,name,last_seen AS lastSeen FROM viewers WHERE name!=? AND role!='bot' AND (name LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\') ORDER BY last_seen DESC LIMIT 25",
        )
        .all(ERASED_VIEWER, like(lowered), like(lowered)) as {
        id: string;
        name: string;
        lastSeen: number;
      }[];
      return rows.map((row) => choice(`${row.name} · seen ${ago(row.lastSeen, now)}`, row.id));
    }
    case "message": {
      let viewerId: string;
      try {
        viewerId = resolveViewer(state, values.viewer);
      } catch {
        return [];
      }
      // Scan only the newest retained chat receipts so the 3-second deadline holds on large installs.
      const rows = state.db
        .prepare(
          `SELECT json_extract(payload,'$.message_id') AS id,json_extract(payload,'$.content') AS content,received_at AS at FROM (SELECT payload,received_at FROM receipts WHERE event_type='chat.message.sent' AND payload IS NOT NULL ORDER BY received_at DESC LIMIT 5000) WHERE CAST(json_extract(payload,'$.sender.user_id') AS TEXT)=? ORDER BY at DESC LIMIT 25`,
        )
        .all(viewerId) as { id: string | null; content: string | null; at: number }[];
      return rows
        .filter(
          (row) =>
            row.id &&
            String(row.id).length <= 100 &&
            String(row.content ?? "")
              .toLowerCase()
              .includes(lowered),
        )
        .map((row) =>
          choice(
            `“${String(row.content ?? "").slice(0, 70)}” · ${ago(row.at, now)}`,
            String(row.id),
          ),
        );
    }
  }
  return [];
}
