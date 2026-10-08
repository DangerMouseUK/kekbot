import { z } from "zod";
import { unlinkSync, statfsSync } from "node:fs";
import { join } from "node:path";
import type { Actor } from "../auth.ts";
import { AppError } from "../errors.ts";
import { configSchemas, type Kind } from "./catalog.ts";
import { State } from "./state.ts";
import { APP_VERSION } from "../version.ts";
import { PresentationService, inspectAsset } from "./presentation.ts";
import { KickService } from "../providers/kick.ts";

const portableKinds = [
  "command",
  "timer",
  "alert",
  "widget",
  "rule",
  "goal",
  "reward",
  "settings",
] as const;
const bundleSchema = z
  .object({
    format: z.literal("kekbot-config"),
    version: z.literal(1),
    documents: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
            kind: z.enum(portableKinds),
            data: z.record(z.string(), z.unknown()),
          })
          .strict(),
      )
      .max(2000),
    assets: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-f0-9-]{36}\.(png|jpg|gif|webp|wav|ogg|mp3)$/),
            name: z.string().max(100),
            base64: z.string().max(12 * 1024 * 1024),
          })
          .strict(),
      )
      .max(100)
      .default([]),
  })
  .strict();
export function csv(rows: Record<string, unknown>[]) {
  const columns = Object.keys(rows[0] ?? {});
  const escape = (value: unknown) => {
    let str = String(value ?? "");
    if (/^[=+\-@\t\r\n]/.test(str)) str = `'${str}`;
    return `"${str.replaceAll('"', '""')}"`;
  };
  return [columns, ...rows.map((row) => columns.map((col) => row[col]))]
    .map((row) => row.map(escape).join(","))
    .join("\r\n");
}

