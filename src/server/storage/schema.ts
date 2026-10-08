import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(), value: text("value").notNull(),
  expiresAt: integer("expires_at"), jobId: text("job_id")
});

export const receipts = sqliteTable("receipts", {
  id: text("id").primaryKey(), eventType: text("event_type").notNull(),
  payload: text("payload"), receivedAt: integer("received_at").notNull()
}, table => [index("receipts_received_at").on(table.receivedAt)]);

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(), kind: text("kind", { enum: ["kick.event", "kick.reply", "proof.record", "kick.action", "discord.send", "discord.interaction", "media.validate"] }).notNull(),
  payload: text("payload").notNull(),
  payloadState: text("payload_state").notNull().default("plain"),
  payloadExpiresAt: integer("payload_expires_at"),
  viewerIds: text("viewer_ids").notNull().default("[]"),
  status: text("status", { enum: ["pending", "running", "succeeded", "failed", "uncertain"] }).notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0), dueAt: integer("due_at").notNull(),
  leaseUntil: integer("lease_until"), leaseOwner: text("lease_owner"), lastError: text("last_error"),
  createdAt: integer("created_at").notNull()
}, table => [
  index("jobs_due").on(table.status, table.dueAt),
  index("jobs_retention").on(table.status, table.createdAt),
  check("jobs_status", sql`${table.status} IN ('pending','running','succeeded','failed','uncertain')`),
  check("jobs_attempts", sql`${table.attempts} >= 0`)
]);

export const connections = sqliteTable("connections", {
  provider: text("provider").primaryKey(), secret: text("secret").notNull(), updatedAt: integer("updated_at").notNull()
});

export const oauthStates = sqliteTable("oauth_states", {
  id: text("id").primaryKey(), verifier: text("verifier").notNull(),
  browserBinding: text("browser_binding").notNull(), expiresAt: integer("expires_at").notNull()
});

export const leases = sqliteTable("leases", {
  name: text("name").primaryKey(), owner: text("owner").notNull(), expiresAt: integer("expires_at").notNull()
});

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(), username: text("username").notNull().unique(), password: text("password").notNull(),
  role: text("role", { enum: ["owner", "admin", "moderator", "readonly"] }).notNull(),
  permissions: text("permissions").notNull().default("[]"), disabled: integer("disabled").notNull().default(0),
  createdAt: integer("created_at").notNull()
}, t => [check("account_role", sql`${t.role} IN ('owner','admin','moderator','readonly')`)]);

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  csrf: text("csrf").notNull(), expiresAt: integer("expires_at").notNull(), createdAt: integer("created_at").notNull()
});

export const invitations = sqliteTable("invitations", {
  id: text("id").primaryKey(), role: text("role").notNull(), permissions: text("permissions").notNull(),
  expiresAt: integer("expires_at").notNull(), createdBy: text("created_by").notNull(), usedAt: integer("used_at")
});

// Bounded, validated declarative configuration. Mutable rows use optimistic versions.
export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(), kind: text("kind").notNull(), data: text("data").notNull(),
  version: integer("version").notNull().default(1), updatedAt: integer("updated_at").notNull()
}, t => [index("documents_kind").on(t.kind)]);

export const audit = sqliteTable("audit", {
  id: integer("id").primaryKey({ autoIncrement: true }), actor: text("actor").notNull(), action: text("action").notNull(),
  target: text("target").notNull(), outcome: text("outcome").notNull(), at: integer("at").notNull()
});

export const liveEvents = sqliteTable("live_events", {
  id: integer("id").primaryKey({ autoIncrement: true }), topic: text("topic").notNull(), data: text("data").notNull(), at: integer("at").notNull()
});

export const accessTokens = sqliteTable("access_tokens", {
  id: text("id").primaryKey(), name: text("name").notNull(), kind: text("kind").notNull(),
  scopes: text("scopes").notNull(), createdAt: integer("created_at").notNull(), expiresAt: integer("expires_at"),
  accountId: text("account_id").references(() => accounts.id, { onDelete: "cascade" })
});

export const viewers = sqliteTable("viewers", {
  id: text("id").primaryKey(), name: text("name").notNull(), role: text("role").notNull(),
  lastSeen: integer("last_seen").notNull(), messages: integer("messages").notNull().default(0),
  watchMinutes: integer("watch_minutes").notNull().default(0)
});

export const media = sqliteTable("media", {
  id: text("id").primaryKey(), videoId: text("video_id").notNull(), requester: text("requester").notNull(),
  title: text("title"), uploader: text("uploader"), duration: integer("duration"),
  status: text("status").notNull(), position: integer("position").notNull(), version: integer("version").notNull().default(1),
  error: text("error"), createdAt: integer("created_at").notNull()
}, t => [index("media_status_position").on(t.status, t.position), index("media_history").on(t.createdAt, t.id)]);

export const ledger = sqliteTable("ledger", {
  id: text("id").primaryKey(), viewer: text("viewer").notNull(), amount: integer("amount").notNull(),
  reason: text("reason").notNull(), at: integer("at").notNull()
}, t => [index("ledger_viewer").on(t.viewer)]);

export const redemptions = sqliteTable("redemptions", {
  id: text("id").primaryKey(), viewer: text("viewer").notNull(), reward: text("reward").notNull(),
  cost: integer("cost").notNull(), status: text("status").notNull(), createdAt: integer("created_at").notNull()
});

export const participation = sqliteTable("participation", {
  id: text("id").primaryKey(), activity: text("activity").notNull(), viewer: text("viewer").notNull(),
  choice: text("choice").notNull(), at: integer("at").notNull()
}, t => [index("participation_activity").on(t.activity)]);

export const incidents = sqliteTable("incidents", {
  id: text("id").primaryKey(), viewer: text("viewer").notNull(), rule: text("rule").notNull(),
  action: text("action").notNull(), reason: text("reason").notNull(), jobId: text("job_id"), at: integer("at").notNull()
});

export const observations = sqliteTable("observations", {
  id: text("id").primaryKey(), metric: text("metric").notNull(), value: integer("value").notNull(), at: integer("at").notNull()
}, t => [index("observations_at").on(t.at)]);
