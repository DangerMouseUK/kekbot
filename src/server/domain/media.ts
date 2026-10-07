import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError } from "../errors.ts";
import type { Actor } from "../auth.ts";
import { State } from "./state.ts";
import { PresentationService } from "./presentation.ts";

export type MediaItem = { id: string; video_id: string; requester: string; title: string | null; uploader: string | null; duration: number | null; status: string; position: number; version: number; error: string | null; created_at: number };
type Player = { state: "playing" | "paused"; volume: number; current: string | null; version: number; generation?: number; lease?: string; credential?: string; leaseUntil?: number; error?: string };

export function videoId(input: string) {
  if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;
  let url: URL;
  try { url = new URL(input); } catch { throw new AppError("invalid_youtube_url", 400); }
  if (url.protocol !== "https:" || url.username || url.password || url.port) throw new AppError("invalid_youtube_url", 400);
  let id: string | null = null;
  if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)) {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else if (/^\/(shorts|embed)\//.test(url.pathname)) id = url.pathname.split("/")[2];
  } else if (url.hostname === "youtu.be") id = url.pathname.slice(1);
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) throw new AppError("invalid_youtube_url", 400);
  return id;
}

export class MediaService {
  readonly state: State;
  constructor(state: State) { this.state = state; }
  get player(): Player { return JSON.parse(this.state.repository.setting("player") ?? '{"state":"paused","volume":50,"current":null,"version":0}'); }
  private setPlayer(player: Player) { this.state.repository.set("player", JSON.stringify(player)); this.state.emit("media", { version: player.version }); }
  item(id: string) { return this.state.db.prepare("SELECT * FROM media WHERE id=?").get(id) as MediaItem | undefined; }

  request(input: string, requester: string, id: string = randomUUID(), moderator = false) {
    const settings = this.state.settings;
    if (!settings.mediaEnabled) throw new AppError("media_disabled", 409);
    const video = videoId(input);
    return this.state.db.transaction(() => {
      const existing = this.item(id);
      if (existing) return existing;
      const active = this.state.db.prepare("SELECT * FROM media WHERE status IN ('validating','pending','approved','playing')").all() as MediaItem[];
      if (active.length >= settings.capacity) throw new AppError("queue_full", 409);
      if (!settings.allowDuplicates && active.some(item => item.video_id === video)) throw new AppError("video_already_queued", 409);
      if (!moderator && active.filter(item => item.requester === requester).length >= settings.perUser) throw new AppError("request_limit", 429);
      const last = Number(this.state.repository.setting(`request:${requester}`) ?? 0);
      if (!moderator && Date.now() - last < settings.requestCooldown * 1000) throw new AppError("request_cooldown", 429);
      const position = (this.state.db.prepare("SELECT coalesce(max(position),0)+1 AS n FROM media").get() as { n: number }).n;
      this.state.db.prepare("INSERT INTO media(id,video_id,requester,status,position,created_at) VALUES(?,?,?,'validating',?,?)").run(id, video, requester, position, Date.now());
      this.state.repository.set(`request:${requester}`, String(Date.now()));
      this.state.effect(`metadata:${id}`, "media.validate", { id, moderator });
      this.state.audit(requester, "media.request", id, "pending");
      return this.item(id)!;
    }).immediate();
  }

