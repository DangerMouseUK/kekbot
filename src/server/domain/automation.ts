import { randomInt } from "node:crypto";
import type { z } from "zod";
import type { Actor } from "../auth.ts";
import { AppError, isAppError } from "../errors.ts";
import { State } from "./state.ts";
import { MediaService } from "./media.ts";
import { EngagementService } from "./engagement.ts";
import { PresentationService, renderTemplate } from "./presentation.ts";
import { ModerationService, chatRole, type ChatMessage } from "./moderation.ts";
import { configSchemas } from "./catalog.ts";
import * as replies from "./replies.ts";

// Extra wording details (cooldown remaining, reward cost, poll options) for an error raised during a chat command.
const replyContexts = new WeakMap<Error, replies.ReplyContext>();
function annotateError(error: AppError, context: replies.ReplyContext) {
  replyContexts.set(error, context);
  return error;
}
function annotate<T>(run: () => T, context: () => replies.ReplyContext): T {
  try {
    return run();
  } catch (error) {
    if (isAppError(error) && !replyContexts.has(error)) replyContexts.set(error, context());
    throw error;
  }
}

export class AutomationService {
  readonly state: State;
  readonly media: MediaService;
  readonly engagement: EngagementService;
  readonly presentation: PresentationService;
  readonly moderation: ModerationService;
  constructor(state: State, media: MediaService, engagement: EngagementService, presentation: PresentationService, moderation: ModerationService) {
    this.state = state; this.media = media; this.engagement = engagement; this.presentation = presentation; this.moderation = moderation;
  }
  preview(actor: Actor, kind: "command" | "timer", input: unknown) {
    this.state.assertActor(actor, "configure");
    const variables = { user: "Preview viewer", args: "sample arguments", channel: this.state.settings.name, counter: 1, points: 100 };
    const config = configSchemas[kind].strict().parse(input);
    const messages = "responses" in config ? config.responses : config.messages;
    return { preview: true, responses: messages.map(message => renderTemplate(message, variables)), note: "Preview only; no cooldown, counter, schedule, history or provider action is changed." };
  }
  chat(message: ChatMessage, receipt: string) {
    const viewer = String(message.sender.user_id), role = chatRole(message);
    const name = message.sender.username ?? `Viewer ${viewer}`;
    const isBot = message.sender.identity?.badges?.some(b => b.type === "bot") || Boolean(this.state.repository.setting(`sent:${message.message_id}`));
    if (isBot) return;
    this.state.db.prepare("INSERT INTO viewers(id,name,role,last_seen,messages) VALUES(?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET name=excluded.name,role=excluded.role,last_seen=excluded.last_seen,messages=viewers.messages+1").run(viewer, name, role, Date.now());
    this.state.repository.set("chat_count", String(Number(this.state.repository.setting("chat_count") ?? 0) + 1));
    this.state.observe(`chat:${receipt}`, "chat.messages");
    this.state.observe(`chatter:${this.state.repository.setting("stream_started_at") || new Date().toISOString().slice(0, 10)}:${viewer}`, "chat.distinct");
    this.state.emit("chat", { receipt });
    if (this.moderation.inspect(message, receipt)) return;
    const [trigger, ...args] = message.content.trim().split(/\s+/);
    if (!trigger?.startsWith("!")) return;
    const command = trigger.toLowerCase();
    const actor: Actor = { id: `kick:${viewer}`, role: ["moderator", "broadcaster"].includes(role) ? "moderator" : "readonly", permissions: [] };
    const reply = (text: string) => this.state.effect(`reply:${receipt}`, "kick.reply", { text });
    const cooldown = `utility:${viewer}:${command}`;
    try {
      if (Date.now() - Number(this.state.repository.setting(cooldown) ?? 0) < 5000) return;
      const builtIn = this.utility(command, args, viewer, message.sender.username, role, actor, receipt);
      if (builtIn !== undefined) {
        this.state.repository.set(cooldown, String(Date.now()));
        this.state.observe(`command:${receipt}`, "commands.executed");
        // Replies that name other viewers are associated with them too, so erasure can scrub the payload.
        const result = typeof builtIn === "string" ? { text: builtIn, viewers: [] } : builtIn;
        this.state.repository.withViewers(result.viewers.filter((id): id is string => Boolean(id && /^\d{1,24}$/.test(id))), () => reply(result.text));
        return;
      }
      const doc = this.state.list("command").find(c => c.data.enabled && [c.data.trigger, ...c.data.aliases].includes(command));
      if (!doc) return;
      const config = doc.data, now = Date.now(), live = this.state.repository.setting("stream_is_live") === "true";
      if (config.roles.length && !config.roles.includes(role as never) || config.streamOnly && !live || config.condition === "live" && !live || config.condition === "offline" && live) return;
      const globalKey = `cooldown:${doc.id}`, userKey = `${globalKey}:${viewer}`;
      if (now - Number(this.state.repository.setting(globalKey) ?? 0) < config.cooldown * 1000 || now - Number(this.state.repository.setting(userKey) ?? 0) < config.userCooldown * 1000) return;
      let count = Number(this.state.repository.setting(`counter:${doc.id}`) ?? 0);
      if (config.counter) this.state.repository.set(`counter:${doc.id}`, String(++count));
      this.state.repository.set(globalKey, String(now)); this.state.repository.set(userKey, String(now));
      reply(renderTemplate(config.responses[randomInt(config.responses.length)], { user: name, args: args.join(" ").slice(0, 200), channel: this.state.settings.name, counter: count, points: this.engagement.balance(viewer) }));
      this.state.observe(`command:${receipt}`, "commands.executed");
    } catch (error) {
      this.state.repository.set(cooldown, String(Date.now()));
      // Viewers see plain English; the AppError code stays the API contract and is never sent to chat.
      reply(replies.address(message.sender.username, isAppError(error) ? replies.errorReply(error.code, replyContexts.get(error)) : replies.errorReply(undefined)));
    }
  }

