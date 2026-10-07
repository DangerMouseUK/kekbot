import { z } from "zod";
import type { Config } from "../config.ts";
import type { Actor } from "../auth.ts";
import type { Repository, Job } from "../storage/repository.ts";
import { AppError } from "../errors.ts";
import { State } from "./state.ts";
import { MediaService } from "./media.ts";
import { EngagementService } from "./engagement.ts";
import { PresentationService } from "./presentation.ts";
import { ModerationService, type ChatMessage } from "./moderation.ts";
import { AutomationService } from "./automation.ts";
import { OperationsService } from "./operations.ts";

export class BotService {
  readonly state: State; readonly media: MediaService; readonly engagement: EngagementService;
  readonly presentation: PresentationService; readonly moderation: ModerationService; readonly automation: AutomationService; readonly operations: OperationsService;
  constructor(repository: Repository, config: Config) {
    this.state = new State(repository, config); this.media = new MediaService(this.state); this.engagement = new EngagementService(this.state);
    this.presentation = new PresentationService(this.state); this.moderation = new ModerationService(this.state); this.operations = new OperationsService(this.state);
    this.automation = new AutomationService(this.state, this.media, this.engagement, this.presentation, this.moderation);
  }
  event(job: Job) {
    const { receiptId } = z.object({ receiptId: z.string() }).parse(JSON.parse(job.payload));
    this.state.db.transaction(() => {
      const row = this.state.db.prepare("SELECT event_type,payload FROM receipts WHERE id=?").get(receiptId) as { event_type: string; payload: string | null } | undefined;
      if (!row?.payload) throw new AppError("receipt_payload_missing", 500);
      const event = JSON.parse(row.payload);
      if (row.event_type === "chat.message.sent") this.automation.chat(event as ChatMessage, receiptId);
      else if (row.event_type === "livestream.status.updated") {
        const sentAt = Number(event._provider_sent_at ?? Date.now());
        if (sentAt < Number(this.state.repository.setting("stream_state_at") ?? 0)) { this.state.repository.finish(job, "succeeded"); return; }
        this.state.repository.set("stream_state_at", String(sentAt));
        const was = this.state.repository.setting("stream_is_live");
        this.state.repository.set("stream_is_live", String(event.is_live));
        this.state.repository.set("stream_started_at", event.started_at ?? "");
        if (was !== String(event.is_live)) {
          this.state.notify(event.is_live ? "live" : "offline", `${this.state.settings.name} is ${event.is_live ? "live" : "offline"}.`, `stream:${receiptId}`);
          const history = JSON.parse(this.state.repository.setting("stream_history") ?? "[]") as { id: string; start: number; end: number | null }[];
          if (event.is_live) history.push({ id: receiptId, start: Number.isFinite(Date.parse(event.started_at)) ? Date.parse(event.started_at) : Date.now(), end: null });
          else if (history.at(-1)) history.at(-1)!.end = Date.now();
          this.state.repository.set("stream_history", JSON.stringify(history.slice(-1000)));
        }
        this.state.emit("stream", {});
      } else {
        const person = event.follower ?? event.subscriber ?? event.gifter;
        this.presentation.alert(row.event_type, { user: person?.username ?? "Anonymous supporter", name: person?.username ?? "Anonymous supporter", count: event.giftees?.length ?? event.duration ?? 1 }, receiptId);
        const metric = row.event_type === "channel.followed" ? "follow" : "subscription";
        this.presentation.goal(metric, event.giftees?.length ?? 1, receiptId);
        this.state.observe(`support:${receiptId}`, `support.${metric}`, event.giftees?.length ?? 1);
      }
      this.state.repository.set("last_processed_event", receiptId);
      this.state.repository.finish(job, "succeeded");
      if (row.event_type === "chat.message.sent" && this.state.settings.chatDays === 0) this.state.db.prepare("UPDATE receipts SET payload=NULL WHERE id=?").run(receiptId);
    }).immediate();
  }
  tick(now = Date.now()) {
    this.automation.timers(now); this.engagement.accrue(now); this.engagement.expire(now); this.presentation.tick(now); this.media.expireLease(now);
    this.state.observe(`worker:${Math.floor(now / 60000)}`, "worker.minute");
  }
  async action(actor: Actor, action: string, input: Record<string, unknown>, id: string) {
    const target = z.string().max(100).parse(input.target ?? "");
    if (action === "status") {
      if (actor.id.startsWith("discord:") && !actor.permissions.length) throw new AppError("discord_permission_denied", 403);
      return { stream: this.state.repository.setting("stream_is_live") ?? "unavailable", player: { state: this.media.player.state, version: this.media.player.version }, jobs: this.state.repository.diagnostics().jobs, ...(this.state.settings.mediaEnabled && (!actor.id.startsWith("discord:") || actor.permissions.includes("media")) ? { requests: this.state.db.prepare("SELECT id,title,status,version FROM media WHERE status IN ('pending','approved','playing') ORDER BY position LIMIT 8").all() } : {}) };
    }
    if (action === "moderation.pause" || action === "moderation.resume") {
      this.state.assertActor(actor, "moderate");
      this.state.db.prepare("INSERT INTO documents(id,kind,data,version,updated_at) VALUES('instance','settings',?,1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=documents.version+1,updated_at=excluded.updated_at").run(JSON.stringify({ ...this.state.settings, moderationPaused: action === "moderation.pause" }), Date.now());
      this.state.audit(actor.id, action, "instance"); return { paused: action === "moderation.pause" };
    }
    if (action === "moderation.bulk") {
      this.state.assertActor(actor, "moderate");
      if (input.acknowledge !== true) throw new AppError("operator_acknowledgement_required", 409);
      const targets = z.array(z.number().int().positive()).min(1).max(20).parse(input.targets);
      if (new Set(targets).size !== targets.length) throw new AppError("duplicate_bulk_target", 400);
      return this.state.db.transaction(() => targets.map(userId => this.moderation.manual(actor, { ...input, userId, action: z.enum(["warn", "timeout", "ban"]).parse(input.operation) }, `${id}:${userId}`))).immediate();
    }
    if (action === "timers.pause" || action === "timers.resume") {
      this.state.assertActor(actor, "operate");
      const doc = this.state.document("instance");
      const settings = { ...this.state.settings, timersPaused: action === "timers.pause" };
      this.state.db.prepare("INSERT INTO documents(id,kind,data,version,updated_at) VALUES('instance','settings',?,1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=documents.version+1,updated_at=excluded.updated_at").run(JSON.stringify(settings), Date.now());
      this.automation.recoverTimers(); this.state.audit(actor.id, action, doc?.id ?? "instance"); return { paused: settings.timersPaused };
    }
    if (action === "alert.manual") { this.state.assertActor(actor, "operate"); return this.presentation.alert("manual", { user: actor.id, text: z.string().min(1).max(500).parse(input.reason), name: String(input.reason) }, `manual:${id}`); }
    if (action.startsWith("media.")) {
      const operation = z.enum(["approve", "reject", "remove"]).parse(action.slice(6));
      return this.media.decide(actor, target, z.number().int().positive().parse(input.version), operation);
    }
    if (action.startsWith("player.")) {
      const operation = z.enum(["pause", "resume", "skip", "volume"]).parse(action.slice(7));
      return this.media.control(actor, operation, z.number().int().nonnegative().parse(input.version), input.value as number | undefined);
    }
    if (action.startsWith("moderation.")) return this.moderation.manual(actor, { action: action.slice(11), userId: Number(target), messageId: input.message, duration: input.value, reason: input.reason, acknowledge: input.acknowledge }, `manual:${id}`);
    if (action === "goal.adjust") return this.presentation.adjustGoal(actor, target, z.number().parse(input.value), z.number().parse(input.version));
    if (action === "reward.complete" || action === "reward.reject") return this.engagement.fulfill(actor, target, action === "reward.complete" ? "complete" : "reject");
    if (action === "activity.close") return this.engagement.close(actor, target) ?? { closed: true };
    if (action === "raffle.draw" || action === "raffle.reroll") return this.engagement.draw(actor, target, action === "raffle.reroll");
    throw new AppError("unknown_operation", 400);
  }
}
