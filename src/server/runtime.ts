import { randomUUID } from "node:crypto";
import { readConfig, type Config } from "./config.ts";
import { AppError, DeliveryError } from "./errors.ts";
import { openStore } from "./storage/database.ts";
import { Repository, type Job } from "./storage/repository.ts";
import { KickService } from "./providers/kick.ts";
import { ProofCapture } from "./proof-capture.ts";
import { setTimeout as delay } from "node:timers/promises";
import { AuthService } from "./auth.ts";
import type { Actor, Permission } from "./auth.ts";
import { BotService } from "./domain/bot.ts";
import { DiscordService } from "./providers/discord.ts";

export class Runtime {
  readonly config: Config;
  readonly repository: Repository;
  readonly kick: KickService;
  readonly proofCapture: ProofCapture;
  readonly auth: AuthService;
  readonly bot: BotService;
  readonly discord: DiscordService;
  private readonly owner = randomUUID();
  private timer?: NodeJS.Timeout;
  private leaseTimer?: NodeJS.Timeout;
  private active?: Promise<void>;
  private stopped = false;
  private nextRetention = 0;
  private nextDomainTick = 0;
  private nextRepair = 0;
  private nextSample = 0;

  constructor(config: Config) {
    this.config = config;
    this.repository = new Repository(openStore(config));
    this.kick = new KickService(config, this.repository);
    this.proofCapture = new ProofCapture(config, this.repository);
    this.auth = new AuthService(this.repository);
    this.bot = new BotService(this.repository, config);
    this.discord = new DiscordService(this.bot.state);
  }

  start() {
    if (!this.config.runJobs) throw new AppError("runtime_disabled_set_KEKBOT_RUN_JOBS", 503);
    this.repository.acquireLease(this.owner);
    this.bot.media.recover();
    this.bot.automation.recoverTimers();
    // Provider reconciliation can span several requests. Keep the installation
    // lease alive while awaiting I/O, independently of the job batch cadence.
    this.leaseTimer = setInterval(() => {
      try { this.repository.acquireLease(this.owner); this.repository.set("worker_heartbeat", String(Date.now())); }
      catch { this.stopped = true; clearInterval(this.leaseTimer); }
    }, 5000);
    this.tick();
  }

  private tick() {
    if (this.stopped) return;
    this.active = this.batch().catch(error => {
      this.stopped = true;
      clearInterval(this.leaseTimer);
      // Disk-full/read-only failures can also prevent writing diagnostics.
      try { this.repository.set("worker_error", error instanceof AppError ? error.code : "worker_storage_error"); }
      catch { /* readiness still reports unavailable; do not create an unhandled rejection */ }
    }).finally(() => {
      if (!this.stopped) this.timer = setTimeout(() => this.tick(), 100);
    });
  }

  private async batch() {
    this.repository.acquireLease(this.owner);
    this.repository.set("worker_heartbeat", String(Date.now()));
    if (Date.now() >= this.nextRetention) {
      this.bot.operations.retain();
      this.proofCapture.prune();
      this.nextRetention = Date.now() + 3600000;
    }
    if (Date.now() >= this.nextDomainTick) { this.bot.tick(); this.nextDomainTick = Date.now() + 1000; }
    if (Date.now() >= this.nextRepair) {
      this.nextRepair = Date.now() + 300000;
      if (this.config.mode === "live" && this.kick.status().authorized) {
        try { await this.kick.accessToken(); this.repository.acquireLease(this.owner); await this.kick.subscribe(this.desiredEvents()); this.repository.set("kick_repair_error", ""); }
        catch (error) { this.repository.set("kick_repair_error", error instanceof AppError ? error.code : "kick_repair_failed"); }
      }
    }
    if (Date.now() >= this.nextSample && this.config.mode === "live" && this.kick.status().authorized) {
      this.nextSample = Date.now() + 60000;
      this.repository.acquireLease(this.owner); this.repository.set("worker_heartbeat", String(Date.now()));
      try {
        const sample = await this.kick.streamSample();
        this.repository.set("stream_sample", JSON.stringify(sample ? { ...sample, at: Date.now() } : null));
        if (sample) this.bot.state.observe(`viewers:${Math.floor(Date.now() / 60000)}`, "viewers.sample", sample.viewers);
        this.repository.set("stream_sample_error", "");
      } catch (error) { this.repository.set("stream_sample_error", error instanceof AppError ? error.code : "stream_sample_failed"); }
    }
    const deadline = Date.now() + 200;
    let renewed = Date.now();
    for (let index = 0; index < 50 && !this.stopped; index++) {
      if (Date.now() - renewed >= 1000) {
        this.repository.acquireLease(this.owner);
        this.repository.set("worker_heartbeat", String(Date.now()));
        renewed = Date.now();
      }
      const job = this.repository.claim();
      if (!job) break;
      await this.execute(job);
      if (Date.now() >= deadline) break;
    }
  }

