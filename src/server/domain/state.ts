import { randomUUID } from "node:crypto";
import { statfsSync } from "node:fs";
import { z } from "zod";
import { authorize, type Actor, type Permission } from "../auth.ts";
import { encrypt, decrypt } from "../crypto.ts";
import { AppError } from "../errors.ts";
import type { Config } from "../config.ts";
import type { Repository, JobKind } from "../storage/repository.ts";
import { configSchemas, defaults, type ConfigDocument, type Kind } from "./catalog.ts";
import { APP_VERSION } from "../version.ts";

export const ERASED_VIEWER = "Erased viewer";
/** Open polls plus raffles at which `engage`-only creation stops (see State.createActivity). */
export const OPEN_ACTIVITY_LIMIT = 10;

export class State {
  readonly repository: Repository;
  readonly config: Config;
  constructor(repository: Repository, config: Config) {
    this.repository = repository;
    this.config = config;
  }
  get db() {
    return this.repository.store.sqlite;
  }
  get settings() {
    return configSchemas.settings.parse(this.document("instance")?.data ?? defaults);
  }

  document(id: string): ConfigDocument | undefined {
    const row = this.db
      .prepare("SELECT id,kind,data,version,updated_at AS updatedAt FROM documents WHERE id=?")
      .get(id) as (Omit<ConfigDocument, "data"> & { data: string }) | undefined;
    return row ? { ...row, data: JSON.parse(row.data) } : undefined;
  }
  list<K extends Kind>(kind: K) {
    return (
      this.db
        .prepare(
          "SELECT id,kind,data,version,updated_at AS updatedAt FROM documents WHERE kind=? ORDER BY updated_at,id",
        )
        .all(kind) as (Omit<ConfigDocument, "data"> & { data: string })[]
    ).map((row) => ({
      ...row,
      data: configSchemas[kind].parse(JSON.parse(row.data)) as z.infer<(typeof configSchemas)[K]>,
    }));
  }

  /** Last observed display name; undefined when unknown or erased. */
  viewerName(id: string): string | undefined {
    const row = this.db.prepare("SELECT name FROM viewers WHERE id=?").get(id) as
      { name: string | null } | undefined;
    return row?.name && row.name !== ERASED_VIEWER ? row.name : undefined;
  }

  audit(actor: string, action: string, target: string, outcome = "confirmed") {
    this.db
      .prepare("INSERT INTO audit(actor,action,target,outcome,at) VALUES(?,?,?,?,?)")
      .run(actor, action, target, outcome, Date.now());
    this.emit("change", { action, target });
  }
  emit(topic: string, data: unknown) {
    this.db
      .prepare("INSERT INTO live_events(topic,data,at) VALUES(?,?,?)")
      .run(topic, JSON.stringify(data), Date.now());
  }
  observe(id: string, metric: string, value = 1) {
    this.db
      .prepare("INSERT OR IGNORE INTO observations(id,metric,value,at) VALUES(?,?,?,?)")
      .run(id, metric, value, Date.now());
  }
  assertActor(actor: Actor, permission: Permission) {
    if (actor.capabilityId) {
      const row = this.db
        .prepare(
          "SELECT scopes FROM access_tokens WHERE id=? AND kind='api' AND (expires_at IS NULL OR expires_at>?)",
        )
        .get(actor.capabilityId, Date.now()) as { scopes: string } | undefined;
      if (!row || !(JSON.parse(row.scopes) as string[]).includes(permission))
        throw new AppError("api_permission_revoked", 403);
    }
    if (actor.id.startsWith("discord:")) {
      const identity = actor.discord;
      const guild =
        identity &&
        this.list("guild").find(
          (g) =>
            g.data.enabled &&
            g.data.guildId === identity.guild &&
            g.data.channelId === identity.channel,
        );
      if (
        !guild ||
        !identity ||
        ![
          ...guild.data.roles.filter((r) => identity.roles.includes(r.id)),
          ...guild.data.users.filter((u) => u.id === identity.user),
        ].some((grant) => grant.permission === permission)
      )
        throw new AppError("discord_permission_denied", 403);
    }
    // Local human/API identities are rechecked at execution, including deferred work.
    if (
      !actor.id.startsWith("kick:") &&
      !actor.id.startsWith("discord:") &&
      actor.id !== "worker"
    ) {
      const current = this.db
        .prepare("SELECT role,permissions FROM accounts WHERE id=? AND disabled=0")
        .get(actor.id) as { role: Actor["role"]; permissions: string } | undefined;
      if (!current) throw new AppError("account_disabled_or_removed", 403);
      authorize(
        { id: actor.id, role: current.role, permissions: JSON.parse(current.permissions) },
        permission,
      );
    } else authorize(actor, permission);
  }

