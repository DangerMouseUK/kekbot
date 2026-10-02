import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { generateKeyPairSync, sign } from "node:crypto";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProofCapture, replayCapture } from "../src/server/proof-capture.ts";
import { acceptKickWebhook, WEBHOOK_MAX_AGE_MS } from "../src/server/providers/kick-webhook.ts";
import { environment, fixtureChat, repository } from "./helpers.ts";
import type { Repository } from "../src/server/storage/repository.ts";

const pair = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
const opened: Repository[] = [];
afterEach(() => { for (const repo of opened.splice(0)) if (repo.store.sqlite.open) repo.store.close(); });
function setup() {
  const context = environment("live");
  const repo = repository(context.config); opened.push(repo);
  return { ...context, repo, capture: new ProofCapture(context.config, repo) };
}
function event(id = "01J00000000000000000000001", timestamp = new Date().toISOString(), chat = fixtureChat()) {
  const body = Buffer.from(JSON.stringify({ ...chat, unrelated: "not normalized away from signed bytes" }, null, 2));
  const headers = new Headers({ "content-type": "application/json", "kick-event-message-id": id,
    "kick-event-message-timestamp": timestamp, "kick-event-type": "chat.message.sent", "kick-event-version": "1",
    "kick-event-signature": sign("RSA-SHA256", Buffer.concat([Buffer.from(`${id}.${timestamp}.`), body]), pair.privateKey).toString("base64") });
  return { id, body, headers };
}
function accept(context: ReturnType<typeof setup>, request: ReturnType<typeof event>, now = Date.now()) {
  const result = acceptKickWebhook(context.repo, request.body, request.headers, pair.publicKey, 123, now);
  context.capture.observe(request.body, request.headers, result.accepted, now);
  return result;
}
function options(context: ReturnType<typeof setup>, request: typeof fetch) {
  return { live: true, committed: (id: string) => Boolean(context.repo.store.sqlite.prepare("SELECT id FROM receipts WHERE id=?").get(id)), request };
}

