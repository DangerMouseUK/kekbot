import { randomUUID } from "node:crypto";
import { readConfig, type Config } from "./config.ts";
import { AppError, DeliveryError } from "./errors.ts";
import { openStore } from "./storage/database.ts";
import { Repository, type Job } from "./storage/repository.ts";
import { KickService } from "./providers/kick.ts";
import { processEvent } from "./domain/process-event.ts";
import { setTimeout as delay } from "node:timers/promises";

export class Runtime {
  readonly config: Config;
  readonly repository: Repository;
  readonly kick: KickService;
  private readonly owner = randomUUID();
  private timer?: NodeJS.Timeout;
  private active?: Promise<void>;
  private stopped = false;
  private nextRetention = 0;

  constructor(config: Config) {
    this.config = config;
    this.repository = new Repository(openStore(config));
    this.kick = new KickService(config, this.repository);
  }

  start() {
    if (!this.config.runJobs) throw new AppError("runtime_disabled_set_KEKBOT_RUN_JOBS", 503);
    this.repository.acquireLease(this.owner);
    this.tick();
  }

  private tick() {
    if (this.stopped) return;
    this.active = this.batch().catch(error => {
      this.stopped = true;
      // Disk-full/read-only failures can also prevent writing diagnostics.
      try { this.repository.set("worker_error", error instanceof AppError ? error.code : "worker_storage_error"); }
      catch { /* readiness still reports unavailable; do not create an unhandled rejection */ }
    }).finally(() => {
      if (!this.stopped) this.timer = setTimeout(() => this.tick(), 250);
    });
  }

  private async batch() {
    this.repository.acquireLease(this.owner);
    this.repository.set("worker_heartbeat", String(Date.now()));
    if (Date.now() >= this.nextRetention) {
      this.repository.retain();
      this.nextRetention = Date.now() + 3600000;
    }
    for (let index = 0; index < 10 && !this.stopped; index++) {
      this.repository.acquireLease(this.owner);
      const job = this.repository.claim();
      if (!job) break;
      await this.execute(job);
    }
  }

  async execute(job: Job) {
    try {
      if (job.kind === "kick.event") {
        processEvent(this.repository, job);
        return;
      }
      if (job.kind === "kick.reply") {
        if (this.config.mode === "fixture") {
          this.repository.set("fixture_last_reply", job.id);
        } else {
          await this.kick.reply();
        }
      } else if (job.kind === "proof.record") {
        this.repository.set("proof_last_record", job.id);
      } else {
        throw new AppError("unsupported_job", 500);
      }
      this.repository.finish(job, "succeeded");
    } catch (error) {
      const code = error instanceof AppError ? error.code : "job_invalid_or_storage_error";
      if (error instanceof DeliveryError && error.outcome === "retry" && job.attempts < 4) {
        this.repository.finish(job, "pending", code, error.retryAfterMs);
      } else {
        this.repository.finish(job, error instanceof DeliveryError && error.outcome === "uncertain" ? "uncertain" : "failed", code);
      }
    }
  }

  healthy() {
    const heartbeat = Number(this.repository.setting("worker_heartbeat") ?? 0);
    return !this.stopped && Date.now() - heartbeat < 30000;
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.active;
    this.repository.releaseLease(this.owner);
    this.repository.store.close();
  }
}

const globalRuntime = globalThis as typeof globalThis & { __kekbotRuntime?: Runtime };

export function getRuntime(): Runtime {
  if (globalRuntime.__kekbotRuntime) return globalRuntime.__kekbotRuntime;
  const runtime = new Runtime(readConfig());
  try { runtime.start(); }
  catch (error) { runtime.repository.store.close(); throw error; }
  globalRuntime.__kekbotRuntime = runtime;
  return runtime;
}

export async function initializeRuntime() {
  const deadline = Date.now() + 31000;
  while (true) {
    try { return getRuntime(); }
    catch (error) {
      if (!(error instanceof AppError) || error.code !== "instance_already_running_or_in_maintenance" || Date.now() >= deadline) throw error;
      await delay(250);
    }
  }
}
