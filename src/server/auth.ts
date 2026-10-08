import { argon2, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { digest, randomToken } from "./crypto.ts";
import { AppError } from "./errors.ts";
import type { Repository } from "./storage/repository.ts";

export const roles = ["owner", "admin", "moderator", "readonly"] as const;
export const permissions = ["configure", "operate", "moderate", "media", "engage", "invite", "accounts", "maintenance", "integrations", "tokens"] as const;
export type Permission = typeof permissions[number];
export type Actor = { id: string; role: typeof roles[number]; permissions: Permission[]; capabilityId?: string; discord?: { guild: string; channel: string; roles: string[]; user: string } };
type Account = { id: string; username: string; password: string; role: Actor["role"]; permissions: string; disabled: number };
const credentials = z.object({ username: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_.-]{2,31}$/), password: z.string().min(12).max(256) });
const expiry = 12 * 3600000;
let hashing = 0;

async function derive(password: string, salt: Buffer) {
  if (hashing >= 4) throw new AppError("password_service_busy", 429);
  hashing++;
  try {
    return await new Promise<Buffer>((resolve, reject) => argon2("argon2id", {
      message: password, nonce: salt, memory: 65536, passes: 3, parallelism: 1, tagLength: 32
    }, (error, key) => error ? reject(error) : resolve(key)));
  } finally { hashing--; }
}

export async function hashPassword(password: string) {
  credentials.shape.password.parse(password);
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `$argon2id$v=19$m=65536,t=3,p=1$${salt.toString("base64")}$${key.toString("base64")}`;
}

async function verifyPassword(password: string, encoded: string) {
  const match = encoded.match(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+)$/);
  // Equal expensive work for an unknown account; no account enumeration.
  const salt = match ? Buffer.from(match[1], "base64") : Buffer.alloc(16);
  const expected = match ? Buffer.from(match[2], "base64") : Buffer.alloc(32);
  const actual = await derive(password, salt);
  return Boolean(match) && actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function authorize(actor: Actor, permission?: Permission) {
  if (!permission || actor.role === "owner") return;
  if (["accounts", "maintenance", "integrations", "tokens"].includes(permission)) throw new AppError("owner_required", 403);
  if (actor.role === "readonly") throw new AppError("permission_denied", 403);
  if (actor.role === "moderator" && !["operate", "moderate", "media", "engage"].includes(permission)) throw new AppError("permission_denied", 403);
  if (actor.role === "admin" && !actor.permissions.includes(permission)) throw new AppError("permission_denied", 403);
}

export class AuthService {
  readonly repository: Repository;
  constructor(repository: Repository) { this.repository = repository; }
  private get db() { return this.repository.store.sqlite; }

  audit(actor: string, action: string, target: string, outcome = "confirmed") {
    this.db.prepare("INSERT INTO audit(actor,action,target,outcome,at) VALUES(?,?,?,?,?)").run(actor, action, target, outcome, Date.now());
  }

  async setup(token: string, input: unknown) {
    const parsed = credentials.parse(input);
    if (!token || digest(token) !== this.repository.setting("setup_token_hash") || Number(this.repository.setting("setup_expires")) <= Date.now()) throw new AppError("setup_token_invalid_or_expired", 403);
    const password = await hashPassword(parsed.password);
    return this.db.transaction(() => {
      if (this.db.prepare("SELECT 1 FROM accounts WHERE role='owner'").get() || digest(token) !== this.repository.setting("setup_token_hash") || Number(this.repository.setting("setup_expires")) <= Date.now()) throw new AppError("installation_already_claimed_or_expired", 409);
      const id = randomUUID();
      this.db.prepare("INSERT INTO accounts(id,username,password,role,created_at) VALUES(?,?,?,'owner',?)").run(id, parsed.username, password, Date.now());
      this.repository.set("setup_token_hash", "");
      this.audit(id, "installation.claim", id);
      return this.createSession(id);
    }).immediate();
  }

  async login(input: unknown) {
    const parsed = credentials.parse(input);
    const bucket = `login:${digest(parsed.username)}`;
    const attempts = JSON.parse(this.repository.setting(bucket) ?? '{"count":0,"until":0}') as { count: number; until: number };
    if (attempts.until > Date.now() && attempts.count >= 8) throw new AppError("login_rate_limited", 429);
    this.repository.set(bucket, JSON.stringify({ count: attempts.until > Date.now() ? attempts.count + 1 : 1, until: Date.now() + 900000 }));
    const account = this.db.prepare("SELECT * FROM accounts WHERE username=?").get(parsed.username) as Account | undefined;
    const valid = await verifyPassword(parsed.password, account?.password ?? "");
    const current = account && this.db.prepare("SELECT * FROM accounts WHERE id=?").get(account.id) as Account | undefined;
    if (!valid || !current || current.disabled || current.password !== account?.password) throw new AppError("invalid_credentials", 401);
    this.repository.set(bucket, "{\"count\":0,\"until\":0}");
    return this.createSession(current.id);
  }