  save(actor: Actor, kind: Kind, id: string | undefined, input: unknown, version?: number) {
    return this.write(
      actor,
      kind,
      id,
      input,
      version,
      kind === "settings" || kind === "guild"
        ? "integrations"
        : kind === "note"
          ? "moderate"
          : "configure",
    );
  }

  /**
   * Deliberate permission exception: `engage` holders may start polls and raffles. Uses the same
   * strict validation, document-ID rules, limits and audit as save(). The caller derives `id` from
   * its request/interaction, so a retried request returns the document it already created.
   */
  createActivity(actor: Actor, kind: "poll" | "raffle", id: string, input: unknown) {
    this.assertActor(actor, "engage");
    return this.db
      .transaction(() => {
        const existing = this.document(id);
        if (existing?.kind === kind) return existing;
        const now = Date.now();
        const open = [...this.list("poll"), ...this.list("raffle")].filter(
          (doc) => doc.data.status === "open" && doc.data.endsAt > now,
        ).length;
        if (open >= OPEN_ACTIVITY_LIMIT) throw new AppError("open_activity_limit", 409);
        return this.write(actor, kind, id, input, undefined, "engage");
      })
      .immediate();
  }

  private write(
    actor: Actor,
    kind: Kind,
    id: string | undefined,
    input: unknown,
    version: number | undefined,
    permission: Permission,
  ) {
    this.assertActor(actor, permission);
    const data = configSchemas[kind].strict().parse(input);
    if (kind === "alert") {
      const alert = configSchemas.alert.parse(data);
      for (const field of ["image", "sound"] as const)
        if (alert[field]) {
          const stored = this.repository.setting(`asset:${alert[field]}`);
          const format = stored ? (JSON.parse(stored) as { format: string }).format : "";
          if (
            !(field === "image" ? ["png", "jpg", "gif", "webp"] : ["wav", "ogg", "mp3"]).includes(
              format,
            )
          )
            throw new AppError("alert_asset_missing_or_wrong_type", 400);
        }
    }
    const key = kind === "settings" ? "instance" : (id ?? randomUUID());
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(key)) throw new AppError("invalid_document_id", 400);
    return this.db
      .transaction(() => {
        const existing = this.document(key);
        if (existing && (existing.kind !== kind || existing.version !== version))
          throw new AppError("configuration_changed_reload", 409);
        if (
          !existing &&
          this.db.prepare("SELECT count(*) AS n FROM documents").get() &&
          this.list(kind).length >= 500
        )
          throw new AppError("configuration_limit", 409);
        if (kind === "command") {
          const command = configSchemas.command.parse(data);
          const names = [command.trigger, ...command.aliases];
          const reserved = [
            "!kekbot",
            "!commands",
            "!uptime",
            "!rules",
            "!discord",
            "!socials",
            "!so",
            "!sr",
            "!queue",
            "!nowplaying",
            "!skip",
            "!goal",
            "!points",
            "!watchtime",
            "!top",
            "!vote",
            "!enter",
            "!redeem",
          ];
          if (
            new Set(names).size !== names.length ||
            names.some((n) => reserved.includes(n)) ||
            this.list("command").some(
              (c) =>
                c.id !== key && [c.data.trigger, ...c.data.aliases].some((n) => names.includes(n)),
            )
          )
            throw new AppError("command_trigger_conflict", 409);
        }
        this.db
          .prepare(
            "INSERT INTO documents(id,kind,data,version,updated_at) VALUES(?,?,?,1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=documents.version+1,updated_at=excluded.updated_at",
          )
          .run(key, kind, JSON.stringify(data), Date.now());
        this.audit(actor.id, `${kind}.save`, key);
        return this.document(key)!;
      })
      .immediate();
  }

  remove(actor: Actor, id: string, version: number) {
    const doc = this.document(id);
    if (!doc || doc.kind === "settings") throw new AppError("configuration_not_found", 404);
    this.assertActor(
      actor,
      doc.kind === "guild" ? "integrations" : doc.kind === "note" ? "moderate" : "configure",
    );
    if (doc.version !== version) throw new AppError("configuration_changed_reload", 409);
    this.db
      .transaction(() => {
        this.db.prepare("DELETE FROM documents WHERE id=? AND version=?").run(id, version);
        this.audit(actor.id, `${doc.kind}.delete`, id);
      })
      .immediate();
  }

  effect(id: string, kind: JobKind, payload: unknown, actor?: Actor, permission?: Permission) {
    if (actor && permission) this.assertActor(actor, permission);
    this.repository.enqueue(id, kind, {
      ...Object(payload),
      ...(actor ? { actor, permission } : {}),
    });
    this.emit("effect", { id, status: "pending" });
    return { id, status: "pending" };
  }

  secret<T>(name: string): T | undefined {
    const row = this.db
      .prepare("SELECT secret FROM connections WHERE provider=?")
      .get(`config:${name}`) as { secret: string } | undefined;
    return row
      ? (JSON.parse(decrypt(row.secret, this.config.key, `config:${name}`)) as T)
      : undefined;
  }
  saveSecret(actor: Actor, name: string, data: unknown) {
    this.assertActor(actor, "integrations");
    const schemas = {
      youtube: z.object({ key: z.string().min(10).max(256) }),
      discord: z.object({
        applicationId: z.string().regex(/^\d{1,24}$/),
        publicKey: z.string().regex(/^[a-f0-9]{64}$/i),
        botToken: z.string().min(10).max(512),
      }),
      kick: z.object({
        clientId: z.string().min(1).max(128),
        clientSecret: z.string().min(16).max(256),
        broadcasterId: z.number().int().positive(),
      }),
    };
    if (!(name in schemas)) throw new AppError("unknown_integration", 400);
    if (this.config.mode === "fixture")
      throw new AppError("fixture_mode_rejects_live_credentials", 409);
    const parsed = schemas[name as keyof typeof schemas].parse(data);
    this.db
      .prepare(
        "INSERT INTO connections(provider,secret,updated_at) VALUES(?,?,?) ON CONFLICT(provider) DO UPDATE SET secret=excluded.secret,updated_at=excluded.updated_at",
      )
      .run(
        `config:${name}`,
        encrypt(JSON.stringify(parsed), this.config.key, `config:${name}`),
        Date.now(),
      );
    this.audit(actor.id, "integration.configure", name);
    return { configured: true };
  }
  notify(event: string, text: string, id: string) {
    for (const guild of this.list("guild"))
      if (guild.data.enabled && guild.data.events.includes(event as never)) {
        this.effect(`discord:${id}:${guild.id}`, "discord.send", {
          event,
          guildId: guild.data.guildId,
          channelId: guild.data.channelId,
          text: text.slice(0, 1800),
        });
      }
  }

  workQueue(
    view: "uncertain-jobs" | "pending-redemptions",
    input: { cursor?: string; limit?: string } = {},
  ) {
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .parse(input.limit ?? 50);
    let cursor: { view: string; at: number; id: string } | undefined;
    if (input.cursor) {
      try {
        z.string()
          .max(2048)
          .regex(/^[A-Za-z0-9_-]+$/)
          .parse(input.cursor);
        cursor = z
          .object({
            view: z.literal(view),
            at: z.number().int().nonnegative(),
            id: z.string().min(1).max(1024),
          })
          .strict()
          .parse(JSON.parse(Buffer.from(input.cursor, "base64url").toString()));
      } catch {
        throw new AppError("invalid_work_queue_cursor", 400);
      }
    }
    const selection =
      view === "uncertain-jobs"
        ? "id,kind,status,attempts,last_error AS error,created_at AS createdAt"
        : "id,viewer,reward,cost,status,created_at AS createdAt,(SELECT name FROM viewers WHERE id=redemptions.viewer) AS viewerName,(SELECT json_extract(data,'$.name') FROM documents WHERE id=redemptions.reward) AS rewardName";
    const source =
      view === "uncertain-jobs"
        ? "jobs WHERE status='uncertain'"
        : "redemptions WHERE status='pending'";
    const rows = this.db
      .prepare(
        `SELECT ${selection} FROM ${source}
      ${cursor ? "AND (created_at < ? OR (created_at = ? AND id < ?))" : ""}
      ORDER BY created_at DESC,id DESC LIMIT ?`,
      )
      .all(...(cursor ? [cursor.at, cursor.at, cursor.id] : []), limit + 1) as (Record<
      string,
      unknown
    > & { id: string; createdAt: number })[];
    const items = rows.slice(0, limit),
      last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > limit && last
          ? Buffer.from(JSON.stringify({ view, at: last.createdAt, id: last.id })).toString(
              "base64url",
            )
          : null,
    };
  }

  /** Bounded lookup of observed viewers for operator pickers. */
  searchViewers(query: unknown, limit = 20) {
    const text = z
      .string()
      .trim()
      .max(50)
      .parse(query ?? "");
    const pattern = `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
    return this.db
      .prepare(
        `SELECT v.id,v.name,v.role,v.last_seen AS lastSeen,v.messages,v.watch_minutes AS watchMinutes,
          coalesce((SELECT sum(amount) FROM ledger l WHERE l.viewer=v.id),0) AS balance
        FROM viewers v WHERE v.name!=? AND (v.name LIKE ? ESCAPE '\\' OR v.id=?)
        ORDER BY v.last_seen DESC LIMIT ?`,
      )
      .all(ERASED_VIEWER, pattern, text, limit);
  }

  /** Read-only view of each timer's persisted schedule and latest queued send. */
  timerSchedules() {
    const chat = Number(this.repository.setting("chat_count") ?? 0);
    const latest = this.db.prepare(
      "SELECT status,created_at AS at,last_error AS error FROM jobs WHERE id>=? AND id<? ORDER BY created_at DESC LIMIT 1",
    );
    return this.list("timer").map((timer) => {
      const schedule = JSON.parse(this.repository.setting(`timer:${timer.id}`) ?? "null") as {
        next: number;
        count: number;
      } | null;
      return {
        id: timer.id,
        next: schedule?.next ?? null,
        waitingMessages: Math.max(
          0,
          timer.data.minMessages - (schedule ? chat - schedule.count : 0),
        ),
        lastSent: latest.get(`timer:${timer.id}:`, `timer:${timer.id};`) ?? null,
      };
    });
  }

  /** Only an owner session (not an owner-issued API token) may see account usernames. */
  private static ownerView(actor?: Actor) {
    return !actor || (actor.role === "owner" && !actor.capabilityId);
  }

  /** Display labels for audit actors without widening account visibility. */
  private auditActors(actor?: Actor) {
    const accounts = new Map(
      (
        this.db.prepare("SELECT id,username,role FROM accounts").all() as {
          id: string;
          username: string;
          role: string;
        }[]
      ).map((row) => [row.id, row]),
    );
    const owner = State.ownerView(actor);
    const roles: Record<string, string> = {
      owner: "the owner",
      admin: "an admin",
      moderator: "a moderator",
      readonly: "a read-only operator",
    };
    return (id: string) => {
      const account = accounts.get(id);
      if (account) return owner ? account.username : (roles[account.role] ?? "an operator");
      if (id === "worker") return "KekBot";
      if (id === "host") return "the host administrator";
      if (id.startsWith("discord:")) return "a Discord moderator";
      const viewer = id.startsWith("kick:") ? id.slice(5) : id;
      return /^\d{1,24}$/.test(viewer) ? (this.viewerName(viewer) ?? "a viewer") : "someone";
    };
  }

  snapshot(actor?: Actor) {
    let notesAllowed = !actor;
    if (actor) {
      try {
        this.assertActor(actor, "moderate");
        notesAllowed = true;
      } catch {
        notesAllowed = false;
      }
    }
    const actorLabel = this.auditActors(actor);
    const ownerView = State.ownerView(actor);
    return {
      settings: this.settings,
      documents: (Object.keys(configSchemas) as Kind[])
        .filter((kind) => kind !== "note" || notesAllowed)
        .flatMap((kind) => this.list(kind)),
      jobs: this.db
        .prepare(
          "SELECT id,kind,status,attempts,last_error AS error,created_at AS createdAt FROM jobs ORDER BY created_at DESC LIMIT 100",
        )
        .all(),
      uncertainJobs: this.workQueue("uncertain-jobs"),
      audit: (
        this.db
          .prepare(
            `SELECT a.*,
              (SELECT json_extract(data,'$.name') FROM documents WHERE id=a.target AND (kind!='note' OR ?)) AS targetName,
              (SELECT title FROM media WHERE id=a.target) AS mediaTitle,
              (SELECT name FROM viewers WHERE id=a.target) AS viewerName
            FROM audit a ORDER BY a.id DESC LIMIT 100`,
          )
          // Moderator note names stay behind moderation authority, like the notes themselves.
          .all(notesAllowed ? 1 : 0) as (Record<string, unknown> & { actor: string })[]
      ).map((row) => ({ ...row, actorLabel: actorLabel(row.actor) })),
      media: this.db
        .prepare(
          `SELECT m.*,coalesce(v.name,CASE WHEN ? THEN a.username WHEN a.role='owner' THEN 'the owner'
            WHEN a.role='admin' THEN 'an admin' WHEN a.role='moderator' THEN 'a moderator'
            WHEN a.role IS NOT NULL THEN 'an operator' END) AS requesterName
          FROM media m LEFT JOIN viewers v ON v.id=m.requester LEFT JOIN accounts a ON a.id=m.requester
          WHERE m.status IN ('validating','pending','approved','playing') ORDER BY m.position,m.created_at,m.id`,
        )
        // Local account usernames are owner-visible only; other readers see the role.
        .all(ownerView ? 1 : 0),
      player: JSON.parse(
        this.repository.setting("player") ??
          '{"state":"paused","volume":50,"current":null,"version":0}',
      ),
      viewers: this.db.prepare("SELECT * FROM viewers ORDER BY last_seen DESC LIMIT 100").all(),
      leaderboard: this.db
        .prepare(
          "SELECT l.viewer,v.name,sum(l.amount) AS balance FROM ledger l LEFT JOIN viewers v ON v.id=l.viewer GROUP BY l.viewer ORDER BY balance DESC LIMIT 100",
        )
        .all(),
      redemptions: this.db
        .prepare(
          "SELECT r.*,v.name AS viewerName,json_extract(d.data,'$.name') AS rewardName FROM redemptions r LEFT JOIN viewers v ON v.id=r.viewer LEFT JOIN documents d ON d.id=r.reward ORDER BY r.created_at DESC LIMIT 100",
        )
        .all(),
      pendingRedemptions: this.workQueue("pending-redemptions"),
      incidents: this.db
        .prepare(
          `SELECT i.*,j.status AS outcome,j.last_error AS error,v.name AS viewerName,
            CASE WHEN i.rule='manual' THEN NULL ELSE coalesce(json_extract(d.data,'$.name'),i.reason) END AS ruleName,
            CASE WHEN ? THEN json_extract(r.payload,'$.message_id') END AS messageId
          FROM incidents i LEFT JOIN jobs j ON j.id=i.job_id LEFT JOIN viewers v ON v.id=i.viewer
          LEFT JOIN documents d ON d.id=i.rule
          LEFT JOIN receipts r ON i.id GLOB 'moderation:*' AND r.id=substr(i.id,12)
          ORDER BY i.at DESC LIMIT 100`,
        )
        // Message references are for acting on chat, so only moderation authority receives them.
        .all(notesAllowed ? 1 : 0),
      // Recent inspected chat lets moderators act on a message; it stays behind moderation authority.
      recentChat: notesAllowed
        ? this.db
            .prepare(
              `SELECT r.id,r.received_at AS at,json_extract(r.payload,'$.message_id') AS messageId,
                json_extract(r.payload,'$.sender.user_id') AS userId,
                coalesce(json_extract(r.payload,'$.sender.username'),'Viewer') AS name,
                json_extract(r.payload,'$.content') AS text,
                EXISTS(SELECT 1 FROM incidents i WHERE i.id='moderation:'||r.id) AS flagged,
                EXISTS(SELECT 1 FROM settings s WHERE s.key='hidden_chat:'||json_extract(r.payload,'$.message_id')) AS removed
              FROM receipts r WHERE r.event_type='chat.message.sent' AND r.payload IS NOT NULL
              ORDER BY r.received_at DESC LIMIT 50`,
            )
            .all()
        : [],
      raffleWinners: this.list("raffle").flatMap((raffle) =>
        raffle.data.winners.map((viewer) => ({
          raffle: raffle.id,
          viewer,
          name: this.viewerName(viewer) ?? null,
        })),
      ),
      timers: this.timerSchedules(),
      stream: {
        live: this.repository.setting("stream_is_live") ?? "unavailable",
        startedAt: this.repository.setting("stream_started_at") || null,
      },
      incidentMode: (() => {
        const mode = JSON.parse(this.repository.setting("incident_mode") ?? "null");
        return mode?.endsAt > Date.now() ? mode : null;
      })(),
      activities: this.db
        .prepare(
          "SELECT activity,choice,count(*) AS count FROM participation GROUP BY activity,choice",
        )
        .all(),
      diagnostics: {
        ...this.repository.diagnostics(),
        version: APP_VERSION,
        schemaVersion: this.repository.setting("schema_version"),
        stream: this.repository.setting("stream_is_live") ?? "unavailable",
        callbacksConfigured: Boolean(this.config.publicUrl),
        kickRepairError: this.repository.setting("kick_repair_error") || null,
        streamSampleError: this.repository.setting("stream_sample_error") || null,
        diskFreeBytes: (() => {
          try {
            const disk = statfsSync(this.config.directory);
            return disk.bavail * disk.bsize;
          } catch {
            return null;
          }
        })(),
      },
      mode: this.config.mode,
      integrations: {
        kick: Boolean(this.secret("kick") || this.config.clientId),
        discord: Boolean(this.secret("discord")),
        youtube: Boolean(this.secret("youtube")),
      },
    };
  }
}
