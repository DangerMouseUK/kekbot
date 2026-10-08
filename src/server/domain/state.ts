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
    this.assertActor(
      actor,
      kind === "settings" || kind === "guild"
        ? "integrations"
        : kind === "note"
          ? "moderate"
          : "configure",
    );
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
      audit: this.db.prepare("SELECT * FROM audit ORDER BY id DESC LIMIT 100").all(),
      media: this.db
        .prepare(
          "SELECT * FROM media WHERE status IN ('validating','pending','approved','playing') ORDER BY position,created_at,id",
        )
        .all(),
      player: JSON.parse(
        this.repository.setting("player") ??
          '{"state":"paused","volume":50,"current":null,"version":0}',
      ),
      viewers: this.db.prepare("SELECT * FROM viewers ORDER BY last_seen DESC LIMIT 100").all(),
      leaderboard: this.db
        .prepare(
          "SELECT viewer,sum(amount) AS balance FROM ledger GROUP BY viewer ORDER BY balance DESC LIMIT 100",
        )
        .all(),
      redemptions: this.db
        .prepare("SELECT * FROM redemptions ORDER BY created_at DESC LIMIT 100")
        .all(),
      incidents: this.db
        .prepare(
          "SELECT i.*,j.status AS outcome,j.last_error AS error FROM incidents i LEFT JOIN jobs j ON j.id=i.job_id ORDER BY i.at DESC LIMIT 100",
        )
        .all(),
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
