import { createHash } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import type { Config } from "../config.ts";
import { requireKick } from "../config.ts";
import { decrypt, digest, encrypt, randomToken } from "../crypto.ts";
import { AppError, DeliveryError } from "../errors.ts";
import { connections, oauthStates } from "../storage/schema.ts";
import type { Repository } from "../storage/repository.ts";

const API = "https://api.kick.com/public/v1";
const ID = "https://id.kick.com";
export const KICK_SCOPES = ["user:read", "channel:read", "chat:write", "events:subscribe"];
export const KICK_EVENTS = ["chat.message.sent", "channel.followed", "livestream.status.updated"];

const tokenSchema = z.object({
  access_token: z.string().min(1), refresh_token: z.string().min(1),
  expires_in: z.coerce.number().positive(), scope: z.string()
});
const storedTokenSchema = tokenSchema.extend({ expiresAt: z.number(), userId: z.number().int().positive(), username: z.string() });
type Tokens = z.infer<typeof storedTokenSchema>;
type Fetch = typeof fetch;

export class KickService {
  private readonly baseConfig: Config;
  readonly repository: Repository;
  private readonly request: Fetch;
  private refreshFlight?: Promise<string>;
  private cachedKey?: { pem: string; until: number };
  private generation = 0;

  constructor(config: Config, repository: Repository, request: Fetch = fetch) {
    this.baseConfig = config;
    this.repository = repository;
    this.request = request;
  }

  get config(): Config {
    const row = this.repository.store.sqlite.prepare("SELECT secret FROM connections WHERE provider='config:kick'").get() as { secret: string } | undefined;
    if (!row) return this.baseConfig;
    const saved = z.object({ clientId: z.string(), clientSecret: z.string(), broadcasterId: z.number().int().positive() }).parse(JSON.parse(decrypt(row.secret, this.baseConfig.key, "config:kick")));
    return { ...this.baseConfig, ...saved };
  }

  async http(url: string, init: RequestInit, mutation = false, noContent = false) {
    let response: Response;
    try {
      response = await this.request(url, { ...init, signal: AbortSignal.timeout(10000), redirect: "error" });
    } catch { throw new DeliveryError("kick_network_error", mutation ? "uncertain" : "failed"); }
    if (response.status === 429) {
      const header = response.headers.get("retry-after");
      const seconds = header ? Number(header) : NaN;
      const delay = Number.isFinite(seconds) ? seconds * 1000 : (header ? Date.parse(header) - Date.now() : 10000);
      throw new DeliveryError("kick_rate_limited", "retry", Math.min(300000, Math.max(1000, Number.isFinite(delay) ? delay : 10000)));
    }
    if (!response.ok) throw new DeliveryError(`kick_http_${response.status}`, mutation && response.status >= 500 ? "uncertain" : "failed");
    if (noContent && response.status === 204) return null;
    try { return await response.json() as unknown; }
    catch { throw new DeliveryError("kick_invalid_response", mutation ? "uncertain" : "failed"); }
  }

  authorize(browserBinding: string, moderation = false) {
    const config = requireKick(this.config);
    const state = randomToken();
    const verifier = randomToken();
    this.repository.store.orm.delete(oauthStates).where(eq(oauthStates.browserBinding, digest(browserBinding))).run();
    this.repository.store.orm.insert(oauthStates).values({
      id: digest(state), verifier: encrypt(verifier, this.config.key, "kick.pkce"),
      browserBinding: digest(browserBinding), expiresAt: Date.now() + 10 * 60000
    }).run();
    const url = new URL(`${ID}/oauth/authorize`);
    url.search = new URLSearchParams({
      client_id: config.clientId, response_type: "code", redirect_uri: `${config.publicUrl}/api/providers/kick/callback`,
      scope: [...KICK_SCOPES, ...(moderation ? ["moderation:ban", "moderation:chat_message:manage"] : [])].join(" "), state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256"
    }).toString();
    return url.toString();
  }