describe("private foundation proof capture", () => {
  it("is off by default, consumes one committed proof event and replays its exact signed bytes", async () => {
    const context = setup();
    accept(context, event("01J00000000000000000000000"));
    expect(context.capture.status().lastCapture).toBeNull();
    context.capture.arm();
    const original = event();
    accept(context, original);
    const path = join(context.config.directory, "secrets/proof-captures", `${original.id}.capture`);
    expect(readFileSync(path, "utf8")).not.toContain("!kekbot");
    expect(context.capture.status().armedUntil).toBeNull();
    accept(context, event("01J00000000000000000000002"));
    expect(context.capture.status().lastCapture?.deliveryId).toBe(original.id);
    const jobsBefore = context.repo.store.sqlite.prepare("SELECT count(*) AS n FROM jobs").get();
    const request = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      expect(url).toBe("https://kekbot.example/api/providers/kick/events");
      expect(Buffer.from(init!.body as Uint8Array)).toEqual(original.body);
      expect(new Headers(init?.headers).get("kick-event-signature")).toBe(original.headers.get("kick-event-signature"));
      expect(init?.redirect).toBe("error");
      return Response.json(accept(context, original));
    });
    expect(await replayCapture(context.config, original.id, options(context, request))).toEqual({ deliveryId: original.id, status: 200, duplicate: true });
    expect(context.repo.store.sqlite.prepare("SELECT count(*) AS n FROM jobs").get()).toEqual(jobsBefore);
    const restarted = new ProofCapture(context.config, context.repo);
    expect(restarted.status().lastCapture?.deliveryId).toBe(original.id);
    expect(restarted.status().armedUntil).toBeNull();
  });

  it("leaves capture armed for ordinary messages or duplicates and expires after five minutes", () => {
    const context = setup(); const now = Date.now();
    const prior = event(); accept(context, prior, now);
    context.capture.arm(now);
    accept(context, prior, now + 1);
    accept(context, event("01J00000000000000000000002", new Date(now).toISOString(), { ...fixtureChat(), content: "ordinary chat" }), now + 2);
    expect(context.capture.status(now + 2).armedUntil).toBe(now + 300000);
    accept(context, event("01J00000000000000000000003"), now + 300001);
    expect(context.capture.status(now + 300001).lastCapture).toBeNull();
  });

  it("rejects forged and wrong-channel requests before evidence is captured", () => {
    const context = setup(); context.capture.arm();
    const original = event();
    expect(() => accept(context, { ...original, body: Buffer.from(original.body.toString().replace("!kekbot", "forged")) })).toThrow("invalid_webhook_signature");
    expect(() => accept(context, event(original.id, new Date().toISOString(), { ...fixtureChat(), broadcaster: { user_id: 999 } }))).toThrow("event_for_different_channel");
    expect(context.capture.status().lastCapture).toBeNull();
    expect(context.capture.status().armedUntil).toBeTruthy();
  });

  it("keeps receipt and job committed when writing capture evidence fails", () => {
    const context = setup(); context.capture.arm();
    writeFileSync(join(context.config.directory, "secrets/proof-captures"), "block directory creation");
    expect(accept(context, event()).accepted).toBe(true);
    expect(context.capture.status().error).toBe("proof_capture_write_failed");
    expect(context.repo.store.sqlite.prepare("SELECT count(*) AS n FROM receipts").get()).toEqual({ n: 1 });
    expect(context.repo.store.sqlite.prepare("SELECT count(*) AS n FROM jobs").get()).toEqual({ n: 1 });
  });

  it("refuses uncommitted, expired, wrong-key, tampered and unconfirmed replays without unsafe retries", async () => {
    const context = setup(); const original = event(); context.capture.arm(); accept(context, original);
    const request = vi.fn<typeof fetch>(); const replayOptions = options(context, request);
    await expect(replayCapture(context.config, original.id, { ...replayOptions, live: false })).rejects.toThrow("proof_replay_requires_live_mode_and_flag");
    await expect(replayCapture({ ...context.config, mode: "fixture" }, original.id, replayOptions)).rejects.toThrow("proof_replay_requires_live_mode_and_flag");
    await expect(replayCapture(context.config, "../outside", replayOptions)).rejects.toThrow("invalid_capture_delivery_id");
    await expect(replayCapture(context.config, original.id, { ...replayOptions, committed: () => false })).rejects.toThrow("proof_replay_requires_committed_receipt");
    await expect(replayCapture(context.config, original.id, { ...replayOptions, now: Date.parse(original.headers.get("kick-event-message-timestamp")!) + WEBHOOK_MAX_AGE_MS })).rejects.toThrow("proof_capture_expired_or_future_timestamp");
    await expect(replayCapture({ ...context.config, key: Buffer.alloc(32, 1) }, original.id, replayOptions)).rejects.toThrow("proof_capture_unavailable_or_invalid");
    await expect(replayCapture({ ...context.config, broadcasterId: 999 }, original.id, replayOptions)).rejects.toThrow("proof_capture_unavailable_or_invalid");
    expect(request).not.toHaveBeenCalled();
    request.mockResolvedValueOnce(Response.json({ accepted: true, duplicate: false }));
    await expect(replayCapture(context.config, original.id, replayOptions)).rejects.toThrow("proof_replay_not_confirmed_duplicate");
    request.mockRejectedValueOnce(new Error("private provider details"));
    await expect(replayCapture(context.config, original.id, replayOptions)).rejects.toThrow("proof_replay_request_failed");
    expect(request).toHaveBeenCalledTimes(2);
    writeFileSync(join(context.config.directory, "secrets/proof-captures", `${original.id}.capture`), "corrupted");
    await expect(replayCapture(context.config, original.id, replayOptions)).rejects.toThrow("proof_capture_unavailable_or_invalid");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("prunes only expired encrypted captures and leaves unrelated private files alone", () => {
    const context = setup(); const now = Date.now(); context.capture.arm(now);
    const original = event(undefined, new Date(now - WEBHOOK_MAX_AGE_MS + 1000).toISOString());
    accept(context, original, now);
    const directory = join(context.config.directory, "secrets/proof-captures");
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "operator.txt"), "unrelated");
    context.capture.prune(now + 1001);
    expect(existsSync(join(directory, `${original.id}.capture`))).toBe(false);
    expect(readFileSync(join(directory, "operator.txt"), "utf8")).toBe("unrelated");
  });
});
