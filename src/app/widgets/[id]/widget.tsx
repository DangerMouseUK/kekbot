"use client";
import { useEffect, useState, type ComponentProps } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import type { configSchemas } from "../../../server/domain/catalog.ts";
import type { z } from "zod";
import { text, type Row } from "../../ui";
const Player = dynamic(() => import("./player"));
type Snapshot = { config: z.infer<typeof configSchemas.widget>; data: unknown };

export default function Widget({ id }: { id: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(), [error, setError] = useState("Loading source…"), [now, setNow] = useState(0);
  const [token, setToken] = useState("");
  useEffect(() => {
    let active = true;
    const access = new URLSearchParams(location.search).get("token") ?? "";
    const url = `/api/widgets/${id}?token=${encodeURIComponent(access)}`;
    const events = new EventSource(`${url}&stream=1`);
    const receive = (event: MessageEvent) => { if (active) { setSnapshot(JSON.parse(event.data)); setError(""); setToken(access); } };
    events.addEventListener("snapshot", receive as EventListener); events.addEventListener("change", receive as EventListener);
    events.onerror = () => { void fetch(url, { cache: "no-store" }).then(async response => { if (!active) return; if (!response.ok) { setError((await response.json()).error); setSnapshot(undefined); events.close(); } else setError("Reconnecting to source…"); }).catch(() => { if (active) setError("Source disconnected. Playback will pause when its lease expires."); }); };
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { active = false; events.close(); clearInterval(timer); };
  }, [id]);
  if (!snapshot) return <div className="widget-root"><p className="widget-status" role="status">{error}</p></div>;
  const { config, data } = snapshot;
  if (!config.enabled) return <div className="widget-root" />;
  const asset = (name: string) => `/api/assets/${encodeURIComponent(name)}?widget=${id}&token=${encodeURIComponent(token)}`;
  const rows = Array.isArray(data) ? data as Row[] : [];
  const value = data as Row | null;
  let content: React.ReactNode;
  if (config.type === "player" && value) content = <Player widget={id} item={value.current as ComponentProps<typeof Player>["item"]} state={value.player as ComponentProps<typeof Player>["state"]} fixture={Boolean(value.fixture)} />;
  else if (config.type === "alerts") content = value && Number(value.endsAt) > now ? <article key={String(value.id)} className={`alert-${value.animation}`}>{Boolean(value.image) && <Image unoptimized src={asset(String(value.image))} width={640} height={360} alt="" />}<h2>{text(value.text)}</h2>{Boolean(value.sound) && <AlertSound key={String(value.id)} src={asset(String(value.sound))} volume={Number(value.volume)} />}</article> : null;
  else if (config.type === "chat") content = rows.map((row, i) => <article key={i}><strong>{text(row.name)}</strong><p>{text(row.text)}</p></article>);
  else if (["goal", "multigoal"].includes(config.type)) content = rows.map(row => <article key={String(row.id)}><h3>{text(row.name)}</h3><progress max={Number(row.target)} value={Number(row.value)} /><p>{text(row.value)} / {text(row.target)}</p></article>);
  else if (config.type === "nowplaying") content = <article><h2>Now playing</h2><p>{text((value?.current as Row | null)?.title ?? "Nothing playing")}</p></article>;
  else if (config.type === "queue") content = <article><h2>Up next</h2><ol>{((value?.queue ?? []) as Row[]).map(row => <li key={String(row.id)}>{text(row.title)}</li>)}</ol></article>;
  else if (config.type === "status") content = <article><h2>{value?.live === "true" ? "Live" : value?.live === "false" ? "Offline" : "Status unavailable"}</h2><p>{value?.live === "true" && value.startedAt ? `${Math.max(0, Math.floor((now - Date.parse(String(value.startedAt))) / 60000))} minutes` : ""}</p><p>Current viewers: {text(value?.viewers)}</p></article>;
  else if (config.type === "countdown") content = <article><h2>{config.text || config.name}</h2><p>{config.endsAt ? `${Math.max(0, Math.ceil((config.endsAt - now) / 1000))} seconds` : "No end time configured"}</p></article>;
  else if (config.type === "socials") { const messages = String(value?.text ?? "").split(/\n|\s*\|\s*/).filter(Boolean); content = <article><h2>{messages.length ? messages[Math.floor(now / 10000) % messages.length] : "Socials not configured"}</h2></article>; }
  else if (config.type === "counter") content = <article><h2>{config.name}</h2><strong>{text(value?.value)}</strong></article>;
  else if (config.type === "shoutout") content = value ? <article><h2>{text(value.name)}</h2><p>{text(value.url)}</p></article> : null;
  else if (["poll", "raffle"].includes(config.type)) content = rows.map((row, i) => <article key={i}><h2>{text(row.name)}</h2><p>{text(row.status)}</p>{Array.isArray(row.options) && <ol>{(row.options as string[]).map((option, index) => <li key={index}>{option}: {Number((row.results as Row[])?.find(r => r.choice === String(index + 1))?.count ?? 0)}</li>)}</ol>}{config.type === "raffle" && <p>{(row.results as Row[])?.reduce((sum, r) => sum + Number(r.count), 0) ?? 0} entries · {Array.isArray(row.winners) ? row.winners.join(", ") || "No winner yet" : "No winner yet"}</p>}</article>);
  else content = (config.type === "activity" && rows.length ? [rows[Math.floor(now / 10000) % rows.length]] : rows).map((row, i) => <article key={i}><strong>{text(row.name)}</strong><p>{text(row.balance ?? row.event ?? "")}</p></article>);
  return <div className="widget-root" data-theme={config.theme} data-motion={config.reducedMotion} style={{ width: `min(100vw, ${config.width}px)`, minHeight: config.height }}>{error && <p className="widget-status">{error}</p>}{content}</div>;
}
function AlertSound({ src, volume }: { src: string; volume: number }) {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => { const audio = new Audio(src); audio.volume = volume; void audio.play().catch(() => setBlocked(true)); return () => { audio.pause(); audio.src = ""; }; }, [src, volume]);
  return blocked ? <p className="widget-status">Alert audio blocked by browser autoplay settings.</p> : null;
}