  async complete(code: string, state: string, browserBinding: string) {
    const generation = this.generation;
    const config = requireKick(this.config);
    const pending = this.repository.store.sqlite.transaction(() => {
      const row = this.repository.store.orm.select().from(oauthStates).where(and(
        eq(oauthStates.id, digest(state)), eq(oauthStates.browserBinding, digest(browserBinding)), gt(oauthStates.expiresAt, Date.now())
      )).get();
      if (!row) throw new AppError("invalid_or_expired_oauth_state", 403);
      this.repository.store.orm.delete(oauthStates).where(eq(oauthStates.id, row.id)).run();
      return row;
    }).immediate();
    const raw = await this.http(`${ID}/oauth/token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", client_id: config.clientId, client_secret: config.clientSecret,
        redirect_uri: `${config.publicUrl}/api/providers/kick/callback`, code,
        code_verifier: decrypt(pending.verifier, this.config.key, "kick.pkce") })
    });
    const token = this.validateToken(raw);
    const users = z.object({ data: z.array(z.object({ user_id: z.number().int().positive(), name: z.string() })).min(1) }).safeParse(
      await this.http(`${API}/users`, { headers: { Authorization: `Bearer ${token.access_token}` } })
    );
    if (!users.success) throw new AppError("kick_identity_response_invalid", 502);
    const user = users.data.data[0];
    if (user.user_id !== config.broadcasterId) throw new AppError("authorize_configured_channel_owner", 403);
    if (generation !== this.generation) throw new AppError("kick_connection_changed_retry", 409);
    this.save({ ...token, expiresAt: Date.now() + token.expires_in * 1000, userId: user.user_id, username: user.name });
    // The new grant supersedes any refresh of the previous grant.
    this.generation++;
    this.refreshFlight = undefined;
    return { broadcasterId: user.user_id, authorizedUsername: user.name, chatType: this.config.chatType };
  }

  private validateToken(raw: unknown) {
    const result = tokenSchema.safeParse(raw);
    if (!result.success) throw new AppError("kick_token_response_invalid", 502);
    const scopes = result.data.scope.split(" ");
    if (KICK_SCOPES.some(scope => !scopes.includes(scope))) throw new AppError("kick_required_scopes_missing", 403);
    return result.data;
  }

  private save(tokens: Tokens) {
    this.repository.store.orm.insert(connections).values({ provider: "kick", secret: encrypt(JSON.stringify(tokens), this.config.key, "kick.tokens"), updatedAt: Date.now() })
      .onConflictDoUpdate({ target: connections.provider, set: { secret: encrypt(JSON.stringify(tokens), this.config.key, "kick.tokens"), updatedAt: Date.now() } }).run();
    this.repository.set("kick_auth_error", "");
  }

  private load(): Tokens {
    requireKick(this.config);
    const row = this.repository.store.orm.select().from(connections).where(eq(connections.provider, "kick")).get();
    if (!row) throw new AppError("kick_not_authorized", 503);
    const parsed = storedTokenSchema.safeParse(JSON.parse(decrypt(row.secret, this.config.key, "kick.tokens")));
    if (!parsed.success) throw new AppError("kick_stored_token_invalid", 503);
    if (parsed.data.userId !== this.config.broadcasterId) throw new AppError("kick_channel_changed_reauthorize", 503);
    return parsed.data;
  }

  async accessToken(forceRefresh = false): Promise<string> {
    if (this.refreshFlight) return this.refreshFlight;
    const current = this.load();
    if (!forceRefresh && current.expiresAt > Date.now() + 60000) return current.access_token;
    if (!this.refreshFlight) {
      const flight = this.refresh(current).finally(() => {
        if (this.refreshFlight === flight) this.refreshFlight = undefined;
      });
      this.refreshFlight = flight;
    }
    return this.refreshFlight;
  }

  async refreshProof() {
    await this.accessToken(true);
    return this.status();
  }

  private async refresh(current: Tokens) {
    const generation = this.generation;
    const config = requireKick(this.config);
    if (this.repository.setting("kick_auth_error")) throw new AppError("kick_refresh_failed_reauthorize", 503);
    try {
      const token = this.validateToken(await this.http(`${ID}/oauth/token`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", client_id: config.clientId, client_secret: config.clientSecret, refresh_token: current.refresh_token })
      }));
      if (generation !== this.generation) throw new AppError("kick_connection_changed_retry", 409);
      this.save({ ...token, expiresAt: Date.now() + token.expires_in * 1000, userId: current.userId, username: current.username });
      this.repository.set("kick_last_refresh_at", String(Date.now()));
      return token.access_token;
    } catch (error) {
      if (generation !== this.generation) throw new AppError("kick_connection_changed_retry", 409);
      if (!(error instanceof DeliveryError && error.outcome === "retry")) this.repository.set("kick_auth_error", "kick_refresh_failed_reauthorize");
      throw error;
    }
  }

  async verificationKey() {
    if (this.config.mode === "fixture") return this.config.fixturePublicKey!;
    if (this.cachedKey && this.cachedKey.until > Date.now()) return this.cachedKey.pem;
    const parsed = z.object({ data: z.object({ public_key: z.string().includes("BEGIN PUBLIC KEY") }) }).safeParse(
      await this.http(`${API}/public-key`, {})
    );
    if (!parsed.success) throw new AppError("trusted_kick_key_unavailable", 503);
    this.cachedKey = { pem: parsed.data.data.public_key, until: Date.now() + 3600000 };
    return this.cachedKey.pem;
  }

  async subscribe(events = KICK_EVENTS) {
    requireKick(this.config);
    const token = await this.accessToken();
    const existing = z.object({ data: z.array(z.object({ event: z.string(), version: z.number(), broadcaster_user_id: z.number() })) }).safeParse(
      await this.http(`${API}/events/subscriptions`, { headers: { Authorization: `Bearer ${token}` } })
    );
    if (!existing.success) throw new AppError("kick_subscription_response_invalid", 502);
    const missing = events.filter(event => !existing.data.data.some(item => item.event === event && item.version === 1 && item.broadcaster_user_id === this.config.broadcasterId));
    if (missing.length) {
      const result = z.object({ data: z.array(z.object({ name: z.string(), version: z.number(), error: z.string().optional(), subscription_id: z.string().optional() })) }).safeParse(
        await this.http(`${API}/events/subscriptions`, {
          method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ method: "webhook", events: missing.map(name => ({ name, version: 1 })) })
        }, true)
      );
      if (!result.success || missing.some(name => !result.data.data.some(item => item.name === name && item.version === 1 && !item.error && item.subscription_id))) {
        throw new AppError("kick_subscription_not_confirmed", 502);
      }
    }
    this.repository.set("kick_subscriptions_checked_at", String(Date.now()));
    return { events };
  }

  async reply(text = "KekBot foundation proof: verified event, durable receipt, real reply.") {
    requireKick(this.config);
    const content = z.string().min(1).max(500).parse(text);
    const safeContent = content.trimStart().startsWith("!") ? `KekBot: ${content}`.slice(0, 500) : content;
    const token = await this.accessToken();
    const result = z.object({ data: z.object({ message_id: z.string().min(1), is_sent: z.boolean() }) }).safeParse(
      await this.http(`${API}/chat`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ broadcaster_user_id: this.config.broadcasterId, type: this.config.chatType, content: safeContent })
      }, true)
    );
    if (!result.success) throw new DeliveryError("kick_reply_confirmation_invalid", "uncertain");
    if (!result.data.data.is_sent) throw new DeliveryError("kick_reply_not_sent", "failed");
    this.repository.set("kick_last_confirmed_reply", JSON.stringify({ messageId: result.data.data.message_id, at: Date.now(), chatType: this.config.chatType }));
    this.repository.set(`sent:${result.data.data.message_id}`, String(Date.now()));
  }

  async moderate(input: { action: string; userId: number; messageId?: string; reason: string; duration?: number }) {
    requireKick(this.config);
    if (input.action === "warn") return this.reply(`Warning for user ${input.userId}: ${input.reason}`.slice(0, 500));
    const required = input.action === "delete" ? "moderation:chat_message:manage" : "moderation:ban";
    if (!this.load().scope.split(" ").includes(required)) throw new AppError("kick_moderation_scope_missing_reauthorize", 403);
    const token = await this.accessToken();
    const path = input.action === "delete" ? `/chat/${encodeURIComponent(input.messageId ?? "")}` : "/moderation/bans";
    await this.http(`${API}${path}`, { method: input.action === "delete" ? "DELETE" : "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(input.action === "delete" ? {} : { body: JSON.stringify({ broadcaster_user_id: this.config.broadcasterId, user_id: input.userId, reason: input.reason.slice(0, 100), ...(input.action === "timeout" ? { duration: input.duration ?? 10 } : {}) }) }) }, true, input.action === "delete");
  }

  async disconnect() {
    let token: Tokens | undefined;
    try { token = this.load(); } catch { /* local disconnect also works after revocation */ }
    this.generation++;
    this.refreshFlight = undefined;
    this.repository.store.sqlite.prepare("DELETE FROM connections WHERE provider='kick'").run();
    this.repository.store.sqlite.prepare("DELETE FROM oauth_states").run();
    this.repository.set("kick_auth_error", "disconnected");
    if (token) {
      const outcomes = await Promise.allSettled((["access_token", "refresh_token"] as const).map(async kind => {
        const url = new URL(`${ID}/oauth/revoke`);
        url.search = new URLSearchParams({ token: token![kind], token_hint_type: kind }).toString();
        const response = await this.request(url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(10000), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
        return response.ok;
      }));
      return { disconnected: true, revocation: outcomes.some(outcome => outcome.status === "rejected") ? "uncertain" : outcomes.every(outcome => outcome.status === "fulfilled" && outcome.value) ? "confirmed" : "failed" };
    }
    return { disconnected: true, revocation: "not_available" };
  }

  invalidate() {
    this.generation++;
    this.refreshFlight = undefined;
    this.repository.store.sqlite.prepare("DELETE FROM connections WHERE provider='kick'").run();
    this.repository.store.sqlite.prepare("DELETE FROM oauth_states").run();
    this.repository.set("kick_auth_error", "connection_settings_changed_reauthorize");
  }

  async streamSample() {
    requireKick(this.config);
    const token = await this.accessToken();
    const response = z.object({ data: z.array(z.object({ broadcaster_user: z.object({ id: z.number().int().positive() }), viewer_count: z.number().int().nonnegative(), started_at: z.string(), title: z.string().max(500) })) }).safeParse(await this.http(`${API}/users/livestreams?user_id=${this.config.broadcasterId}`, { headers: { Authorization: `Bearer ${token}` } }));
    if (!response.success) throw new AppError("kick_stream_sample_invalid", 502);
    const stream = response.data.data.find(item => item.broadcaster_user.id === this.config.broadcasterId);
    return stream ? { viewers: stream.viewer_count, startedAt: stream.started_at, title: stream.title } : null;
  }

  status() {
    try {
      const token = this.load();
      return { authorized: true, authorizedUsername: token.username, broadcasterId: token.userId, chatType: this.config.chatType,
        scopes: token.scope.split(" "), expiresAt: token.expiresAt, error: this.repository.setting("kick_auth_error") || null,
        subscriptionsCheckedAt: this.repository.setting("kick_subscriptions_checked_at") ?? null,
        lastRefreshAt: this.repository.setting("kick_last_refresh_at") ?? null,
        lastConfirmedReply: this.repository.setting("kick_last_confirmed_reply") ?? null };
    } catch (error) {
      return { authorized: false, error: error instanceof AppError ? error.code : "kick_configuration_invalid" };
    }
  }
}
