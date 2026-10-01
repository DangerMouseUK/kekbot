import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "../src/server/crypto.ts";
import { readConfig, readPaths, requireKick } from "../src/server/config.ts";
import { acceptKickWebhook, WEBHOOK_MAX_AGE_MS } from "../src/server/providers/kick-webhook.ts";
import { environment, fixtureChat, repository } from "./helpers.ts";

const pair = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });

function signed(body: Buffer, timestamp = new Date().toISOString()) {
  const id = "01J00000000000000000000000";
  return new Headers({ "kick-event-message-id": id, "kick-event-message-timestamp": timestamp,
    "kick-event-signature": sign("RSA-SHA256", Buffer.concat([Buffer.from(`${id}.${timestamp}.`), body]), pair.privateKey).toString("base64"),
    "kick-event-type": "chat.message.sent", "kick-event-version": "1" });
}

describe("provider trust and secrets", () => {
  it("encrypts secrets with authenticated purpose binding", () => {
    const key = Buffer.alloc(32, 1);
    const secret = encrypt("secret-provider-token", key, "kick.tokens");
    expect(secret).not.toContain("secret-provider-token");
    expect(decrypt(secret, key, "kick.tokens")).toBe("secret-provider-token");
    expect(() => decrypt(secret, key, "kick.pkce")).toThrow();
    expect(() => decrypt(secret, Buffer.alloc(32, 2), "kick.tokens")).toThrow();
  });

  it("defaults to live mode and isolates explicitly selected fixtures", () => {
    expect(readPaths({}).mode).toBe("live");
    expect(readPaths({ KEKBOT_MODE: "fixture" }).directory).not.toBe(readPaths({}).directory);
    const context = environment();
    expect(() => requireKick(context.config)).toThrow("live_actions_disabled_in_fixture_mode");
    expect(() => readConfig({ ...context.env, KICK_CLIENT_ID: "live-credential" })).toThrow("fixture_mode_rejects_live_credentials");
    expect(() => readConfig({ ...context.env, KEKBOT_PUBLIC_URL: "https://user:password@kekbot.example" })).toThrow("public_url_must_be_https_origin");
  });

  it("verifies original bytes, rejects tampering, and accepts a delivery only once", () => {
    const repo = repository(environment().config);
    try {
      const body = Buffer.from(JSON.stringify(fixtureChat(), null, 2));
      const headers = signed(body);
      expect(acceptKickWebhook(repo, body, headers, pair.publicKey, 123).accepted).toBe(true);
      expect(acceptKickWebhook(repo, body, headers, pair.publicKey, 123).duplicate).toBe(true);
      expect(() => acceptKickWebhook(repo, Buffer.from(JSON.stringify(fixtureChat())), headers, pair.publicKey, 123)).toThrow("invalid_webhook_signature");
      headers.set("kick-event-public-key", Buffer.from(pair.publicKey).toString("base64"));
      const other = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
      expect(() => acceptKickWebhook(repo, body, headers, other.publicKey, 123)).toThrow("invalid_webhook_signature");
    } finally { repo.store.close(); }
  });

  it("rejects a correctly signed event from another channel", () => {
    const repo = repository(environment().config);
    try {
      const body = Buffer.from(JSON.stringify({ ...fixtureChat(), broadcaster: { user_id: 999 } }));
      expect(() => acceptKickWebhook(repo, body, signed(body), pair.publicKey, 123)).toThrow("event_for_different_channel");
      expect(repo.diagnostics().lastVerifiedEvent).toBeNull();
    } finally { repo.store.close(); }
  });

  it("permits bounded delayed retries and rejects old or malformed deliveries", () => {
    const repo = repository(environment().config);
    try {
      const body = Buffer.from(JSON.stringify(fixtureChat()));
      expect(acceptKickWebhook(repo, body, signed(body, new Date(Date.now() - 24 * 3600000).toISOString()), pair.publicKey, 123).accepted).toBe(true);
      expect(() => acceptKickWebhook(repo, body, signed(body, new Date(Date.now() - WEBHOOK_MAX_AGE_MS - 1000).toISOString()), pair.publicKey, 123)).toThrow("webhook_timestamp_outside_retry_window");
      const invalid = Buffer.from("{bad-json");
      expect(() => acceptKickWebhook(repo, invalid, signed(invalid), pair.publicKey, 123)).toThrow("invalid_webhook_json");
      const missing = Buffer.from(JSON.stringify({ broadcaster: { user_id: 123 } }));
      expect(() => acceptKickWebhook(repo, missing, signed(missing), pair.publicKey, 123)).toThrow("invalid_webhook_payload");
    } finally { repo.store.close(); }
  });
});