  private utility(command: string, args: string[], viewer: string, username: string | undefined, role: string, actor: Actor, receipt: string): string | { text: string; viewers: (string | undefined)[] } | undefined {
    const settings = this.state.settings;
    if (command === "!kekbot") {
      const last = Number(this.state.repository.setting("proof_last_reply_decision_at") ?? 0);
      if (Date.now() - last < 10000) return undefined;
      this.state.repository.set("proof_last_reply_decision_at", String(Date.now()));
      return "KekBot foundation proof: verified event, durable receipt, real reply.";
    }
    if (command === "!commands") {
      const groups = this.commandGroups(role);
      return args.length ? replies.commandDetail(groups, args.join(" ")) : replies.commandSummary(groups);
    }
    if (command === "!rules" || command === "!discord" || command === "!socials") {
      const kind = command.slice(1) as "rules" | "discord" | "socials";
      return replies.utilityText(kind, settings[kind]);
    }
    if (command === "!uptime") return replies.uptime(this.state.repository.setting("stream_is_live") === "true", Date.parse(this.state.repository.setting("stream_started_at") ?? ""));
    if (command === "!so") {
      this.state.assertActor(actor, "operate");
      const target = args[0]?.replace(/^@/, "");
      if (!target || !/^[a-zA-Z0-9_-]{1,50}$/.test(target)) throw new AppError("provide_channel_username", 400);
      this.state.repository.set("last_shoutout", JSON.stringify({ name: target, url: `https://kick.com/${target}`, at: Date.now() }));
      this.state.emit("shoutout", {});
      return replies.shoutout(target);
    }
    if (command === "!sr") {
      const item = annotate(() => this.media.request(args[0] ?? "", viewer, `request:${receipt}`), () => ({
        perUser: settings.perUser,
        retryAfterSeconds: Math.ceil((settings.requestCooldown * 1000 - (Date.now() - Number(this.state.repository.setting(`request:${viewer}`) ?? 0))) / 1000),
      }));
      return replies.requestReceived(username, item.position);
    }
    if (["!queue", "!nowplaying", "!skip"].includes(command)) {
      if (!settings.mediaEnabled) throw new AppError("media_disabled", 409);
      const player = this.media.player;
      if (command === "!skip") {
        const skipped = this.queueEntry(player.current);
        const after = this.media.control(actor, "skip", player.version);
        const next = this.queueEntry(after.current);
        return { text: replies.skipped(skipped, next), viewers: [skipped?.viewer, next?.viewer] };
      }
      if (command === "!nowplaying") {
        const current = this.queueEntry(player.current);
        return { text: replies.nowPlaying(current), viewers: [current?.viewer] };
      }
      const rows = this.state.db.prepare("SELECT position,title,requester FROM media WHERE status='approved' ORDER BY position,created_at,id LIMIT 5").all() as { position: number; title: string | null; requester: string }[];
      const counts = this.state.db.prepare("SELECT coalesce(sum(status='approved'),0) AS approved,coalesce(sum(status='pending'),0) AS pending FROM media WHERE status IN ('approved','pending')").get() as { approved: number; pending: number };
      return { text: replies.queue(rows.map(row => ({ position: row.position, title: row.title, requester: this.state.viewerName(row.requester) })), counts.approved, counts.pending), viewers: rows.map(row => row.requester) };
    }
    if (command === "!goal") return replies.goals(this.state.list("goal").filter(g => g.data.enabled).map(g => ({ name: g.data.name, value: g.data.value, target: g.data.target, completed: g.data.completed })));
    if (command === "!points") return replies.balance(username, settings.pointsEnabled, this.engagement.balance(viewer));
    if (command === "!watchtime") {
      const row = this.state.db.prepare("SELECT watch_minutes FROM viewers WHERE id=?").get(viewer) as { watch_minutes: number } | undefined;
      return replies.watchtime(username, row?.watch_minutes ?? 0);
    }
    if (command === "!top") {
      const rows = this.state.db.prepare("SELECT l.viewer AS viewer,v.name AS name,sum(l.amount) AS balance FROM ledger l LEFT JOIN viewers v ON l.viewer=v.id GROUP BY l.viewer ORDER BY balance DESC LIMIT 5").all() as { viewer: string; name: string | null; balance: number }[];
      return { text: replies.leaderboard(rows), viewers: rows.map(row => row.viewer) };
    }
    if (command === "!redeem") {
      const rewards = this.state.list("reward");
      const reward = rewards.find(r => r.id === args[0] || r.data.name.toLowerCase() === args.join(" ").toLowerCase());
      if (!reward) throw annotateError(new AppError("reward_not_found", 404), { rewards: rewards.filter(r => r.data.enabled).map(r => ({ name: r.data.name, cost: r.data.cost })), pointsEnabled: settings.pointsEnabled });
      annotate(() => this.engagement.redeem(viewer, reward.id, `redemption:${receipt}`), () => ({ rewardName: reward.data.name, cost: reward.data.cost, balance: this.engagement.balance(viewer), pointsEnabled: settings.pointsEnabled }));
      return replies.redeemed(username, reward.data.name, reward.data.cost, this.engagement.balance(viewer));
    }
    if (command === "!vote") {
      const poll = this.state.list("poll").filter(p => p.data.status === "open").at(-1);
      if (!poll) throw new AppError("no_open_poll", 409);
      const options = poll.data.options;
      // Without a number, list the options instead of rejecting the vote.
      if (args[0] === undefined) {
        if (!poll.data.enabled || poll.data.endsAt <= Date.now()) throw new AppError("poll_closed", 409);
        return replies.pollOptions(poll.data.name, options);
      }
      const choice = Number(args[0]);
      annotate(() => this.engagement.vote(poll.id, viewer, choice), () => ({ options }));
      return replies.voted(username, choice, options[choice - 1]);
    }
    if (command === "!enter") {
      const raffle = this.state.list("raffle").filter(r => r.data.status === "open").at(-1);
      if (!raffle) throw new AppError("no_open_raffle", 409);
      annotate(() => this.engagement.enter(raffle.id, viewer, role), () => ({ minPoints: raffle.data.minPoints, balance: this.engagement.balance(viewer) }));
      return replies.entered(username, raffle.data.name);
    }
    return undefined;
  }