export class OperationsService {
  readonly state: State;
  constructor(state: State) {
    this.state = state;
  }
  exportConfig(actor: Actor) {
    this.state.assertActor(actor, "maintenance");
    const documents = portableKinds.flatMap((kind) =>
      this.state.list(kind).map((doc) => ({ id: doc.id, kind, data: doc.data })),
    );
    const ids = [
      ...new Set(
        this.state
          .list("alert")
          .flatMap((doc) => [doc.data.image, doc.data.sound])
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const presentation = new PresentationService(this.state);
    const bundle = {
      format: "kekbot-config",
      version: 1,
      documents,
      assets: ids.map((id) => ({
        id,
        name: (JSON.parse(this.state.repository.setting(`asset:${id}`)!) as { name: string }).name,
        base64: presentation.asset(id).bytes.toString("base64"),
      })),
    };
    if (Buffer.byteLength(JSON.stringify(bundle)) > 12 * 1024 * 1024)
      throw new AppError("config_bundle_too_large_use_backup_or_split_assets", 413);
    return bundle;
  }

  importConfig(actor: Actor, input: unknown, mode: "merge" | "replace", apply = false) {
    this.state.assertActor(actor, "maintenance");
    if (Buffer.byteLength(JSON.stringify(input)) > 12 * 1024 * 1024)
      throw new AppError("import_too_large", 413);
    const bundle = bundleSchema.parse(input);
    const presentation = new PresentationService(this.state),
      assets = new Map<string, (typeof bundle.assets)[number]>();
    for (const asset of bundle.assets) {
      if (assets.has(asset.id)) throw new AppError("duplicate_import_asset", 400);
      const inspected = inspectAsset(asset.base64);
      if (!asset.id.endsWith(`.${inspected.format}`))
        throw new AppError("import_asset_type_mismatch", 400);
      if (
        this.state.repository.setting(`asset:${asset.id}`) &&
        !presentation.asset(asset.id).bytes.equals(inspected.bytes)
      )
        throw new AppError("import_asset_conflict", 409);
      assets.set(asset.id, asset);
    }
    const ids = new Set<string>();
    const documents = bundle.documents.map((doc) => {
      if (ids.has(doc.id)) throw new AppError("duplicate_import_id", 400);
      ids.add(doc.id);
      const parsed = configSchemas[doc.kind].strict().parse(doc.data);
      if (doc.kind === "alert")
        for (const field of ["image", "sound"] as const) {
          const asset = (parsed as z.infer<typeof configSchemas.alert>)[field];
          if (asset && !this.state.repository.setting(`asset:${asset}`) && !assets.has(asset))
            throw new AppError("import_asset_missing", 409);
          if (
            asset &&
            !(field === "image" ? /\.(png|jpg|gif|webp)$/ : /\.(wav|ogg|mp3)$/).test(asset)
          )
            throw new AppError("import_asset_type_mismatch", 400);
        }
      return { ...doc, data: parsed };
    });
    const conflicts = documents
      .filter((doc) => this.state.document(doc.id))
      .map((doc) => ({
        id: doc.id,
        kind: doc.kind,
        resolution: mode === "merge" ? "skip" : "replace",
      }));
    for (const doc of documents) {
      const existing = this.state.document(doc.id);
      if (existing && existing.kind !== doc.kind)
        throw new AppError("import_id_conflicts_with_other_state", 409);
      if (doc.kind === "settings" && doc.id !== "instance")
        throw new AppError("import_settings_id_invalid", 400);
    }
    // Validate the resulting command namespace during dry run, before any deletion.
    const commands = mode === "merge" ? this.state.list("command").map((doc) => doc.data) : [];
    for (const doc of documents)
      if (doc.kind === "command" && !(mode === "merge" && this.state.document(doc.id)))
        commands.push(configSchemas.command.parse(doc.data));
    const reserved = new Set([
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
    ]);
    for (const command of commands)
      for (const name of [command.trigger, ...command.aliases]) {
        if (reserved.has(name)) throw new AppError("command_trigger_conflict", 409);
        reserved.add(name);
      }
    const preview = {
      valid: true,
      mode,
      create: documents.length - conflicts.length,
      conflicts,
      assets: bundle.assets.map((asset) => ({
        id: asset.id,
        resolution: this.state.repository.setting(`asset:${asset.id}`)
          ? "reuse"
          : "upload_and_remap",
      })),
      replaceRemoves:
        mode === "replace"
          ? portableKinds
              .flatMap((kind) => this.state.list(kind))
              .filter((doc) => !ids.has(doc.id))
              .map((doc) => doc.id)
          : [],
    };
    if (!apply) return { ...preview, preview: true };
    const created: string[] = [];
    try {
      this.state.db
        .transaction(() => {
          const mapping = new Map<string, string>();
          for (const asset of bundle.assets) {
            if (this.state.repository.setting(`asset:${asset.id}`)) mapping.set(asset.id, asset.id);
            else {
              const uploaded = presentation.upload(actor, asset.name, asset.base64);
              created.push(uploaded.id);
              mapping.set(asset.id, uploaded.id);
            }
          }
          const previousVersions = new Map(
            portableKinds
              .flatMap((kind) => this.state.list(kind))
              .map((doc) => [doc.id, doc.version]),
          );
          if (mode === "replace")
            for (const kind of portableKinds)
              this.state.db.prepare("DELETE FROM documents WHERE kind=?").run(kind);
          for (const doc of documents) {
            const existing = this.state.document(doc.id);
            if (mode === "merge" && existing) continue;
            if (existing && existing.kind !== doc.kind)
              throw new AppError("import_id_conflicts_with_nonportable_state", 409);
            const data: Record<string, unknown> = { ...doc.data };
            if (doc.kind === "alert")
              for (const field of ["image", "sound"])
                if (typeof data[field] === "string")
                  data[field] = mapping.get(data[field]) ?? data[field];
            this.state.save(actor, doc.kind, doc.id, data, existing?.version);
            // Rebuild the namespace atomically, but never reuse a retained document's version.
            const previousVersion = previousVersions.get(doc.id);
            if (mode === "replace" && previousVersion !== undefined)
              this.state.db
                .prepare("UPDATE documents SET version=? WHERE id=?")
                .run(previousVersion + 1, doc.id);
          }
          this.state.audit(actor.id, "configuration.import", mode);
        })
        .immediate();
    } catch (error) {
      for (const id of created) {
        try {
          unlinkSync(join(/* turbopackIgnore: true */ this.state.config.assets, id));
        } catch {
          /* harmless unreferenced file is included in the next host inspection */
        }
      }
      throw error;
    }
    return { ...preview, applied: true };
  }

  analytics(from: number, to: number, stream?: string) {
    z.number().int().nonnegative().parse(from);
    z.number().int().min(from).parse(to);
    const history = JSON.parse(this.state.repository.setting("stream_history") ?? "[]") as {
      id: string;
      start: number;
      end: number | null;
    }[];
    const selected = stream ? history.find((item) => item.id === stream) : undefined;
    if (stream && !selected) throw new AppError("stream_not_observed", 404);
    const start = selected ? Math.max(from, selected.start) : from;
    const end = selected ? Math.min(to, selected.end ?? Date.now()) : to;
    const rows = this.state.db
      .prepare(
        "SELECT strftime('%Y-%m-%d',at/1000,'unixepoch') AS day,metric,CASE WHEN metric='viewers.sample' THEN avg(value) ELSE sum(value) END AS value,count(*) AS samples,min(value) AS minimum,max(value) AS maximum FROM observations WHERE at>=? AND at<=? AND metric!='worker.minute' GROUP BY day,metric ORDER BY day,metric",
      )
      .all(start, end);
    const coverage = this.state.db
      .prepare(
        "SELECT min(at) AS firstObserved,max(at) AS lastObserved,count(*) AS workerMinutes FROM observations WHERE metric='worker.minute' AND at>=? AND at<=?",
      )
      .get(start, end);
    const minutes = this.state.db
      .prepare(
        "SELECT at FROM observations WHERE metric='worker.minute' AND at>=? AND at<=? ORDER BY at",
      )
      .all(start, end) as { at: number }[];
    const gaps: { from: number; to: number }[] = [];
    let previous = start;
    for (const minute of minutes) {
      if (minute.at - previous > 120000) gaps.push({ from: previous, to: minute.at });
      previous = minute.at;
    }
    if (end - previous > 120000) gaps.push({ from: previous, to: end });
    const summaries = history
      .filter((item) => item.start <= end && (item.end ?? Date.now()) >= start)
      .slice(-100)
      .map((item) => ({
        ...item,
        metrics: this.state.db
          .prepare(
            "SELECT metric,CASE WHEN metric='viewers.sample' THEN avg(value) ELSE sum(value) END AS value FROM observations WHERE at>=? AND at<=? AND metric!='worker.minute' GROUP BY metric",
          )
          .all(Math.max(start, item.start), Math.min(end, item.end ?? Date.now())),
      }));
    return {
      from: start,
      to: end,
      streams: history,
      summaries,
      rows,
      coverage: { ...Object(coverage), gaps },
      note: "Observed events only. Viewer samples report a mean with sample count/minimum/maximum. Gaps mark missing worker observations; worker presence does not prove complete provider delivery. Estimated watchtime uses recent chat activity.",
    };
  }

  eraseViewer(actor: Actor, viewer: string) {
    this.state.assertActor(actor, "maintenance");
    z.string()
      .regex(/^\d{1,24}$/)
      .parse(viewer);
    return this.state.db
      .transaction(() => {
        this.state.repository.scrubViewer(viewer);
        this.state.db
          .prepare("UPDATE viewers SET name='Erased viewer',messages=0,watch_minutes=0 WHERE id=?")
          .run(viewer);
        this.state.db
          .prepare("DELETE FROM settings WHERE key=? OR key=? OR key LIKE ? OR key LIKE ?")
          .run(
            `chat_window:${viewer}`,
            `request:${viewer}`,
            `utility:${viewer}:%`,
            `cooldown:%:${viewer}`,
          );
        for (const note of this.state.list("note"))
          if (note.data.viewer === viewer)
            this.state.db.prepare("DELETE FROM documents WHERE id=?").run(note.id);
        this.state.audit(actor.id, "privacy.erase_viewer", viewer);
        return {
          erased: true,
          retained:
            "Economic ledger, redemptions, queue decisions, votes and audit identifiers remain. Uncertain delivery payloads stay encrypted until owner reconciliation; independent backups are unchanged.",
        };
      })
      .immediate();
  }
  viewerExport(actor: Actor, viewer: string) {
    this.state.assertActor(actor, "maintenance");
    z.string()
      .regex(/^\d{1,24}$/)
      .parse(viewer);
    return {
      viewer: this.state.db.prepare("SELECT * FROM viewers WHERE id=?").get(viewer) ?? null,
      ledger: this.state.db.prepare("SELECT * FROM ledger WHERE viewer=? ORDER BY at").all(viewer),
      redemptions: this.state.db.prepare("SELECT * FROM redemptions WHERE viewer=?").all(viewer),
      media: this.state.db.prepare("SELECT * FROM media WHERE requester=?").all(viewer),
      participation: this.state.db
        .prepare("SELECT * FROM participation WHERE viewer=?")
        .all(viewer),
      chat: this.state.db
        .prepare(
          "SELECT received_at,payload FROM receipts WHERE event_type='chat.message.sent' AND json_extract(payload,'$.sender.user_id')=?",
        )
        .all(Number(viewer)),
    };
  }
  support(actor: Actor) {
    this.state.assertActor(actor, "maintenance");
    const diagnostics = this.state.repository.diagnostics();
    const kick = new KickService(this.state.config, this.state.repository).status();
    const player = JSON.parse(this.state.repository.setting("player") ?? '{"state":"paused"}');
    let diskFreeBytes: number | null = null;
    try {
      const disk = statfsSync(this.state.config.directory);
      diskFreeBytes = disk.bavail * disk.bsize;
    } catch {
      /* unavailable is distinct from zero */
    }
    return {
      format: "kekbot-support",
      version: 1,
      applicationVersion: APP_VERSION,
      mode: this.state.config.mode,
      schema: this.state.repository.setting("schema_version"),
      jobs: diagnostics.jobs,
      heartbeat: diagnostics.workerHeartbeat,
      error: diagnostics.lastError,
      lastEventAt:
        (diagnostics.lastVerifiedEvent as { receivedAt?: number } | null)?.receivedAt ?? null,
      moduleCounts: (Object.keys(configSchemas) as Kind[]).map((kind) => ({
        kind,
        count: this.state.list(kind).length,
      })),
      kick: {
        authorized: kick.authorized,
        scopes: kick.scopes ?? [],
        error: kick.error,
        refreshedAt: kick.lastRefreshAt ?? null,
        subscriptionsCheckedAt: kick.subscriptionsCheckedAt ?? null,
      },
      callbacksConfigured: Boolean(this.state.config.publicUrl),
      diskFreeBytes,
      player: {
        state: player.state,
        connected: Number(player.leaseUntil ?? 0) > Date.now(),
        error: player.error ?? null,
      },
      repairError: this.state.repository.setting("kick_repair_error") || null,
      streamSampleError: this.state.repository.setting("stream_sample_error") || null,
      retention: {
        chatDays: this.state.settings.chatDays,
        receiptDays: this.state.settings.receiptDays,
        summaryDays: this.state.settings.summaryDays,
        auditDays: this.state.settings.auditDays,
      },
    };
  }

  retain(now = Date.now()) {
    const settings = this.state.settings;
    this.state.db
      .transaction(() => {
        this.state.repository.retain(now);
        this.state.db.prepare("DELETE FROM sessions WHERE expires_at<?").run(now);
        this.state.db.prepare("DELETE FROM invitations WHERE expires_at<?").run(now - 86400000);
        this.state.db
          .prepare(
            "DELETE FROM live_events WHERE id < coalesce((SELECT id FROM live_events ORDER BY id DESC LIMIT 1 OFFSET 999),0)",
          )
          .run();
        this.state.db
          .prepare("DELETE FROM observations WHERE at<?")
          .run(now - settings.summaryDays * 86400000);
        this.state.db
          .prepare("DELETE FROM audit WHERE at<?")
          .run(now - settings.auditDays * 86400000);
        this.state.db
          .prepare("DELETE FROM incidents WHERE at<?")
          .run(now - settings.auditDays * 86400000);
        this.state.db
          .prepare(
            "DELETE FROM settings WHERE key LIKE 'chat_window:%' AND coalesce(json_extract(value,'$[#-1].at'),0)<?",
          )
          .run(now - 600000);
      })
      .immediate();
  }
}
