"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { configSchemas } from "../../../server/domain/catalog.ts";
import type { z } from "zod";
import { clockOffset } from "../format.ts";
import { Source } from "../sources";
export type WidgetConfig = z.infer<typeof configSchemas.widget>;
type Snapshot = { config: WidgetConfig; data: unknown; now?: number };

// Alerts and shoutouts need a finer clock so their exit transition starts on time.
const fastTypes = new Set(["alerts", "shoutout", "chat"]);

export default function Widget({ id }: { id: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(), [error, setError] = useState("Loading source…"), [now, setNow] = useState(0);
  const [token, setToken] = useState("");
  // Server clock minus local clock, refreshed with every snapshot. Timed content never trusts the OBS host clock alone.
  const offset = useRef(0);
  const type = snapshot?.config.type;
  useEffect(() => {
    let active = true;
    const access = new URLSearchParams(location.search).get("token") ?? "";
    const url = `/api/widgets/${id}?token=${encodeURIComponent(access)}`;
    const events = new EventSource(`${url}&stream=1`);
    const receive = (event: MessageEvent) => {
      if (!active) return;
      const received = Date.now(), next = JSON.parse(event.data) as Snapshot;
      offset.current = clockOffset(next.now, received);
      setSnapshot(next); setNow(received + offset.current); setError(""); setToken(access);
    };
    events.addEventListener("snapshot", receive as EventListener); events.addEventListener("change", receive as EventListener);
    events.onerror = () => { void fetch(url, { cache: "no-store" }).then(async response => { if (!active) return; if (!response.ok) { setError((await response.json()).error); setSnapshot(undefined); events.close(); } else setError("Reconnecting to source…"); }).catch(() => { if (active) setError("Source disconnected. Playback will pause when its lease expires."); }); };
    return () => { active = false; events.close(); };
  }, [id]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() + offset.current), type && fastTypes.has(type) ? 200 : 1000);
    return () => clearInterval(timer);
  }, [type]);
  if (!snapshot) return <div className="widget-root widget-source" data-state="unavailable"><p className="widget-status" role="status">{error}</p></div>;
  const { config, data } = snapshot;
  if (!config.enabled) return <div className="widget-root widget-source" data-type={config.type} />;
  const asset = (name: string) => `/api/assets/${encodeURIComponent(name)}?widget=${id}&token=${encodeURIComponent(token)}`;
  const style = { ["--w-scale" as string]: config.fontScale, width: `min(100vw, ${config.width}px)`, ...(config.type === "player" ? { minHeight: `min(100vh, ${config.height}px)` } : { height: `min(100vh, ${config.height}px)` }) } as CSSProperties;
  return <div className="widget-root widget-source" data-type={config.type} data-theme={config.theme} data-accent={config.accent} data-align={config.align} data-backdrop={config.backdrop} data-layout={config.layout} data-motion={config.reducedMotion} style={style}>
    {error && <p className="widget-status">{error}</p>}
    <Source widget={id} config={config} data={data} now={now} asset={asset} />
  </div>;
}