  private queueEntry(id: string | null | undefined): (replies.QueueEntry & { viewer: string }) | undefined {
    const item = id ? this.media.item(id) : undefined;
    return item && { position: item.position, title: item.title, requester: this.state.viewerName(item.requester), viewer: item.requester };
  }

  /** Built-in groups for enabled modules, plus enabled custom commands under their configured group. */
  private commandGroups(role: string): replies.CommandGroup[] {
    const settings = this.state.settings;
    const moderator = ["moderator", "broadcaster"].includes(role);
    const anyEnabled = (kind: "goal" | "reward") => this.state.list(kind).some(item => item.data.enabled);
    const open = (kind: "poll" | "raffle") => this.state.list(kind).some(item => item.data.enabled && item.data.status === "open" && item.data.endsAt > Date.now());
    const groups: replies.CommandGroup[] = [
      { key: "info", label: "Info", commands: [
        { trigger: "!uptime", help: "— how long the stream has been live" },
        ...(settings.rules.trim() ? [{ trigger: "!rules", help: "— chat rules" }] : []),
        ...(settings.discord.trim() ? [{ trigger: "!discord", help: "— Discord link" }] : []),
        ...(settings.socials.trim() ? [{ trigger: "!socials", help: "— social links" }] : []),
        ...(anyEnabled("goal") ? [{ trigger: "!goal", help: "— goal progress" }] : []),
        { trigger: "!watchtime", help: "— your estimated watchtime" },
      ] },
      { key: "points", label: "Points", commands: settings.pointsEnabled ? [
        { trigger: "!points", help: "— your balance" },
        { trigger: "!top", help: "— leaderboard" },
        ...(anyEnabled("reward") ? [{ trigger: "!redeem", help: "<reward> — spend points" }] : []),
      ] : [] },
      { key: "polls", label: "Polls", commands: [
        ...(open("poll") ? [{ trigger: "!vote", help: "<number> — vote (no number lists the options)" }] : []),
        ...(open("raffle") ? [{ trigger: "!enter", help: "— join the raffle" }] : []),
      ] },
      { key: "music", label: "Music", commands: settings.mediaEnabled ? [
        { trigger: "!sr", help: "<YouTube link> — request a song" },
        { trigger: "!queue", help: "— next songs" },
        { trigger: "!nowplaying", help: "— current song" },
      ] : [] },
      { key: "mods", label: "Mods", commands: moderator ? [
        { trigger: "!so", help: "<username> — shoutout" },
        ...(settings.mediaEnabled ? [{ trigger: "!skip", help: "— skip the current song" }] : []),
      ] : [] },
    ];
    for (const doc of this.state.list("command").filter(c => c.data.enabled).sort((a, b) => a.data.trigger.localeCompare(b.data.trigger))) {
      const key = doc.data.group.toLowerCase();
      // Never merge into the moderator-only group: a custom "Mods" group stays separate and visible as configured.
      let group = groups.find(g => (g.custom || g.key !== "mods") && (g.key === key || g.label.toLowerCase() === key));
      if (!group) groups.push(group = { key, label: doc.data.group, commands: [], custom: true });
      group.commands.push({ trigger: doc.data.trigger });
    }
    return groups;
  }