  async validate(id: string, moderator: boolean, request: typeof fetch = fetch) {
    const item = this.item(id);
    if (!item || item.status !== "validating") return;
    try {
      let metadata: { title: string; uploader: string; duration: number };
      if (this.state.config.mode === "fixture") metadata = { title: `Fixture video ${item.video_id}`, uploader: "Fixture creator", duration: 180 };
      else {
        const key = this.state.secret<{ key: string }>("youtube")?.key;
        if (!key) throw new AppError("youtube_key_missing", 409);
        const url = new URL("https://www.googleapis.com/youtube/v3/videos");
        url.search = new URLSearchParams({ part: "snippet,contentDetails,status", id: item.video_id, key }).toString();
        let response: Response;
        try { response = await request(url, { signal: AbortSignal.timeout(10000), redirect: "error" }); }
        catch { throw new AppError("youtube_unavailable", 502); }
        if (!response.ok) throw new AppError(response.status === 403 ? "youtube_quota_or_key_rejected" : "youtube_unavailable", 502);
        const parsed = z.object({ items: z.array(z.object({ snippet: z.object({ title: z.string().max(500), channelTitle: z.string().max(500) }), contentDetails: z.object({ duration: z.string() }), status: z.object({ embeddable: z.boolean(), privacyStatus: z.string() }) })) }).parse(await response.json());
        const video = parsed.items[0];
        if (!video) throw new AppError("youtube_video_unavailable", 422);
        if (!video.status.embeddable || video.status.privacyStatus === "private") throw new AppError("youtube_embedding_disabled", 422);
        const duration = video.contentDetails.duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
        if (!duration) throw new AppError("youtube_live_or_duration_unavailable", 422);
        metadata = { title: video.snippet.title, uploader: video.snippet.channelTitle, duration: Number(duration[1] ?? 0) * 3600 + Number(duration[2] ?? 0) * 60 + Number(duration[3] ?? 0) };
      }
      const settings = this.state.settings;
      if (metadata.duration <= 0 || metadata.duration > settings.maxDuration) throw new AppError("video_duration_rejected", 422);
      if (settings.blockedUploaders.some(name => name.toLowerCase() === metadata.uploader.toLowerCase()) || settings.blockedTitles.some(term => metadata.title.toLowerCase().includes(term.toLowerCase()))) throw new AppError("video_rule_rejected", 422);
      this.state.db.transaction(() => {
        const status = moderator || settings.autoApprove ? "approved" : "pending";
        const changed = this.state.db.prepare("UPDATE media SET title=?,uploader=?,duration=?,status=?,version=version+1 WHERE id=? AND status='validating'").run(metadata.title, metadata.uploader, metadata.duration, status, id);
        if (changed.changes) {
          this.state.audit("worker", "media.validated", id, status);
          this.state.notify("media", `${status === "pending" ? "Approval requested" : "Queued"}: ${metadata.title} · item ${id} · version ${this.item(id)!.version}`, `media:${id}`);
          this.state.observe(`media:${id}`, "media.requests");
          new PresentationService(this.state).goal("media", 1, id);
          new PresentationService(this.state).alert("media", { name: metadata.title, user: item.requester, title: metadata.title }, `media:${id}`);
        }
      }).immediate();
    } catch (error) {
      const code = error instanceof AppError ? error.code : "youtube_response_invalid";
      this.state.db.prepare("UPDATE media SET status='failed',error=?,version=version+1 WHERE id=? AND status='validating'").run(code, id);
      this.state.audit("worker", "media.validation", id, "failed");
    }
  }

  decide(actor: Actor, id: string, version: number, action: "approve" | "reject" | "remove") {
    this.state.assertActor(actor, "media");
    return this.state.db.transaction(() => {
      const item = this.item(id);
      if (!item || item.version !== version) throw new AppError("media_changed_reload", 409);
      if (item.status === "playing" || !["pending", "approved", "failed"].includes(item.status) || action === "approve" && item.status !== "pending") throw new AppError("invalid_media_transition", 409);
      const status = action === "approve" ? "approved" : action === "reject" ? "rejected" : "removed";
      this.state.db.prepare("UPDATE media SET status=?,version=version+1 WHERE id=? AND version=?").run(status, id, version);
      this.state.audit(actor.id, `media.${action}`, id);
      return this.item(id)!;
    }).immediate();
  }

  reorder(actor: Actor, ids: string[]) {
    this.state.assertActor(actor, "media");
    this.state.db.transaction(() => {
      const current = this.state.db.prepare("SELECT id FROM media WHERE status='approved'").all() as { id: string }[];
      if (ids.length !== current.length || new Set(ids).size !== ids.length || current.some(row => !ids.includes(row.id))) throw new AppError("queue_changed_reload", 409);
      for (const [index, id] of ids.entries()) this.state.db.prepare("UPDATE media SET position=?,version=version+1 WHERE id=?").run(index + 1, id);
      this.state.audit(actor.id, "media.reorder", "queue");
    }).immediate();
  }

