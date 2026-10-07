import { randomUUID } from "node:crypto";
import { writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { Actor } from "../auth.ts";
import { digest, randomToken } from "../crypto.ts";
import { AppError } from "../errors.ts";
import { configSchemas } from "./catalog.ts";
import { State } from "./state.ts";

type Alert = { id: string; text: string; duration: number; priority: number; image: string | null; sound: string | null; volume: number; animation: string; startsAt: number; endsAt: number };
export function inspectAsset(encoded: string) {
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length < 12 || bytes.length > 8 * 1024 * 1024 || bytes.toString("base64") !== encoded) throw new AppError("invalid_asset_size_or_encoding", 400);
  let format: string | undefined;
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) format = "png";
  else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) format = "jpg";
  else if (["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString())) format = "gif";
  else if (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP") format = "webp";
  else if (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WAVE") format = "wav";
  else if (bytes.subarray(0, 4).toString() === "OggS") format = "ogg";
  else if (bytes.subarray(0, 3).toString() === "ID3" || bytes[0] === 255 && (bytes[1] & 224) === 224) format = "mp3";
  if (!format) throw new AppError("unsupported_asset_format", 415);
  return { bytes, format };
}
export function renderTemplate(template: string, variables: Record<string, string | number>) {
  return template.replace(/\{([a-z][a-z0-9_]*)\}/g, (_, key: string) => String(variables[key] ?? `[${key} unavailable]`)).slice(0, 500);
}

export class PresentationService {
  readonly state: State;
  constructor(state: State) { this.state = state; }
  alert(event: string, variables: Record<string, string | number>, delivery: string, preview = false) {
    const configs = this.state.list("alert").filter(doc => doc.data.enabled && doc.data.event === event);
    const rendered = configs.map(doc => ({ ...doc.data, id: `${delivery}:${doc.id}`, text: renderTemplate(doc.data.template, variables), startsAt: 0, endsAt: 0 }));
    if (preview) return { preview: true, alerts: rendered };
    const queue = JSON.parse(this.state.repository.setting("alert_queue") ?? "[]") as Alert[];
    for (const alert of rendered) if (!queue.some(item => item.id === alert.id)) queue.push(alert);
    this.state.repository.set("alert_queue", JSON.stringify(queue.slice(-50)));
    if (rendered.length) {
      this.state.observe(`alert:${delivery}`, "alerts.queued", rendered.length);
      this.state.emit("alert", { id: delivery });
      this.state.notify("alert", rendered.map(alert => alert.text).join(" · "), delivery);
    }
    return { queued: rendered.length };
  }

  tick(now = Date.now()) {
    const current = JSON.parse(this.state.repository.setting("active_alert") ?? "null") as Alert | null;
    if (current && current.endsAt > now) return;
    const queue = JSON.parse(this.state.repository.setting("alert_queue") ?? "[]") as Alert[];
    if (!queue.length) {
      if (current) { this.state.repository.set("active_alert", "null"); this.state.emit("alert", {}); }
      return;
    }
    queue.sort((a, b) => b.priority - a.priority);
    const next = queue.shift()!;
    next.startsAt = now; next.endsAt = now + next.duration * 1000;
    this.state.repository.set("active_alert", JSON.stringify(next));
    this.state.repository.set("alert_queue", JSON.stringify(queue));
    this.state.emit("alert", { id: next.id });
  }

  goal(metric: string, amount: number, receipt: string) {
    for (const doc of this.state.list("goal").filter(g => g.data.enabled && g.data.metric === metric && !g.data.completed)) {
      const dedupe = `goal:${doc.id}:${receipt}`;
      if (this.state.db.prepare("SELECT 1 FROM observations WHERE id=?").get(dedupe)) continue;
      const value = Math.min(1000000000, doc.data.value + amount), completed = value >= doc.data.target;
      this.state.db.prepare("UPDATE documents SET data=?,version=version+1,updated_at=? WHERE id=?").run(JSON.stringify({ ...doc.data, value, completed }), Date.now(), doc.id);
      this.state.observe(dedupe, "goals.increments", amount);
      if (completed) {
        this.alert("goal", { name: doc.data.name, value, target: doc.data.target }, dedupe);
        this.state.notify("goal", `${doc.data.name} completed: ${value}/${doc.data.target}`, dedupe);
      }
      this.state.emit("goal", { id: doc.id });
    }
  }

  adjustGoal(actor: Actor, id: string, value: number, version: number) {
    this.state.assertActor(actor, "operate");
    z.number().int().min(0).max(1000000000).parse(value);
    return this.state.db.transaction(() => {
      const doc = this.state.document(id);
      if (!doc || doc.kind !== "goal" || doc.version !== version) throw new AppError("goal_changed_reload", 409);
      const goal = configSchemas.goal.parse(doc.data);
      this.state.db.prepare("UPDATE documents SET data=?,version=version+1,updated_at=? WHERE id=?").run(JSON.stringify({ ...goal, value, completed: value >= goal.target }), Date.now(), id);
      if (value >= goal.target && !goal.completed) {
        this.alert("goal", { name: goal.name, value, target: goal.target }, `goal:${id}:${version}`);
        this.state.notify("goal", `${goal.name} completed: ${value}/${goal.target}`, `goal:${id}:${version}`);
      }
      this.state.audit(actor.id, "goal.adjust", id);
      return this.state.document(id);
    }).immediate();
  }

  upload(actor: Actor, name: string, encoded: string) {
    this.state.assertActor(actor, "configure");
    z.string().max(100).parse(name);
    const { bytes, format } = inspectAsset(encoded);
    const id = `${randomUUID()}.${format}`;
    writeFileSync(join(/* turbopackIgnore: true */ this.state.config.assets, id), bytes, { flag: "wx", mode: 0o600 });
    this.state.repository.set(`asset:${id}`, JSON.stringify({ id, name, bytes: bytes.length, format }));
    this.state.audit(actor.id, "asset.upload", id);
    return { id, name, bytes: bytes.length, format };
  }
  deleteAsset(actor: Actor, id: string) {
    this.state.assertActor(actor, "configure");
    if (this.state.list("alert").some(doc => doc.data.image === id || doc.data.sound === id)) throw new AppError("asset_in_use", 409);
    if (!this.state.repository.setting(`asset:${id}`)) throw new AppError("asset_not_found", 404);
    unlinkSync(join(/* turbopackIgnore: true */ this.state.config.assets, id));
    this.state.db.prepare("DELETE FROM settings WHERE key=?").run(`asset:${id}`);
    this.state.audit(actor.id, "asset.delete", id);
  }
  asset(id: string) {
    if (!/^[a-f0-9-]{36}\.(png|jpg|gif|webp|wav|ogg|mp3)$/.test(id) || !this.state.repository.setting(`asset:${id}`)) throw new AppError("asset_not_found", 404);
    const types: Record<string, string> = { png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp", wav: "audio/wav", ogg: "audio/ogg", mp3: "audio/mpeg" };
    return { bytes: readFileSync(join(/* turbopackIgnore: true */ this.state.config.assets, id)), type: types[id.split(".")[1]] };
  }

  issueToken(actor: Actor, name: string, kind: "widget" | "player" | "api", scopes: string[]) {
    this.state.assertActor(actor, "tokens");
    z.string().min(1).max(80).parse(name);
    z.array(z.string().min(1).max(110)).min(1).max(10).parse(scopes);
    if (kind === "api") {
      if (scopes.some(scope => !["read", "configure", "operate", "moderate", "media", "engage"].includes(scope))) throw new AppError("invalid_api_scope", 400);
    } else if (scopes.length !== 1 || !scopes[0].startsWith("widget:") || this.state.document(scopes[0].slice(7))?.kind !== "widget") throw new AppError("invalid_widget_scope", 400);
    if (kind === "player" && this.state.document(scopes[0].slice(7))?.data.type !== "player") throw new AppError("player_widget_required", 400);
    const token = randomToken(), id = digest(token);
    this.state.db.prepare("INSERT INTO access_tokens(id,name,kind,scopes,created_at,account_id) VALUES(?,?,?,?,?,?)").run(id, name, kind, JSON.stringify(scopes), Date.now(), actor.id);
    this.state.audit(actor.id, "token.create", `${kind}:${name}`);
    return { id, token, kind, scopes };
  }
  token(token: string, kind: "widget" | "player" | "api", scope: string) {
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(token)) throw new AppError("invalid_access_token", 401);
    const row = this.state.db.prepare("SELECT t.*,a.disabled FROM access_tokens t JOIN accounts a ON a.id=t.account_id WHERE t.id=? AND t.kind=? AND (t.expires_at IS NULL OR t.expires_at>?) AND a.disabled=0").get(digest(token), kind, Date.now()) as { id: string; account_id: string; scopes: string } | undefined;
    if (!row || !(JSON.parse(row.scopes) as string[]).includes(scope)) throw new AppError("invalid_or_revoked_access_token", 401);
    return row;
  }
  revoke(actor: Actor, id: string) {
    this.state.assertActor(actor, "tokens");
    this.state.db.prepare("DELETE FROM access_tokens WHERE id=?").run(id);
    this.state.audit(actor.id, "token.revoke", id);
  }

  widget(id: string) {
    const doc = this.state.document(id);
    if (!doc || doc.kind !== "widget") throw new AppError("widget_not_found", 404);
    const config = configSchemas.widget.parse(doc.data);
    if (!config.enabled) return { config, data: null };
    const limit = config.limit;
    let data: unknown = null;
    if (config.type === "alerts") data = JSON.parse(this.state.repository.setting("active_alert") ?? "null");
    else if (config.type === "chat") data = (this.state.db.prepare("SELECT payload FROM receipts WHERE event_type='chat.message.sent' AND payload IS NOT NULL ORDER BY received_at DESC LIMIT ?").all(limit) as { payload: string }[]).reverse().map(row => { const m = JSON.parse(row.payload); return { name: m.sender.username ?? "Viewer", text: m.content }; });
    else if (["player", "nowplaying", "queue"].includes(config.type)) {
      const player = JSON.parse(this.state.repository.setting("player") ?? '{"state":"paused","current":null,"volume":50,"version":0}');
      const current = player.current ? this.state.db.prepare("SELECT id,video_id,title,duration FROM media WHERE id=?").get(player.current) : null;
      data = { player: { state: player.state, volume: player.volume, version: player.version, generation: player.generation ?? 0, current: player.current, error: player.error ?? null }, current, queue: this.state.db.prepare("SELECT id,title,duration FROM media WHERE status='approved' ORDER BY position,created_at LIMIT ?").all(limit), fixture: this.state.config.mode === "fixture" };
    } else if (["goal", "multigoal"].includes(config.type)) data = this.state.list("goal").filter(goal => goal.data.enabled && (!config.target || goal.id === config.target)).slice(0, limit).map(goal => ({ id: goal.id, ...goal.data }));
    else if (config.type === "leaderboard") data = this.state.db.prepare("SELECT coalesce(v.name,'Viewer') AS name,sum(l.amount) AS balance FROM ledger l LEFT JOIN viewers v ON v.id=l.viewer GROUP BY l.viewer ORDER BY balance DESC LIMIT ?").all(limit);
    else if (["poll", "raffle"].includes(config.type)) data = this.state.list(config.type as "poll" | "raffle").filter(d => !config.target || d.id === config.target).slice(-1).map(d => ({ name: d.data.name, status: d.data.status, options: "options" in d.data ? d.data.options : undefined, endsAt: d.data.endsAt, results: this.state.db.prepare("SELECT choice,count(*) AS count FROM participation WHERE activity=? GROUP BY choice").all(d.id), winners: "winners" in d.data ? d.data.winners.map(viewer => (this.state.db.prepare("SELECT name FROM viewers WHERE id=?").get(viewer) as { name: string } | undefined)?.name ?? "Viewer name unavailable") : undefined }));
    else if (config.type === "status") {
      const sample = JSON.parse(this.state.repository.setting("stream_sample") ?? "null") as { viewers: number; at: number } | null;
      data = { live: this.state.repository.setting("stream_is_live") ?? "unavailable", startedAt: this.state.repository.setting("stream_started_at") ?? null, viewers: sample && Date.now() - sample.at < 120000 && !this.state.repository.setting("stream_sample_error") ? sample.viewers : null, sampledAt: sample?.at ?? null };
    }
    else if (["eventfeed", "supporter", "activity"].includes(config.type)) data = (this.state.db.prepare("SELECT event_type,payload,received_at FROM receipts WHERE event_type IN ('channel.followed','channel.subscription.new','channel.subscription.renewal','channel.subscription.gifts') ORDER BY received_at DESC LIMIT ?").all(config.type === "supporter" ? 1 : limit) as { event_type: string; payload: string; received_at: number }[]).map(row => { const value = row.payload ? JSON.parse(row.payload) : {}; return { event: row.event_type, name: value.follower?.username ?? value.subscriber?.username ?? value.gifter?.username ?? "Supporter", at: row.received_at }; });
    else if (config.type === "counter") data = { value: Number(this.state.repository.setting(`counter:${config.target}`) ?? 0) };
    else if (config.type === "shoutout") data = JSON.parse(this.state.repository.setting("last_shoutout") ?? "null");
    else if (config.type === "socials") data = { text: this.state.settings.socials };
    else if (config.type === "countdown") data = { endsAt: config.endsAt, text: config.text };
    return { config, data };
  }
}