  createSession(accountId: string) {
    const token = randomToken(), csrf = randomToken();
    this.db.prepare("INSERT INTO sessions(id,account_id,csrf,expires_at,created_at) VALUES(?,?,?,?,?)").run(digest(token), accountId, csrf, Date.now() + expiry, Date.now());
    return { token, csrf, expiresAt: Date.now() + expiry };
  }

  session(token: string | undefined) {
    if (!token || token.length > 128) throw new AppError("login_required", 401);
    const row = this.db.prepare("SELECT a.id,a.username,a.role,a.permissions,s.csrf,s.id AS sessionId FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.id=? AND s.expires_at>? AND a.disabled=0").get(digest(token), Date.now()) as (Omit<Account, "password" | "disabled"> & { csrf: string; sessionId: string }) | undefined;
    if (!row) throw new AppError("login_required", 401);
    return { ...row, permissions: JSON.parse(row.permissions) as Permission[] };
  }

  logout(sessionId: string) { this.db.prepare("DELETE FROM sessions WHERE id=?").run(sessionId); }

  invite(actor: Actor, role: string, grants: string[] = []) {
    authorize(actor, "invite");
    z.enum(["admin", "moderator", "readonly"]).parse(role);
    const allowed = z.array(z.enum(permissions)).max(10).parse(grants).filter(p => !["accounts", "integrations", "maintenance", "tokens"].includes(p));
    this.assertInvitationGrant(actor.id, role, allowed);
    const token = randomToken();
    this.db.prepare("INSERT INTO invitations(id,role,permissions,expires_at,created_by) VALUES(?,?,?,?,?)").run(digest(token), role, JSON.stringify(allowed), Date.now() + 86400000, actor.id);
    this.audit(actor.id, "account.invite", role);
    return { token, expiresAt: Date.now() + 86400000 };
  }

  private assertInvitationGrant(creator: string, role: string, grants: Permission[]) {
    const current = this.db.prepare("SELECT role,permissions FROM accounts WHERE id=? AND disabled=0").get(creator) as { role: Actor["role"]; permissions: string } | undefined;
    if (!current) throw new AppError("invitation_creator_unavailable", 403);
    const actor: Actor = { id: creator, role: current.role, permissions: JSON.parse(current.permissions) };
    authorize(actor, "invite");
    const effective = role === "moderator" ? ["operate", "moderate", "media", "engage"] : role === "admin" ? grants : [];
    if (actor.role !== "owner" && (grants.includes("invite") || effective.some(permission => !actor.permissions.includes(permission as Permission)))) throw new AppError("invitation_exceeds_admin_grant", 403);
  }

  async acceptInvite(token: string, input: unknown) {
    const parsed = credentials.parse(input);
    const password = await hashPassword(parsed.password);
    return this.db.transaction(() => {
      const invite = this.db.prepare("SELECT * FROM invitations WHERE id=? AND used_at IS NULL AND expires_at>?").get(digest(token), Date.now()) as { role: string; permissions: string; created_by: string } | undefined;
      if (!invite) throw new AppError("invitation_invalid_or_expired", 403);
      this.assertInvitationGrant(invite.created_by, invite.role, JSON.parse(invite.permissions));
      if (this.db.prepare("SELECT 1 FROM accounts WHERE username=?").get(parsed.username)) throw new AppError("username_unavailable", 409);
      const id = randomUUID();
      this.db.prepare("INSERT INTO accounts(id,username,password,role,permissions,created_at) VALUES(?,?,?,?,?,?)").run(id, parsed.username, password, invite.role, invite.permissions, Date.now());
      this.db.prepare("UPDATE invitations SET used_at=? WHERE id=?").run(Date.now(), digest(token));
      this.audit(id, "account.accept_invitation", id);
      return this.createSession(id);
    }).immediate();
  }

  disable(actor: Actor, id: string, disabled: boolean) {
    authorize(actor, "accounts");
    const target = this.db.prepare("SELECT role FROM accounts WHERE id=?").get(id) as { role: string } | undefined;
    if (!target || target.role === "owner") throw new AppError("cannot_disable_owner", 403);
    this.db.transaction(() => {
      this.db.prepare("UPDATE accounts SET disabled=? WHERE id=?").run(Number(disabled), id);
      this.db.prepare("DELETE FROM sessions WHERE account_id=?").run(id);
      this.audit(actor.id, "account.disable", id);
    }).immediate();
  }

  async changePassword(actor: Actor, currentPassword: string, password: string) {
    const current = this.db.prepare("SELECT password FROM accounts WHERE id=? AND disabled=0").get(actor.id) as { password: string } | undefined;
    if (!current || !await verifyPassword(currentPassword, current.password)) throw new AppError("invalid_credentials", 401);
    const encoded = await hashPassword(password);
    this.db.transaction(() => {
      const changed = this.db.prepare("UPDATE accounts SET password=? WHERE id=? AND password=? AND disabled=0").run(encoded, actor.id, current.password);
      if (!changed.changes) throw new AppError("account_changed_retry", 409);
      this.db.prepare("DELETE FROM sessions WHERE account_id=?").run(actor.id);
      this.audit(actor.id, "account.password", actor.id);
    }).immediate();
  }
}
