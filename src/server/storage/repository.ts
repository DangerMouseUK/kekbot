import { and, eq, lt } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { jobs, oauthStates, receipts, settings } from "./schema.ts";
import type { Store } from "./database.ts";
import { AppError } from "../errors.ts";
import { encrypt } from "../crypto.ts";

export type Job = typeof jobs.$inferSelect;
export type JobKind = Job["kind"];

export class Repository {
  readonly store: Store;
  constructor(store: Store) {
    this.store = store;
  }

  private viewers: string[] = [];

  private policy() {
    return JSON.parse(
      (
        this.store.sqlite.prepare("SELECT data FROM documents WHERE id='instance'").get() as
          { data: string } | undefined
      )?.data ?? "{}",
    ) as { chatDays?: number; receiptDays?: number; auditDays?: number };
  }

  setting(key: string): string | undefined {
    return (
      this.store.sqlite
        .prepare(
          "SELECT value FROM settings WHERE key=? AND (expires_at IS NULL OR expires_at>? OR EXISTS(SELECT 1 FROM jobs WHERE jobs.id=settings.job_id AND status IN ('pending','running','uncertain')))",
        )
        .get(key, Date.now()) as { value: string } | undefined
    )?.value;
  }

  set(key: string, value: string) {
    const { receiptDays = 30 } = this.policy();
    const expiry = this.temporaryExpiry(key, value, receiptDays);
    const jobId = key.startsWith("discord_result:") ? `discord:${key.slice(15)}` : null;
    this.store.orm
      .insert(settings)
      .values({ key, value, expiresAt: expiry, jobId })
      .onConflictDoUpdate({ target: settings.key, set: { value, expiresAt: expiry, jobId } })
      .run();
  }

  private temporaryExpiry(key: string, value: string, receiptDays: number): number | null {
    if (key.startsWith("login:")) return (JSON.parse(value) as { until: number }).until;
    if (key.startsWith("cooldown:")) return Number(value) + 86400000;
    if (key.startsWith("utility:")) return Number(value) + 5000;
    if (key.startsWith("request:")) return Number(value) + 3600000;
    if (key.startsWith("sent:")) return Number(value) + receiptDays * 86400000;
    if (key.startsWith("discord_result:")) return Date.now() + receiptDays * 86400000;
    if (key.startsWith("chat_window:")) {
      const history = JSON.parse(value) as { at: number }[];
      return (history.at(-1)?.at ?? 0) + 600000;
    }
    return null;
  }

  withViewers<T>(ids: string[], operation: () => T): T {
    const previous = this.viewers;
    this.viewers = [...new Set([...previous, ...ids])];
    try {
      return operation();
    } finally {
      this.viewers = previous;
    }
  }

  static viewerIds(payload: unknown): string[] {
    const value = Object(payload);
    return [
      ...new Set(
        [
          value.sender?.user_id,
          value.follower?.user_id,
          value.subscriber?.user_id,
          value.gifter?.user_id,
          ...(Array.isArray(value.giftees)
            ? value.giftees.map((user: { user_id?: unknown } | null) => user?.user_id)
            : []),
          value.userId,
          value.requester,
          value.viewer,
        ]
          .filter((id) => id !== undefined && /^\d{1,24}$/.test(String(id)))
          .map(String),
      ),
    ];
  }

  enqueue(id: string, kind: JobKind, payload: unknown, dueAt = Date.now()) {
    const now = Date.now(),
      { chatDays = 7 } = this.policy();
    const viewerIds = [...new Set([...this.viewers, ...Repository.viewerIds(payload)])];
    return (
      this.store.orm
        .insert(jobs)
        .values({
          id,
          kind,
          payload: JSON.stringify(payload),
          dueAt,
          createdAt: now,
          payloadExpiresAt: now + chatDays * 86400000,
          viewerIds: JSON.stringify(viewerIds),
        })
        .onConflictDoNothing()
        .run().changes === 1
    );
  }

  acceptReceipt(id: string, eventType: string, payload: unknown, now = Date.now()): boolean {
    return this.store.sqlite
      .transaction(() => {
        if (
          this.store.orm.select({ id: receipts.id }).from(receipts).where(eq(receipts.id, id)).get()
        )
          return false;
        const count = this.store.sqlite
          .prepare("SELECT count(*) AS n FROM jobs WHERE status IN ('pending','running')")
          .get() as { n: number };
        if (count.n >= 10000) throw new AppError("job_backlog_full", 503);
        this.store.orm
          .insert(receipts)
          .values({ id, eventType, payload: JSON.stringify(payload), receivedAt: now })
          .run();
        this.withViewers(Repository.viewerIds(payload), () =>
          this.enqueue(`event:${id}`, "kick.event", { receiptId: id }, now),
        );
        return true;
      })
      .immediate();
  }