  recoverTimers(now = Date.now()) {
    for (const timer of this.state.list("timer")) this.state.repository.set(`timer:${timer.id}`, JSON.stringify({ next: now + timer.data.interval * 1000, count: Number(this.state.repository.setting("chat_count") ?? 0), index: 0 }));
  }
  private timerEnabled(timer: z.infer<typeof configSchemas.timer>, now: number) {
    const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: timer.timezone }).format(now));
    const quiet = timer.quietStart !== null && timer.quietEnd !== null && (timer.quietStart < timer.quietEnd ? hour >= timer.quietStart && hour < timer.quietEnd : hour >= timer.quietStart || hour < timer.quietEnd);
    return timer.enabled && !this.state.settings.timersPaused && (!timer.streamOnly || this.state.repository.setting("stream_is_live") === "true") && !quiet;
  }
  timerDeliveryAllowed(input: { timerId?: string; timerVersion?: number; scheduledAt?: number }, now = Date.now()) {
    if (!input.timerId || !Number.isSafeInteger(input.scheduledAt)) return false;
    const doc = this.state.document(input.timerId);
    if (!doc || doc.kind !== "timer" || doc.version !== input.timerVersion) return false;
    const timer = configSchemas.timer.parse(doc.data);
    const schedule = JSON.parse(this.state.repository.setting(`timer:${doc.id}`) ?? "{}");
    return schedule.lastQueued === input.scheduledAt && now >= input.scheduledAt! && now - input.scheduledAt! <= timer.interval * 1000 && this.timerEnabled(timer, now);
  }
  timers(now = Date.now()) {
    const count = Number(this.state.repository.setting("chat_count") ?? 0);
    for (const doc of this.state.list("timer")) this.state.db.transaction(() => {
      const timer = doc.data;
      const schedule = JSON.parse(this.state.repository.setting(`timer:${doc.id}`) ?? JSON.stringify({ next: now + timer.interval * 1000, count, index: 0 })) as { next: number; count: number; index: number; lastQueued?: number };
      const disabled = !this.timerEnabled(timer, now);
      if (disabled) { schedule.next = now + timer.interval * 1000; schedule.count = count; schedule.lastQueued = undefined; }
      else if (schedule.next <= now) {
        if (count - schedule.count >= timer.minMessages) {
          const text = renderTemplate(timer.messages[schedule.index % timer.messages.length], { channel: this.state.settings.name });
          this.state.effect(`timer:${doc.id}:${schedule.next}`, "kick.reply", { text, timerId: doc.id, timerVersion: doc.version, scheduledAt: schedule.next });
          schedule.lastQueued = schedule.next;
          schedule.index++; schedule.count = count;
        }
        schedule.next = now + timer.interval * 1000;
      }
      this.state.repository.set(`timer:${doc.id}`, JSON.stringify(schedule));
    }).immediate();
  }
}
