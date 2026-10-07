import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { KickService, KICK_EVENTS, KICK_SCOPES } from "../src/server/providers/kick.ts";
import { connections, oauthStates } from "../src/server/storage/schema.ts";
import { decrypt, encrypt } from "../src/server/crypto.ts";
import { environment, repository } from "./helpers.ts";
import type { Repository } from "../src/server/storage/repository.ts";

const opened: Repository[] = [];
afterEach(() => { for (const repo of opened.splice(0)) repo.store.close(); });
const token = { access_token: "test-access-token", refresh_token: "test-refresh-token", expires_in: 3600, scope: KICK_SCOPES.join(" ") };
function setup() {
  const { config } = environment("live");
  const repo = repository(config); opened.push(repo);
  const request = vi.fn<typeof fetch>();
  const service = new KickService(config, repo, request);
  return { config, repo, request, service };
}
function saveExpired(context: ReturnType<typeof setup>, expiresAt = 0) {
  context.repo.store.orm.insert(connections).values({ provider: "kick", secret: encrypt(JSON.stringify({ ...token, expiresAt, userId: 123, username: "creator" }), context.config.key, "kick.tokens"), updatedAt: 0 }).run();
}

describe("Kick contract", () => {
  it("accepts the documented empty 204 confirmation for chat deletion", async () => {
    const context = setup();
    context.repo.store.orm.insert(connections).values({ provider: "kick", secret: encrypt(JSON.stringify({ ...token, scope: [...KICK_SCOPES, "moderation:chat_message:manage"].join(" "), expiresAt: Date.now() + 3600000, userId: 123, username: "creator" }), context.config.key, "kick.tokens"), updatedAt: 0 }).run();
    context.request.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(context.service.moderate({ action: "delete", userId: 456, messageId: "fixture-message", reason: "fixture" })).resolves.toBeUndefined();
    expect(context.request.mock.calls[0][0]).toBe("https://api.kick.com/public/v1/chat/fixture-message");
  });
  it("uses PKCE and consumes browser-bound state once, storing only encrypted tokens", async () => {
    const { config, repo, request, service } = setup();
    const url = new URL(service.authorize("browser-binding"));
    expect(url.origin).toBe("https://id.kick.com");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    const state = url.searchParams.get("state")!;
    const stored = repo.store.orm.select().from(oauthStates).get()!;
    expect(stored.id).not.toBe(state);
    expect(stored.verifier).not.toContain(decrypt(stored.verifier, config.key, "kick.pkce"));
    await expect(service.complete("code", state, "different-browser")).rejects.toThrow("invalid_or_expired_oauth_state");
    expect(request).not.toHaveBeenCalled();
    request.mockResolvedValueOnce(Response.json(token)).mockResolvedValueOnce(Response.json({ data: [{ user_id: 123, name: "creator" }] }));
    await service.complete("code", state, "browser-binding");
    const body = request.mock.calls[0][1]?.body as URLSearchParams;
    expect(body.get("code_verifier")).toBe(decrypt(stored.verifier, config.key, "kick.pkce"));
    const saved = repo.store.orm.select().from(connections).get()!;
    expect(saved.secret).not.toContain(token.access_token);
    expect(service.status().authorized).toBe(true);
    await expect(service.complete("code", state, "browser-binding")).rejects.toThrow("invalid_or_expired_oauth_state");
  });

  it("rejects missing scopes and an authorization for a different creator", async () => {
    const { repo, request, service } = setup();
    let state = new URL(service.authorize("binding")).searchParams.get("state")!;
    request.mockResolvedValueOnce(Response.json({ ...token, scope: "user:read" }));
    await expect(service.complete("code", state, "binding")).rejects.toThrow("kick_required_scopes_missing");
    state = new URL(service.authorize("binding")).searchParams.get("state")!;
    request.mockResolvedValueOnce(Response.json(token)).mockResolvedValueOnce(Response.json({ data: [{ user_id: 999, name: "other" }] }));
    await expect(service.complete("code", state, "binding")).rejects.toThrow("authorize_configured_channel_owner");
    expect(repo.store.orm.select().from(connections).all()).toHaveLength(0);
  });

  it("serializes refresh and atomically stores the rotated refresh token", async () => {
    const context = setup(); saveExpired(context);
    context.request.mockResolvedValueOnce(Response.json({ ...token, access_token: "rotated-access", refresh_token: "rotated-refresh" }));
    expect(await Promise.all([context.service.accessToken(), context.service.accessToken()])).toEqual(["rotated-access", "rotated-access"]);
    expect(context.request).toHaveBeenCalledTimes(1);
    const encrypted = context.repo.store.orm.select().from(connections).where(eq(connections.provider, "kick")).get()!.secret;
    expect(JSON.parse(decrypt(encrypted, context.config.key, "kick.tokens")).refresh_token).toBe("rotated-refresh");
  });

  it("requires repair after failed refresh and never leaks a provider response", async () => {
    const context = setup(); saveExpired(context);
    context.request.mockResolvedValueOnce(Response.json({ secret: "provider-debug-secret" }, { status: 401 }));
    await expect(context.service.accessToken()).rejects.toThrow("kick_http_401");
    await expect(context.service.accessToken()).rejects.toThrow("kick_refresh_failed_reauthorize");
    expect(context.request).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(context.service.status())).not.toContain("provider-debug-secret");
  });

  it("shares a forced proof refresh with background work and returns sanitized status", async () => {
    const context = setup(); saveExpired(context, Date.now() + 3600000);
    let completeRefresh!: (response: Response) => void;
    context.request.mockImplementationOnce(() => new Promise(resolve => { completeRefresh = resolve; }));
    const first = context.service.refreshProof();
    const background = context.service.accessToken();
    const second = context.service.refreshProof();
    expect(context.request).toHaveBeenCalledTimes(1);
    completeRefresh(Response.json({ ...token, access_token: "fresh-access", refresh_token: "fresh-refresh" }));
    const [status, access, repeated] = await Promise.all([first, background, second]);
    expect(access).toBe("fresh-access");
    expect(status).toEqual(repeated);
    expect(status.lastRefreshAt).toBeTruthy();
    expect(JSON.stringify(status)).not.toMatch(/fresh-access|fresh-refresh|test-client-secret/);
  });

  it("reconciles only missing channel subscriptions and does not repeat confirmed subscriptions", async () => {
    const context = setup(); saveExpired(context, Date.now() + 3600000);
    const existing = { event: KICK_EVENTS[0], version: 1, broadcaster_user_id: 123 };
    context.request.mockResolvedValueOnce(Response.json({ data: [existing, { ...existing, event: KICK_EVENTS[1], broadcaster_user_id: 999 }] }))
      .mockResolvedValueOnce(Response.json({ data: KICK_EVENTS.slice(1).map(name => ({ name, version: 1, error: "", subscription_id: `fixture-${name}` })) }))
      .mockResolvedValueOnce(Response.json({ data: KICK_EVENTS.map(event => ({ event, version: 1, broadcaster_user_id: 123 })) }));
    expect(await context.service.subscribe()).toEqual({ events: KICK_EVENTS });
    const posted = JSON.parse(context.request.mock.calls[1][1]?.body as string);
    expect(posted).toEqual({ method: "webhook", events: KICK_EVENTS.slice(1).map(name => ({ name, version: 1 })) });
    await context.service.subscribe();
    expect(context.request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expect(context.repo.setting("kick_subscriptions_checked_at")).toBeTruthy();
  });

  it("does not report complete subscriptions when Kick partially fails or confirms another version", async () => {
    const context = setup(); saveExpired(context, Date.now() + 3600000);
    context.request.mockResolvedValueOnce(Response.json({ data: [] }))
      .mockResolvedValueOnce(Response.json({ data: KICK_EVENTS.map((name, index) => ({ name, version: 1, subscription_id: index ? `fixture-${name}` : undefined, error: index ? "" : "private provider detail" })) }));
    await expect(context.service.subscribe()).rejects.toThrow("kick_subscription_not_confirmed");
    expect(context.repo.setting("kick_subscriptions_checked_at")).toBeUndefined();
    expect(JSON.stringify(context.service.status())).not.toContain("private provider detail");
    context.request.mockResolvedValueOnce(Response.json({ data: [] }))
      .mockResolvedValueOnce(Response.json({ data: KICK_EVENTS.map(name => ({ name, version: 2, subscription_id: `fixture-${name}` })) }));
    await expect(context.service.subscribe()).rejects.toThrow("kick_subscription_not_confirmed");
  });

  it("records only confirmed replies and keeps ambiguous or rejected replies explicit", async () => {
    const context = setup(); saveExpired(context, Date.now() + 3600000);
    context.request.mockResolvedValueOnce(Response.json({ data: { message_id: "fixture-reply", is_sent: true } }));
    await context.service.reply();
    expect(JSON.parse(context.repo.setting("kick_last_confirmed_reply")!).messageId).toBe("fixture-reply");
    context.request.mockResolvedValueOnce(Response.json({ data: { message_id: "rejected", is_sent: false } }));
    await expect(context.service.reply()).rejects.toMatchObject({ outcome: "failed" });
    context.request.mockResolvedValueOnce(Response.json({ data: { private: "provider-secret" } }));
    await expect(context.service.reply()).rejects.toMatchObject({ outcome: "uncertain" });
    expect(context.repo.setting("kick_last_confirmed_reply")).not.toContain("provider-secret");
  });

  it("only fetches verification trust from the official endpoint", async () => {
    const { service, request } = setup();
    request.mockResolvedValueOnce(Response.json({ data: { public_key: "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----" } }));
    await service.verificationKey(); await service.verificationKey();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe("https://api.kick.com/public/v1/public-key");
    expect(request.mock.calls[0][1]?.redirect).toBe("error");
  });

  it("keeps timed-out sends uncertain and handles bounded rate-limit waits", async () => {
    const { service, request } = setup();
    request.mockRejectedValueOnce(new Error("secret URL details"));
    await expect(service.http("https://api.kick.com/public/v1/chat", {}, true)).rejects.toMatchObject({ code: "kick_network_error", outcome: "uncertain" });
    request.mockResolvedValueOnce(new Response("", { status: 429, headers: { "retry-after": "999999" } }));
    await expect(service.http("https://api.kick.com/public/v1/chat", {}, true)).rejects.toMatchObject({ outcome: "retry", retryAfterMs: 300000 });
  });
});