  claim(now = Date.now(), leaseMs = 30000): Job | undefined {
    return this.store.sqlite
      .transaction(() => {
        // A crashed outbound send may already have reached Kick. Never resend it automatically.
        this.store.sqlite
          .prepare(
            "UPDATE jobs SET status='uncertain',last_error='worker_lost_during_delivery',lease_owner=NULL,lease_until=NULL WHERE kind IN ('kick.reply','kick.action','discord.send','discord.interaction') AND status='running' AND lease_until<=?",
          )
          .run(now);
        this.store.sqlite
          .prepare(
            "UPDATE jobs SET status='pending',lease_owner=NULL,lease_until=NULL WHERE kind NOT IN ('kick.reply','kick.action','discord.send','discord.interaction') AND status='running' AND lease_until<=?",
          )
          .run(now);
        this.protectUncertain();
        const row = this.store.sqlite
          .prepare(
            "SELECT id FROM jobs WHERE status='pending' AND due_at<=? ORDER BY due_at,created_at,id LIMIT 1",
          )
          .get(now) as { id: string } | undefined;
        if (!row) return undefined;
        this.store.orm
          .update(jobs)
          .set({ status: "running", leaseUntil: now + leaseMs, leaseOwner: randomUUID() })
          .where(eq(jobs.id, row.id))
          .run();
        return this.store.orm.select().from(jobs).where(eq(jobs.id, row.id)).get();
      })
      .immediate();
  }

  finish(job: Job, status: Job["status"], error: string | null = null, delay = 0) {
    if (!job.leaseOwner) throw new AppError("job_without_lease", 500);
    const scrub = ["succeeded", "failed"].includes(status) && (this.policy().chatDays ?? 7) === 0;
    const updated = this.store.orm
      .update(jobs)
      .set({
        status,
        ...(status === "uncertain"
          ? {
              payload: encrypt(job.payload, this.store.key, `job:${job.id}`),
              payloadState: "encrypted",
            }
          : {}),
        ...(scrub ? { payload: "{}", payloadState: "scrubbed" } : {}),
        lastError: error,
        dueAt: Date.now() + delay,
        attempts: job.attempts + 1,
        leaseUntil: null,
        leaseOwner: null,
      })
      .where(
        and(eq(jobs.id, job.id), eq(jobs.status, "running"), eq(jobs.leaseOwner, job.leaseOwner)),
      )
      .run();
    if (updated.changes !== 1) throw new AppError("job_lease_lost", 503);
  }

  acquireLease(owner: string, now = Date.now()) {
    const result = this.store.sqlite
      .prepare(
        "INSERT INTO leases(name,owner,expires_at) VALUES('instance',?,?) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE leases.expires_at<=? OR leases.owner=excluded.owner",
      )
      .run(owner, now + 30000, now);
    if (!result.changes) throw new AppError("instance_already_running_or_in_maintenance", 503);
  }
  releaseLease(owner: string) {
    this.store.sqlite.prepare("DELETE FROM leases WHERE name='instance' AND owner=?").run(owner);
  }

  private protectUncertain() {
    const rows = this.store.sqlite
      .prepare("SELECT id,payload FROM jobs WHERE status='uncertain' AND payload_state='plain'")
      .all() as { id: string; payload: string }[];
    const update = this.store.sqlite.prepare(
      "UPDATE jobs SET payload=?,payload_state='encrypted' WHERE id=?",
    );
    for (const row of rows)
      update.run(encrypt(row.payload, this.store.key, `job:${row.id}`), row.id);
  }