  clear(actor: Actor) {
    this.state.assertActor(actor, "media");
    this.state.db.transaction(() => {
      this.state.db.prepare("UPDATE media SET status='removed',version=version+1 WHERE status IN ('validating','pending','approved')").run();
      this.state.audit(actor.id, "media.clear", "queue");
    }).immediate();
  }

  private advance(player: Player) {
    const next = this.state.db.prepare("SELECT id FROM media WHERE status='approved' ORDER BY position,created_at,id LIMIT 1").get() as { id: string } | undefined;
    player.current = next?.id ?? null;
    player.version++;
    player.error = undefined;
    if (next) this.state.db.prepare("UPDATE media SET status='playing',version=version+1 WHERE id=? AND status='approved'").run(next.id);
    else player.state = "paused";
  }

  control(actor: Actor, action: "pause" | "resume" | "skip" | "volume", expected: number, volume?: number) {
    this.state.assertActor(actor, "media");
    return this.state.db.transaction(() => {
      const player = this.player;
      if (player.version !== expected) throw new AppError("player_changed_reload", 409);
      if (action === "volume") player.volume = z.number().min(0).max(100).parse(volume);
      else if (action === "pause") player.state = "paused";
      else if (action === "resume") {
        if (player.error) player.generation = (player.generation ?? 0) + 1;
        player.state = "playing";
        if (!player.current) this.advance(player);
        player.error = undefined;
        player.leaseUntil ??= Date.now() + 15000;
      } else {
        if (!player.current) throw new AppError("player_has_no_current_item", 409);
        this.state.db.prepare("UPDATE media SET status='skipped',version=version+1 WHERE id=? AND status='playing'").run(player.current);
        this.advance(player);
      }
      player.version++;
      this.setPlayer(player);
      this.state.audit(actor.id, `player.${action}`, player.current ?? "queue");
      return player;
    }).immediate();
  }

  lease(credential: string, currentLease?: string) {
    return this.state.db.transaction(() => {
      const player = this.player;
      if (player.lease && player.leaseUntil && player.leaseUntil > Date.now() && (player.lease !== currentLease || player.credential !== credential)) throw new AppError("another_player_is_active", 409);
      player.lease = currentLease && player.lease === currentLease && player.credential === credential ? currentLease : randomUUID();
      player.credential = credential;
      player.leaseUntil = Date.now() + 15000;
      this.setPlayer(player);
      return { lease: player.lease, until: player.leaseUntil };
    }).immediate();
  }

  acknowledge(credential: string, lease: string, id: string, version: number, result: "ended" | "error" | "blocked", error?: string) {
    return this.state.db.transaction(() => {
      const player = this.player;
      if (player.credential !== credential || player.lease !== lease || !player.leaseUntil || player.leaseUntil <= Date.now() || player.current !== id || player.version !== version || player.state !== "playing") throw new AppError("stale_player_acknowledgement", 409);
      if (result === "ended") {
        this.state.db.prepare("UPDATE media SET status='completed',version=version+1 WHERE id=? AND status='playing'").run(id);
        this.state.observe(`played:${id}`, "media.completed");
        this.advance(player);
      } else {
        player.state = "paused";
        player.error = result === "blocked" ? "autoplay_blocked_moderator_resume_required" : `playback_error_${error?.replace(/[^a-z0-9_]/gi, "").slice(0, 30) ?? "unknown"}`;
        player.version++;
      }
      this.setPlayer(player);
      return { accepted: true, version: player.version };
    }).immediate();
  }

  recover() {
    const player = this.player;
    this.setPlayer({ ...player, state: "paused", version: player.version + 1, generation: (player.generation ?? 0) + 1, lease: undefined, credential: undefined, leaseUntil: undefined, error: player.current ? "restart_requires_moderator_resume" : undefined });
  }
  expireLease(now = Date.now()) {
    const player = this.player;
    if (player.state === "playing" && player.leaseUntil && player.leaseUntil <= now) this.setPlayer({ ...player, state: "paused", version: player.version + 1, error: "player_disconnected_resume_required", lease: undefined, credential: undefined, leaseUntil: undefined });
  }
}
