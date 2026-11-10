import { z } from "zod";
import type { Config } from "../config.ts";
import type { Actor } from "../auth.ts";
import { Repository, type Job } from "../storage/repository.ts";
import { AppError } from "../errors.ts";
import { State } from "./state.ts";
import { MediaService } from "./media.ts";
import { EngagementService } from "./engagement.ts";
import { PresentationService } from "./presentation.ts";
import { ModerationService, type ChatMessage } from "./moderation.ts";
import { AutomationService } from "./automation.ts";
import { OperationsService } from "./operations.ts";
import { configSchemas } from "./catalog.ts";

export class BotService {
  readonly state: State;
  readonly media: MediaService;
  readonly engagement: EngagementService;
  readonly presentation: PresentationService;
  readonly moderation: ModerationService;
  readonly automation: AutomationService;
  readonly operations: OperationsService;
  constructor(repository: Repository, config: Config) {
    this.state = new State(repository, config);
    this.media = new MediaService(this.state);
    this.engagement = new EngagementService(this.state);
    this.presentation = new PresentationService(this.state);
    this.moderation = new ModerationService(this.state);
    this.operations = new OperationsService(this.state);
    this.automation = new AutomationService(
      this.state,
      this.media,
      this.engagement,
      this.presentation,
      this.moderation,
    );
  }
  event(job: Job) {
    const { receiptId } = z.object({ receiptId: z.string() }).parse(JSON.parse(job.payload));
    this.state.db
      .transaction(() => {
        const row = this.state.db
          .prepare("SELECT event_type,payload FROM receipts WHERE id=?")
          .get(receiptId) as { event_type: string; payload: string | null } | undefined;
        if (!row?.payload) throw new AppError("receipt_payload_missing", 500);
        const event = JSON.parse(row.payload);
        this.state.repository.withViewers(Repository.viewerIds(event), () => {
          if (row.event_type === "chat.message.sent")
            this.automation.chat(event as ChatMessage, receiptId);
          else if (row.event_type === "livestream.status.updated") {
            const sentAt = Number(event._provider_sent_at ?? Date.now());
            if (sentAt < Number(this.state.repository.setting("stream_state_at") ?? 0)) return;
            this.state.repository.set("stream_state_at", String(sentAt));
            const was = this.state.repository.setting("stream_is_live");
            this.state.repository.set("stream_is_live", String(event.is_live));
            this.state.repository.set("stream_started_at", event.started_at ?? "");
            if (was !== String(event.is_live)) {
              this.state.notify(
                event.is_live ? "live" : "offline",
                `${this.state.settings.name} is ${event.is_live ? "live" : "offline"}.`,
                `stream:${receiptId}`,
              );
              const history = JSON.parse(
                this.state.repository.setting("stream_history") ?? "[]",
              ) as { id: string; start: number; end: number | null }[];
              if (event.is_live)
                history.push({
                  id: receiptId,
                  start: Number.isFinite(Date.parse(event.started_at))
                    ? Date.parse(event.started_at)
                    : Date.now(),
                  end: null,
                });
              else if (history.at(-1)) history.at(-1)!.end = Date.now();
              this.state.repository.set("stream_history", JSON.stringify(history.slice(-1000)));
            }
            this.state.emit("stream", {});
          } else {
            const person = event.follower ?? event.subscriber ?? event.gifter;
            this.presentation.alert(
              row.event_type,
              {
                user: person?.username ?? "Anonymous supporter",
                name: person?.username ?? "Anonymous supporter",
                count: event.giftees?.length ?? event.duration ?? 1,
              },
              receiptId,
            );
            const metric = row.event_type === "channel.followed" ? "follow" : "subscription";
            this.presentation.goal(metric, event.giftees?.length ?? 1, receiptId);
            this.state.observe(
              `support:${receiptId}`,
              `support.${metric}`,
              event.giftees?.length ?? 1,
            );
          }
        });
        this.state.repository.set("last_processed_event", receiptId);
        this.state.repository.finish(job, "succeeded");
        if (row.event_type === "chat.message.sent" && this.state.settings.chatDays === 0)
          this.state.db.prepare("UPDATE receipts SET payload=NULL WHERE id=?").run(receiptId);
      })
      .immediate();
  }
  tick(now = Date.now()) {
    this.automation.timers(now);
    this.engagement.accrue(now);
    this.engagement.expire(now);
    this.presentation.tick(now);
    this.media.expireLease(now);
    this.state.observe(`worker:${Math.floor(now / 60000)}`, "worker.minute");
  }
  async action(actor: Actor, action: string, input: Record<string, unknown>, id: string) {
    const target = z
      .string()
      .max(100)
      .parse(input.target ?? "");
    if (action === "status") {
      if (actor.id.startsWith("discord:") && !actor.permissions.length)
        throw new AppError("discord_permission_denied", 403);
      const settings = this.state.settings;
      const incident = JSON.parse(this.state.repository.setting("incident_mode") ?? "null") as {
        preset: string;
        endsAt: number;
      } | null;
      return {
        stream: this.state.repository.setting("stream_is_live") ?? "unavailable",
        player: {
          state: this.media.player.state,
          version: this.media.player.version,
          volume: this.media.player.volume,
        },
        jobs: this.state.repository.diagnostics().jobs,
        timersPaused: settings.timersPaused,
        moderationPaused: settings.moderationPaused,
        incidentMode: incident && incident.endsAt > Date.now() ? incident : null,
        mediaEnabled: settings.mediaEnabled,
        ...(settings.mediaEnabled &&
        (!actor.id.startsWith("discord:") || actor.permissions.includes("media"))
          ? {
              requests: this.state.db
                .prepare(
                  "SELECT id,title,status,position,version FROM media WHERE status IN ('pending','approved','playing') ORDER BY position LIMIT 8",
                )
                .all(),
            }
          : {}),
      };
    }
    const extended = this.extended(actor, action, input, id);
    if (extended !== undefined) return extended;
    if (action === "moderation.pause" || action === "moderation.resume") {
      this.state.assertActor(actor, "moderate");
      this.state.db
        .prepare(
          "INSERT INTO documents(id,kind,data,version,updated_at) VALUES('instance','settings',?,1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=documents.version+1,updated_at=excluded.updated_at",
        )
        .run(
          JSON.stringify({
            ...this.state.settings,
            moderationPaused: action === "moderation.pause",
          }),
          Date.now(),
        );
      this.state.audit(actor.id, action, "instance");
      return { paused: action === "moderation.pause" };
    }
    if (action === "moderation.incident.start") return this.moderation.incident(actor, input);
    if (action === "moderation.incident.stop") return this.moderation.stopIncident(actor);
    if (action === "moderation.bulk") {
      this.state.assertActor(actor, "moderate");
      if (input.acknowledge !== true) throw new AppError("operator_acknowledgement_required", 409);
      const targets = z.array(z.number().int().positive()).min(1).max(20).parse(input.targets);
      if (new Set(targets).size !== targets.length)
        throw new AppError("duplicate_bulk_target", 400);
      return this.state.db
        .transaction(() =>
          targets.map((userId) =>
            this.moderation.manual(
              actor,
              {
                ...input,
                userId,
                action: z.enum(["warn", "timeout", "ban"]).parse(input.operation),
              },
              `${id}:${userId}`,
            ),
          ),
        )
        .immediate();
    }
    if (action === "timers.pause" || action === "timers.resume") {
      this.state.assertActor(actor, "operate");
      const doc = this.state.document("instance");
      const settings = { ...this.state.settings, timersPaused: action === "timers.pause" };
      this.state.db
        .prepare(
          "INSERT INTO documents(id,kind,data,version,updated_at) VALUES('instance','settings',?,1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=documents.version+1,updated_at=excluded.updated_at",
        )
        .run(JSON.stringify(settings), Date.now());
      this.automation.recoverTimers();
      this.state.audit(actor.id, action, doc?.id ?? "instance");
      return { paused: settings.timersPaused };
    }
    if (action === "alert.manual") {
      this.state.assertActor(actor, "operate");
      return this.presentation.alert(
        "manual",
        {
          user: actor.id,
          text: z.string().min(1).max(500).parse(input.reason),
          name: String(input.reason),
        },
        `manual:${id}`,
      );
    }
    if (action.startsWith("media.")) {
      const operation = z.enum(["approve", "reject", "remove"]).parse(action.slice(6));
      return this.media.decide(
        actor,
        target,
        z.number().int().positive().parse(input.version),
        operation,
      );
    }
    if (action.startsWith("player.")) {
      const operation = z.enum(["pause", "resume", "skip", "volume"]).parse(action.slice(7));
      return this.media.control(
        actor,
        operation,
        z.number().int().nonnegative().parse(input.version),
        input.value as number | undefined,
      );
    }
    if (action.startsWith("moderation."))
      return this.moderation.manual(
        actor,
        {
          action: action.slice(11),
          userId: Number(target),
          messageId: input.message,
          duration: input.value,
          reason: input.reason,
          acknowledge: input.acknowledge,
        },
        `manual:${id}`,
      );
    if (action === "goal.adjust")
      return this.presentation.adjustGoal(
        actor,
        target,
        z.number().parse(input.value),
        z.number().parse(input.version),
      );
    if (action === "reward.complete" || action === "reward.reject")
      return this.engagement.fulfill(
        actor,
        target,
        action === "reward.complete" ? "complete" : "reject",
      );
    if (action === "activity.close")
      return this.engagement.close(actor, target) ?? { closed: true };
    if (action === "raffle.draw" || action === "raffle.reroll") {
      const reroll = action === "raffle.reroll";
      if (input.version === undefined) return this.engagement.draw(actor, target, reroll);
      // A rendered control (for example a Discord button) acts only on the version it showed.
      const version = z.number().int().positive().parse(input.version);
      this.state.assertActor(actor, "engage");
      return this.state.db
        .transaction(() => {
          const doc = this.state.document(target);
          if (!doc || doc.kind !== "raffle") throw new AppError("raffle_not_found", 404);
          if (doc.version !== version) throw new AppError("raffle_changed_reload", 409);
          return this.engagement.draw(actor, target, reroll);
        })
        .immediate();
    }
    throw new AppError("unknown_operation", 400);
  }

