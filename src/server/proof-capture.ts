import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { Config } from "./config.ts";
import { decrypt, encrypt } from "./crypto.ts";
import { AppError } from "./errors.ts";
import { boundedBody } from "./body.ts";
import { WEBHOOK_MAX_AGE_MS, WEBHOOK_MAX_BYTES } from "./providers/kick-webhook.ts";
import type { Repository } from "./storage/repository.ts";

const deliveryId = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
const MAX_CAPTURE_BYTES = WEBHOOK_MAX_BYTES * 2 + 16384;
const CAPTURE_ARM_MS = 5 * 60000;
const capturedHeaders = z.object({
  "kick-event-message-id": deliveryId,
  "kick-event-message-timestamp": z.string().min(1).max(64),
  "kick-event-signature": z.string().min(1).max(2048),
  "kick-event-type": z.literal("chat.message.sent"),
  "kick-event-version": z.literal("1"),
  "kick-event-subscription-id": deliveryId.optional(),
  "content-type": z.string().max(256).optional()
}).strict();
const envelopeSchema = z.object({
  format: z.literal(1), mode: z.enum(["live", "fixture"]), broadcasterId: z.number().int().positive(),
  capturedAt: z.number().int().nonnegative(), headers: capturedHeaders,
  bodyBase64: z.string().max(Math.ceil(WEBHOOK_MAX_BYTES / 3) * 4).regex(/^[A-Za-z0-9+/]+={0,2}$/)
}).strict();
type Envelope = z.infer<typeof envelopeSchema>;
type CaptureConfig = Pick<Config, "directory" | "key" | "mode" | "broadcasterId">;

function captureDirectory(config: CaptureConfig) { return join(config.directory, "secrets", "proof-captures"); }
function capturePath(config: CaptureConfig, id: string) {
  if (!deliveryId.safeParse(id).success) throw new AppError("invalid_capture_delivery_id");
  return join(captureDirectory(config), `${id}.capture`);
}
function purpose(config: CaptureConfig, id: string) { return `kick.proof.capture:${config.mode}:${id}`; }

function readEnvelope(config: CaptureConfig, id: string): Envelope {
  try {
    const path = capturePath(config, id);
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.size > MAX_CAPTURE_BYTES) throw new Error();
    const envelope = envelopeSchema.parse(JSON.parse(decrypt(readFileSync(/* turbopackIgnore: true */ path, "utf8").trim(), config.key, purpose(config, id))));
    if (envelope.mode !== config.mode || envelope.broadcasterId !== config.broadcasterId || envelope.headers["kick-event-message-id"] !== id) throw new Error();
    const body = Buffer.from(envelope.bodyBase64, "base64");
    const chat = JSON.parse(body.toString("utf8")) as { content?: unknown; broadcaster?: { user_id?: unknown } };
    if (body.length > WEBHOOK_MAX_BYTES || typeof chat.content !== "string" || chat.content.trim().toLowerCase() !== "!kekbot" || chat.broadcaster?.user_id !== config.broadcasterId) throw new Error();
    if (!Number.isFinite(Date.parse(envelope.headers["kick-event-message-timestamp"]))) throw new Error();
    return envelope;
  } catch { throw new AppError("proof_capture_unavailable_or_invalid", 503); }
}

export class ProofCapture {
  private armedUntil = 0;
  private error: string | null = null;
  readonly config: CaptureConfig;
  readonly repository: Repository;

  constructor(config: CaptureConfig, repository: Repository) { this.config = config; this.repository = repository; }

  arm(now = Date.now()) {
    this.prune(now);
    this.armedUntil = now + CAPTURE_ARM_MS;
    this.error = null;
    this.repository.set("proof_capture_error", "");
    return this.status(now);
  }

  private fail() {
    this.error = "proof_capture_write_failed";
    try { this.repository.set("proof_capture_error", this.error); }
    catch { /* Capturing evidence must never undo an already committed receipt. */ }
  }

