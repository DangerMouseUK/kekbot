import { randomInt } from "node:crypto";
import type { z } from "zod";
import type { Actor } from "../auth.ts";
import { AppError } from "../errors.ts";
import { State } from "./state.ts";
import { MediaService } from "./media.ts";
import { EngagementService } from "./engagement.ts";
import { PresentationService, renderTemplate } from "./presentation.ts";
import { ModerationService, chatRole, type ChatMessage } from "./moderation.ts";
import { configSchemas } from "./catalog.ts";

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
      const builtIn = this.utility(command, args, viewer, name, role, actor, receipt);
      if (builtIn !== undefined) {
        this.state.repository.set(cooldown, String(Date.now()));
        this.state.observe(`command:${receipt}`, "commands.executed");
        reply(builtIn); return;
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
      reply(error instanceof AppError ? error.code.replaceAll("_", " ") : "Command input was not valid.");
    }
  }

  private utility(command: string, args: string[], viewer: string, name: string, role: string, actor: Actor, receipt: string): string | undefined {
    const settings = this.state.settings;
    if (command === "!kekbot") {
      const last = Number(this.state.repository.setting("proof_last_reply_decision_at") ?? 0);
      if (Date.now() - last < 10000) return undefined;
      this.state.repository.set("proof_last_reply_decision_at", String(Date.now()));
      return "KekBot foundation proof: verified event, durable receipt, real reply.";
    }
    if (command === "!commands") return ["!commands !uptime !rules !discord !socials !so !goal !points !watchtime !top !vote !enter !redeem", ...(settings.mediaEnabled ? ["!sr !queue !nowplaying !skip"] : []), ...this.state.list("command").filter(c => c.data.enabled).map(c => c.data.trigger)].join(" · ").slice(0, 500);
    if (["!rules", "!discord", "!socials"].includes(command)) return settings[command.slice(1) as "rules" | "discord" | "socials"] || "Not configured yet.";
    if (command === "!uptime") {
      const started = Date.parse(this.state.repository.setting("stream_started_at") ?? "");
      return this.state.repository.setting("stream_is_live") !== "true" ? "Stream is offline or status is unavailable." : !Number.isFinite(started) ? "Stream start time is unavailable." : `Live for ${Math.max(0, Math.floor((Date.now() - started) / 60000))} minutes.`;
    }
    if (command === "!so") {
      this.state.assertActor(actor, "operate");
      const target = args[0]?.replace(/^@/, "");
      if (!target || !/^[a-zA-Z0-9_-]{1,50}$/.test(target)) throw new AppError("provide_channel_username", 400);
      this.state.repository.set("last_shoutout", JSON.stringify({ name: target, url: `https://kick.com/${target}`, at: Date.now() }));
      this.state.emit("shoutout", {});
      return `Check out ${target}: https://kick.com/${target}`;
    }
    if (command === "!sr") { const item = this.media.request(args[0] ?? "", viewer, `request:${receipt}`); return `Request ${item.id} is being validated.`; }
    if (["!queue", "!nowplaying", "!skip"].includes(command)) {
      if (!settings.mediaEnabled) throw new AppError("media_disabled", 409);
      const player = this.media.player;
      if (command === "!skip") { this.media.control(actor, "skip", player.version); return "Skipped current item."; }
      if (command === "!nowplaying") return player.current ? `Now playing: ${this.media.item(player.current)?.title ?? "unavailable"}` : "Nothing is playing.";
      return (this.state.db.prepare("SELECT title FROM media WHERE status='approved' ORDER BY position LIMIT 5").all() as { title: string }[]).map((item, i) => `${i + 1}. ${item.title}`).join(" · ") || "Queue is empty.";
    }
    if (command === "!goal") return this.state.list("goal").filter(g => g.data.enabled).map(g => `${g.data.name}: ${g.data.value}/${g.data.target}`).join(" · ") || "No active goals.";
    if (command === "!points") return settings.pointsEnabled ? `${name}: ${this.engagement.balance(viewer)} points.` : "Points are disabled.";
    if (command === "!watchtime") { const row = this.state.db.prepare("SELECT watch_minutes FROM viewers WHERE id=?").get(viewer) as { watch_minutes: number } | undefined; return `Estimated watchtime from observed chat activity: ${row?.watch_minutes ?? 0} minutes.`; }
    if (command === "!top") return (this.state.db.prepare("SELECT coalesce(v.name,'Viewer') AS name,sum(l.amount) AS balance FROM ledger l LEFT JOIN viewers v ON l.viewer=v.id GROUP BY l.viewer ORDER BY balance DESC LIMIT 5").all() as { name: string; balance: number }[]).map(row => `${row.name}: ${row.balance}`).join(" · ") || "No points awarded yet.";
    if (command === "!redeem") { const reward = this.state.list("reward").find(r => r.id === args[0] || r.data.name.toLowerCase() === args.join(" ").toLowerCase()); if (!reward) throw new AppError("reward_not_found", 404); this.engagement.redeem(viewer, reward.id, `redemption:${receipt}`); return "Reward redemption awaits moderator fulfillment."; }
    if (command === "!vote") { const poll = this.state.list("poll").filter(p => p.data.status === "open").at(-1); if (!poll) throw new AppError("no_open_poll", 409); this.engagement.vote(poll.id, viewer, Number(args[0])); return "Vote saved."; }
    if (command === "!enter") { const raffle = this.state.list("raffle").filter(r => r.data.status === "open").at(-1); if (!raffle) throw new AppError("no_open_raffle", 409); this.engagement.enter(raffle.id, viewer, role); return "Raffle entry saved."; }
    return undefined;
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