  /** Queue views and engagement shortcuts used by Discord and the integration API. */
  private extended(actor: Actor, action: string, input: Record<string, unknown>, id: string) {
    const db = this.state.db;
    switch (action) {
      case "media.queue": {
        this.state.assertActor(actor, "media");
        const player = this.media.player;
        const items = db
          .prepare(
            "SELECT id,title,requester,duration,status,position,version FROM media WHERE status IN ('validating','pending','approved','playing') ORDER BY CASE status WHEN 'playing' THEN 0 ELSE 1 END,position,created_at,id LIMIT 25",
          )
          .all() as { requester: string }[];
        const total = db
          .prepare(
            "SELECT count(*) AS n FROM media WHERE status IN ('validating','pending','approved','playing')",
          )
          .get() as { n: number };
        return {
          player: {
            state: player.state,
            volume: player.volume,
            current: player.current,
            version: player.version,
          },
          items: items.map((item) => ({
            ...item,
            requesterName: this.state.viewerName(item.requester) ?? null,
          })),
          total: total.n,
        };
      }
      case "media.move": {
        this.state.assertActor(actor, "media");
        const target = z.string().min(1).max(200).parse(input.target);
        const position = z.number().int().min(1).max(500).parse(input.position);
        return db
          .transaction(() => {
            const order = (
              db
                .prepare(
                  "SELECT id FROM media WHERE status='approved' ORDER BY position,created_at,id",
                )
                .all() as { id: string }[]
            ).map((row) => row.id);
            const item = this.media.item(target);
            if (!item || !order.includes(target)) throw new AppError("media_not_waiting", 409);
            if (input.version !== undefined && item.version !== input.version)
              throw new AppError("media_changed_reload", 409);
            order.splice(order.indexOf(target), 1);
            order.splice(Math.min(position - 1, order.length), 0, target);
            this.media.reorder(actor, order);
            return { item: this.media.item(target)!, total: order.length };
          })
          .immediate();
      }
      case "media.clear": {
        this.state.assertActor(actor, "media");
        if (input.acknowledge !== true)
          throw new AppError("operator_acknowledgement_required", 409);
        return db
          .transaction(() => {
            const removed = db
              .prepare(
                "SELECT count(*) AS n FROM media WHERE status IN ('validating','pending','approved')",
              )
              .get() as { n: number };
            this.media.clear(actor);
            return { cleared: true, removed: removed.n };
          })
          .immediate();
      }
      case "goal.list": {
        this.state.assertActor(actor, "operate");
        return {
          goals: this.state
            .list("goal")
            .slice(0, 25)
            .map((goal) => ({ id: goal.id, version: goal.version, ...goal.data })),
        };
      }
      case "poll.create":
      case "raffle.create": {
        this.state.assertActor(actor, "engage");
        const kind = action === "poll.create" ? "poll" : "raffle";
        const minutes = z
          .number()
          .int()
          .min(1)
          .max(1440)
          .parse(input.minutes ?? 5);
        const fields =
          kind === "poll"
            ? { name: input.name, options: input.options, allowChange: input.allowChange ?? false }
            : { name: input.name, minPoints: input.minPoints ?? 0 };
        const data = configSchemas[kind]
          .strict()
          .parse({ ...fields, endsAt: Date.now() + minutes * 60000 });
        // Derived from the request/interaction ID so a retried request cannot create a duplicate.
        const document = this.state.createActivity(actor, kind, `${kind}-${id}`, data);
        this.state.emit(kind, { id: document.id });
        return document;
      }
      case "poll.results": {
        this.state.assertActor(actor, "engage");
        const doc = this.state.document(z.string().max(100).parse(input.target));
        if (!doc || doc.kind !== "poll") throw new AppError("poll_not_found", 404);
        const poll = configSchemas.poll.parse(doc.data);
        const counts = new Map(
          (
            db
              .prepare(
                "SELECT choice,count(*) AS n FROM participation WHERE activity=? GROUP BY choice",
              )
              .all(doc.id) as { choice: string; n: number }[]
          ).map((row) => [row.choice, row.n]),
        );
        return {
          id: doc.id,
          name: poll.name,
          status: poll.endsAt <= Date.now() ? "closed" : poll.status,
          endsAt: poll.endsAt,
          options: poll.options.map((option, index) => ({
            option,
            votes: counts.get(String(index + 1)) ?? 0,
          })),
        };
      }
      case "reward.pending": {
        this.state.assertActor(actor, "engage");
        const rows = db
          .prepare(
            "SELECT id,viewer,reward,cost,created_at AS createdAt FROM redemptions WHERE status='pending' ORDER BY created_at,id LIMIT 25",
          )
          .all() as {
          id: string;
          viewer: string;
          reward: string;
          cost: number;
          createdAt: number;
        }[];
        const total = db
          .prepare("SELECT count(*) AS n FROM redemptions WHERE status='pending'")
          .get() as { n: number };
        return {
          items: rows.map((row) => ({
            ...row,
            rewardName: String(this.state.document(row.reward)?.data.name ?? "Removed reward"),
            viewerName: this.state.viewerName(row.viewer) ?? null,
          })),
          total: total.n,
        };
      }
      case "points.lookup": {
        this.state.assertActor(actor, "engage");
        const viewer = z
          .string()
          .regex(/^\d{1,24}$/)
          .parse(input.viewer);
        const row = db
          .prepare(
            "SELECT watch_minutes AS watchMinutes,last_seen AS lastSeen FROM viewers WHERE id=?",
          )
          .get(viewer) as { watchMinutes: number; lastSeen: number } | undefined;
        return {
          viewer,
          name: this.state.viewerName(viewer) ?? null,
          balance: this.engagement.balance(viewer),
          watchMinutes: row?.watchMinutes ?? 0,
          lastSeen: row?.lastSeen ?? null,
          pointsEnabled: this.state.settings.pointsEnabled,
        };
      }
    }
    return undefined;
  }
}
