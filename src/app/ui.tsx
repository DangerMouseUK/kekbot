"use client";
import type { Actor, Permission } from "../server/auth.ts";
import type { ConfigDocument } from "../server/domain/catalog.ts";
export type Row = Record<string, unknown>;
export type WorkPage = { items: Row[]; nextCursor: string | null };
export type Snapshot = { settings: Row; documents: ConfigDocument[]; player: { state: string; version: number; current: string | null; volume: number; error?: string }; media: Row[]; jobs: Row[]; uncertainJobs: WorkPage; audit: Row[]; viewers: Row[]; leaderboard: Row[]; redemptions: Row[]; pendingRedemptions: WorkPage; incidents: Row[]; incidentMode?: { preset: string; endsAt: number } | null; activities: Row[]; accounts?: Row[]; tokens?: Row[]; assets?: Row[]; kick: Row; integrations: Record<string, boolean>; diagnostics: Row; mode: string; healthy: boolean };
export type Session = { claimed: boolean; actor: Actor & { username: string } | null; csrf?: string; mode: string };
export type Run = (action: string, input?: Row) => Promise<void>;
export function permitted(actor: Actor | null, permission: Permission) { return Boolean(actor && (actor.role === "owner" || actor.role === "admin" && actor.permissions.includes(permission) || actor.role === "moderator" && ["operate", "moderate", "media", "engage"].includes(permission))); }
export function text(value: unknown) { return typeof value === "object" ? JSON.stringify(value) : String(value ?? "Unavailable"); }
export function Table({ rows, columns }: { rows: Row[]; columns: string[] }) { return rows.length ? <div className="table-scroll"><table><thead><tr>{columns.map(key => <th key={key}>{key.replaceAll("_", " ")}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={String(row.id ?? i)}>{columns.map(key => <td key={key}>{/(?:_at|At|last_seen)$/.test(key) && Number(row[key]) > 0 ? new Date(Number(row[key])).toLocaleString() : text(row[key])}</td>)}</tr>)}</tbody></table></div> : <p className="empty">Nothing recorded yet.</p>; }
export function ActionForm({ action, fields, button, run, busy }: { action: string; fields: string[]; button: string; run: Run; busy: boolean }) {
  return <form className="inline-form" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); const values: Row = Object.fromEntries(form); for (const key of ["version", "value", "amount"]) if (values[key] !== undefined) values[key] = Number(values[key]); if (fields.includes("acknowledge")) values.acknowledge = form.get("acknowledge") === "on"; void run(action, values); }}>
    <h3>{button}</h3><div className="fields">{fields.map(field => <label key={field}>{field.replace(/^./, s => s.toUpperCase())}<input name={field} type={field === "acknowledge" ? "checkbox" : ["version", "value", "amount"].includes(field) ? "number" : "text"} required={field !== "acknowledge"} /></label>)}</div><button disabled={busy}>{button}</button>
  </form>;
}
