import { and, eq, lt } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { jobs, oauthStates, receipts, settings } from "./schema.ts";
import type { Store } from "./database.ts";
import { AppError } from "../errors.ts";

export type Job = typeof jobs.$inferSelect;
export type JobKind = Job["kind"];

export class Repository {
  readonly store: Store;
  constructor(store: Store) { this.store = store; }

  setting(key: string): string | undefined { return this.store.orm.select().from(settings).where(eq(settings.key, key)).get()?.value; }
  set(key: string, value: string) {
    this.store.orm.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();
  }

  enqueue(id: string, kind: JobKind, payload: unknown, dueAt = Date.now()) {
    return this.store.orm.insert(jobs).values({ id, kind, payload: JSON.stringify(payload), dueAt, createdAt: Date.now() }).onConflictDoNothing().run().changes === 1;
  }

  acceptReceipt(id: string, eventType: string, payload: unknown, now = Date.now()): boolean {
    return this.store.sqlite.transaction(() => {
      if (this.store.orm.select({ id: receipts.id }).from(receipts).where(eq(receipts.id, id)).get()) return false;
      const count = this.store.sqlite.prepare("SELECT count(*) AS n FROM jobs WHERE status IN ('pending','running')").get() as { n: number };
      if (count.n >= 10000) throw new AppError("job_backlog_full", 503);
      this.store.orm.insert(receipts).values({ id, eventType, payload: JSON.stringify(payload), receivedAt: now }).run();
      this.enqueue(`event:${id}`, "kick.event", { receiptId: id }, now);
      return true;
    }).immediate();
  }

  claim(now = Date.now(), leaseMs = 30000): Job | undefined {
    return this.store.sqlite.transaction(() => {
      // A crashed outbound send may already have reached Kick. Never resend it automatically.
      this.store.sqlite.prepare("UPDATE jobs SET status='uncertain',last_error='worker_lost_during_delivery',lease_owner=NULL,lease_until=NULL WHERE kind='kick.reply' AND status='running' AND lease_until<=?").run(now);
      this.store.sqlite.prepare("UPDATE jobs SET status='pending',lease_owner=NULL,lease_until=NULL WHERE kind!='kick.reply' AND status='running' AND lease_until<=?").run(now);
      const row = this.store.sqlite.prepare("SELECT id FROM jobs WHERE status='pending' AND due_at<=? ORDER BY due_at,created_at,id LIMIT 1").get(now) as { id: string } | undefined;
      if (!row) return undefined;
      this.store.orm.update(jobs).set({ status: "running", leaseUntil: now + leaseMs, leaseOwner: randomUUID() }).where(eq(jobs.id, row.id)).run();
      return this.store.orm.select().from(jobs).where(eq(jobs.id, row.id)).get();
    }).immediate();
  }

  finish(job: Job, status: Job["status"], error: string | null = null, delay = 0) {
    if (!job.leaseOwner) throw new AppError("job_without_lease", 500);
    const updated = this.store.orm.update(jobs).set({ status, lastError: error, dueAt: Date.now() + delay, attempts: job.attempts + 1, leaseUntil: null, leaseOwner: null })
      .where(and(eq(jobs.id, job.id), eq(jobs.status, "running"), eq(jobs.leaseOwner, job.leaseOwner))).run();
    if (updated.changes !== 1) throw new AppError("job_lease_lost", 503);
  }

  acquireLease(owner: string, now = Date.now()) {
    const result = this.store.sqlite.prepare("INSERT INTO leases(name,owner,expires_at) VALUES('instance',?,?) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE leases.expires_at<=? OR leases.owner=excluded.owner").run(owner, now + 30000, now);
    if (!result.changes) throw new AppError("instance_already_running_or_in_maintenance", 503);
  }
  releaseLease(owner: string) { this.store.sqlite.prepare("DELETE FROM leases WHERE name='instance' AND owner=?").run(owner); }

  retain(now = Date.now()) {
    this.store.orm.delete(oauthStates).where(lt(oauthStates.expiresAt, now)).run();
    this.store.sqlite.prepare("UPDATE receipts SET payload=NULL WHERE event_type='chat.message.sent' AND received_at<? AND NOT EXISTS(SELECT 1 FROM jobs WHERE jobs.id='event:'||receipts.id AND jobs.status IN ('pending','running'))").run(now - 7 * 86400000);
    this.store.sqlite.prepare("DELETE FROM receipts WHERE received_at<? AND NOT EXISTS(SELECT 1 FROM jobs WHERE jobs.id='event:'||receipts.id AND jobs.status IN ('pending','running'))").run(now - 30 * 86400000);
    this.store.sqlite.prepare("DELETE FROM jobs WHERE status='succeeded' AND created_at<?").run(now - 30 * 86400000);
  }

  diagnostics() {
    const counts = this.store.sqlite.prepare("SELECT status,count(*) AS count FROM jobs GROUP BY status").all();
    const last = this.store.sqlite.prepare("SELECT id,event_type AS eventType,received_at AS receivedAt FROM receipts ORDER BY received_at DESC LIMIT 1").get() ?? null;
    return { jobs: counts, lastVerifiedEvent: last, workerHeartbeat: this.setting("worker_heartbeat") ?? null, lastError: this.setting("worker_error") ?? null };
  }
}