  async execute(job: Job) {
    const confirmed = () => this.repository.store.sqlite.transaction(() => {
      this.repository.finish(job, "succeeded");
      this.bot.state.audit("worker", `${job.kind}.delivery`, job.id, "confirmed");
      this.bot.state.emit("effect", { id: job.id, status: "confirmed" });
    }).immediate();
    try {
      if (job.kind === "kick.event") {
        this.bot.event(job);
        return;
      }
      if (job.kind === "kick.reply") {
        const input = JSON.parse(job.payload) as { text?: string; actor?: Actor; permission?: Permission; timerId?: string; timerVersion?: number; scheduledAt?: number };
        if (input.actor && input.permission) this.bot.state.assertActor(input.actor, input.permission);
        if (job.id.startsWith("timer:") && !this.bot.automation.timerDeliveryAllowed(input)) throw new AppError("timer_no_longer_eligible", 409);
        if (this.config.mode === "fixture") {
          this.repository.store.sqlite.transaction(() => { this.repository.set("fixture_last_reply", job.id); confirmed(); }).immediate();
          return;
        } else {
          await this.kick.reply(input.text);
        }
      } else if (job.kind === "kick.action") {
        const input = JSON.parse(job.payload);
        if (!input.actor && this.bot.state.settings.moderationPaused) throw new AppError("automatic_moderation_paused", 409);
        if (input.actor && input.permission) this.bot.state.assertActor(input.actor, input.permission);
        if (this.config.mode === "fixture") { this.repository.store.sqlite.transaction(() => { this.repository.set("fixture_last_moderation", job.id); confirmed(); }).immediate(); return; }
        else await this.kick.moderate(input);
      } else if (job.kind === "media.validate") {
        const input = JSON.parse(job.payload);
        await this.bot.media.validate(input.id, Boolean(input.moderator));
      } else if (job.kind === "discord.send") {
        await this.discord.send(JSON.parse(job.payload));
      } else if (job.kind === "discord.interaction") {
        await this.discord.execute(job, (actor, name, input, id) => this.bot.action(actor, name, input, id));
      } else if (job.kind === "proof.record") {
        this.repository.store.sqlite.transaction(() => { this.repository.set("proof_last_record", job.id); confirmed(); }).immediate(); return;
      } else {
        throw new AppError("unsupported_job", 500);
      }
      confirmed();
    } catch (error) {
      const code = error instanceof AppError ? error.code : "job_invalid_or_storage_error";
      if (error instanceof DeliveryError && error.outcome === "retry" && job.attempts < 4) {
        this.repository.finish(job, "pending", code, error.retryAfterMs);
      } else {
        const outcome = error instanceof DeliveryError && error.outcome === "uncertain" ? "uncertain" : "failed";
        this.repository.finish(job, outcome, code);
        this.bot.state.audit("worker", `${job.kind}.delivery`, job.id, outcome);
      }
    }
  }

  desiredEvents() {
    return [...new Set(["chat.message.sent", "channel.followed", "livestream.status.updated", ...this.bot.state.list("alert").filter(a => a.data.enabled && a.data.event.startsWith("channel.subscription.")).map(a => a.data.event)])];
  }

  healthy() {
    const heartbeat = Number(this.repository.setting("worker_heartbeat") ?? 0);
    return !this.stopped && Date.now() - heartbeat < 30000;
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    clearInterval(this.leaseTimer);
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