  scrubViewer(viewer: string) {
    const receiptMatch = `(CAST(json_extract(r.payload,'$.sender.user_id') AS TEXT)=@viewer
      OR CAST(json_extract(r.payload,'$.follower.user_id') AS TEXT)=@viewer
      OR CAST(json_extract(r.payload,'$.subscriber.user_id') AS TEXT)=@viewer
      OR CAST(json_extract(r.payload,'$.gifter.user_id') AS TEXT)=@viewer
      OR EXISTS(SELECT 1 FROM json_each(r.payload,'$.giftees') AS recipient
        WHERE CAST(json_extract(recipient.value,'$.user_id') AS TEXT)=@viewer))`;
    // Older schema-3 jobs omitted gift recipients. Recover associations from retained receipts
    // before either checking pending work or removing the only remaining source payload.
    this.store.sqlite
      .prepare(
        `WITH matched_receipts AS MATERIALIZED (SELECT r.id FROM receipts r WHERE ${receiptMatch})
      UPDATE jobs SET viewer_ids=json_insert(viewer_ids,'$[#]',@viewer)
      WHERE NOT EXISTS(SELECT 1 FROM json_each(jobs.viewer_ids) WHERE value=@viewer)
      AND EXISTS(SELECT 1 FROM matched_receipts r WHERE (
        jobs.id='event:'||r.id OR jobs.id='reply:'||r.id OR jobs.id='action:moderation:'||r.id
        OR (jobs.kind='discord.send' AND (
          substr(jobs.id,1,length('discord:'||r.id||':'))='discord:'||r.id||':'
          OR substr(jobs.id,1,length('discord:moderation:'||r.id||':'))='discord:moderation:'||r.id||':'
          OR (substr(jobs.id,1,13)='discord:goal:' AND instr(substr(jobs.id,14),':'||r.id||':')>0)
        ))))`,
      )
      .run({ viewer });
    const match = "EXISTS(SELECT 1 FROM json_each(jobs.viewer_ids) WHERE value=?)";
    if (
      this.store.sqlite
        .prepare(`SELECT 1 FROM jobs WHERE status IN ('pending','running') AND ${match} LIMIT 1`)
        .get(viewer)
    ) {
      throw new AppError("privacy_processing_pending_retry_after_jobs_complete", 409);
    }
    this.store.sqlite
      .prepare(
        `UPDATE jobs SET payload='{}',payload_state='scrubbed' WHERE status IN ('succeeded','failed') AND ${match}`,
      )
      .run(viewer);
    this.protectUncertain();
    this.store.sqlite
      .prepare(`UPDATE receipts AS r SET payload=NULL WHERE ${receiptMatch}`)
      .run({ viewer });
  }

  retain(now = Date.now()) {
    const { chatDays = 7, receiptDays = 30, auditDays = 365 } = this.policy();
    this.store.orm.delete(oauthStates).where(lt(oauthStates.expiresAt, now)).run();
    // Legacy records receive conservative expiries once, without resetting TTLs on each sweep.
    const legacy = this.store.sqlite
      .prepare(
        "SELECT key,value FROM settings WHERE expires_at IS NULL AND (key LIKE 'login:%' OR key LIKE 'cooldown:%' OR key LIKE 'utility:%' OR key LIKE 'request:%' OR key LIKE 'sent:%' OR key LIKE 'discord_result:%' OR key LIKE 'chat_window:%')",
      )
      .all() as { key: string; value: string }[];
    for (const row of legacy) this.set(row.key, row.value);
    this.store.sqlite
      .prepare(
        "DELETE FROM settings WHERE expires_at<=? AND NOT EXISTS(SELECT 1 FROM jobs WHERE jobs.id=settings.job_id AND status IN ('pending','running','uncertain'))",
      )
      .run(now);
    this.protectUncertain();
    this.store.sqlite
      .prepare(
        "UPDATE jobs SET payload='{}',payload_state='scrubbed' WHERE status IN ('succeeded','failed') AND payload_state!='scrubbed' AND min(coalesce(payload_expires_at,created_at+?),created_at+?)<=?",
      )
      .run(chatDays * 86400000, chatDays * 86400000, now);
    this.store.sqlite
      .prepare(
        "UPDATE receipts SET payload=NULL WHERE event_type='chat.message.sent' AND received_at<? AND NOT EXISTS(SELECT 1 FROM jobs WHERE jobs.id='event:'||receipts.id AND jobs.status IN ('pending','running'))",
      )
      .run(now - chatDays * 86400000);
    this.store.sqlite
      .prepare(
        "DELETE FROM receipts WHERE received_at<? AND NOT EXISTS(SELECT 1 FROM jobs WHERE jobs.id='event:'||receipts.id AND jobs.status IN ('pending','running'))",
      )
      .run(now - receiptDays * 86400000);
    this.store.sqlite
      .prepare("DELETE FROM jobs WHERE status IN ('succeeded','failed') AND created_at<?")
      .run(now - Math.max(auditDays, receiptDays) * 86400000);
  }

  diagnostics() {
    const counts = this.store.sqlite
      .prepare("SELECT status,count(*) AS count FROM jobs GROUP BY status")
      .all();
    const last =
      this.store.sqlite
        .prepare(
          "SELECT id,event_type AS eventType,received_at AS receivedAt FROM receipts ORDER BY received_at DESC LIMIT 1",
        )
        .get() ?? null;
    return {
      jobs: counts,
      lastVerifiedEvent: last,
      workerHeartbeat: this.setting("worker_heartbeat") ?? null,
      lastError: this.setting("worker_error") ?? null,
    };
  }
}
