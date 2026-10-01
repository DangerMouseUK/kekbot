import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(), value: text("value").notNull()
});

export const receipts = sqliteTable("receipts", {
  id: text("id").primaryKey(), eventType: text("event_type").notNull(),
  payload: text("payload"), receivedAt: integer("received_at").notNull()
}, table => [index("receipts_received_at").on(table.receivedAt)]);

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(), kind: text("kind", { enum: ["kick.event", "kick.reply", "proof.record"] }).notNull(),
  payload: text("payload").notNull(),
  status: text("status", { enum: ["pending", "running", "succeeded", "failed", "uncertain"] }).notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0), dueAt: integer("due_at").notNull(),
  leaseUntil: integer("lease_until"), leaseOwner: text("lease_owner"), lastError: text("last_error"),
  createdAt: integer("created_at").notNull()
}, table => [
  index("jobs_due").on(table.status, table.dueAt),
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