  observe(body: Buffer, headers: Headers, accepted: boolean, now = Date.now()) {
    if (!accepted || now >= this.armedUntil || headers.get("kick-event-type") !== "chat.message.sent") return;
    // Call only after original-byte signature verification and receipt commit.
    const chat = JSON.parse(body.toString("utf8")) as { content?: string };
    if (chat.content?.trim().toLowerCase() !== "!kekbot") return;
    this.armedUntil = 0;
    try {
      const originalHeaders: Record<string, string> = {};
      for (const name of Object.keys(capturedHeaders.shape)) {
        const value = headers.get(name);
        if (value !== null) originalHeaders[name] = value;
      }
      const envelope = envelopeSchema.parse({ format: 1, mode: this.config.mode, broadcasterId: this.config.broadcasterId,
        capturedAt: now, headers: originalHeaders, bodyBase64: body.toString("base64") });
      const id = envelope.headers["kick-event-message-id"];
      mkdirSync(captureDirectory(this.config), { recursive: true, mode: 0o700 });
      writeFileSync(capturePath(this.config, id), encrypt(JSON.stringify(envelope), this.config.key, purpose(this.config, id)) + "\n", { flag: "wx", mode: 0o600 });
      this.repository.set("proof_last_capture", JSON.stringify({ deliveryId: id, capturedAt: now,
        expiresAt: Date.parse(envelope.headers["kick-event-message-timestamp"]) + WEBHOOK_MAX_AGE_MS }));
      this.repository.set("proof_capture_error", "");
      this.error = null;
    } catch { this.fail(); }
  }

  prune(now = Date.now()) {
    const directory = captureDirectory(this.config);
    if (!existsSync(directory)) return;
    try {
      for (const name of readdirSync(directory).sort().slice(0, 100)) {
        if (!name.endsWith(".capture")) continue;
        const id = name.slice(0, -8);
        if (!deliveryId.safeParse(id).success) continue;
        const envelope = readEnvelope(this.config, id);
        if (Date.parse(envelope.headers["kick-event-message-timestamp"]) + WEBHOOK_MAX_AGE_MS <= now) unlinkSync(capturePath(this.config, id));
      }
    } catch {
      this.error = "proof_capture_cleanup_failed";
      try { this.repository.set("proof_capture_error", this.error); } catch { /* Optional evidence housekeeping. */ }
    }
  }

  status(now = Date.now()) {
    const last = this.repository.setting("proof_last_capture");
    return { armedUntil: this.armedUntil > now ? this.armedUntil : null,
      lastCapture: last ? JSON.parse(last) as { deliveryId: string; capturedAt: number; expiresAt: number } : null,
      error: this.error ?? (this.repository.setting("proof_capture_error") || null) };
  }
}

export async function replayCapture(config: Pick<Config, "directory" | "key" | "mode" | "broadcasterId" | "publicUrl">, id: string,
  options: { live: boolean; committed: (id: string) => boolean; request?: typeof fetch; now?: number }) {
  if (config.mode !== "live" || !options.live) throw new AppError("proof_replay_requires_live_mode_and_flag");
  if (!config.publicUrl?.startsWith("https://")) throw new AppError("proof_replay_requires_configured_https_origin");
  capturePath(config, id);
  if (!options.committed(id)) throw new AppError("proof_replay_requires_committed_receipt");
  const envelope = readEnvelope(config, id);
  const now = options.now ?? Date.now();
  const timestamp = Date.parse(envelope.headers["kick-event-message-timestamp"]);
  if (timestamp + WEBHOOK_MAX_AGE_MS <= now || timestamp > now + 300000) throw new AppError("proof_capture_expired_or_future_timestamp");
  try {
    const response = await (options.request ?? fetch)(`${config.publicUrl}/api/providers/kick/events`, {
      method: "POST", headers: envelope.headers, body: new Uint8Array(Buffer.from(envelope.bodyBase64, "base64")),
      redirect: "error", signal: AbortSignal.timeout(10000)
    });
    const result = z.object({ accepted: z.literal(false), duplicate: z.literal(true) }).safeParse(JSON.parse((await boundedBody(response, 1024)).toString("utf8")));
    if (!response.ok || !result.success) throw new AppError("proof_replay_not_confirmed_duplicate", 502);
    return { deliveryId: id, status: response.status, duplicate: true };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("proof_replay_request_failed", 502);
  }
}
