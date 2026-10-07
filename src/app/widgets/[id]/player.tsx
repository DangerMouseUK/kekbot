"use client";
import { useEffect, useRef, useState } from "react";
type PlayerState = { state: string; version: number; generation?: number; volume: number; error?: string };
type Item = { id: string; video_id: string; title: string };
type YouTubePlayer = { destroy: () => void; pauseVideo: () => void; playVideo: () => void; setVolume: (value: number) => void; getVideoData: () => { video_id: string } };
type YouTubeApi = { Player: new (element: HTMLElement, options: Record<string, unknown>) => YouTubePlayer };
const youtubeWindow = () => window as typeof window & { YT?: YouTubeApi; onYouTubeIframeAPIReady?: () => void };
let apiPromise: Promise<YouTubeApi> | undefined;
function youtube() {
  if (youtubeWindow().YT) return Promise.resolve(youtubeWindow().YT!);
  apiPromise ??= new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("YouTube player unavailable")), 15000);
    youtubeWindow().onYouTubeIframeAPIReady = () => { clearTimeout(timeout); resolve(youtubeWindow().YT!); };
    const script = document.createElement("script"); script.src = "https://www.youtube.com/iframe_api"; script.onerror = () => { clearTimeout(timeout); reject(new Error("YouTube player could not load")); }; document.head.append(script);
  });
  return apiPromise;
}

export default function Player({ widget, item, state, fixture }: { widget: string; item: Item | null; state: PlayerState; fixture: boolean }) {
  const host = useRef<HTMLDivElement>(null), iframe = useRef<YouTubePlayer | null>(null), lease = useRef<string | undefined>(undefined), latest = useRef({ item, state });
  const [status, setStatus] = useState("Connecting player…");
  useEffect(() => { latest.current = { item, state }; iframe.current?.setVolume(state.volume); if (state.state === "playing" && lease.current) iframe.current?.playVideo(); else iframe.current?.pauseVideo(); }, [item, state]);
  async function post(action: string, error?: string) {
    const credential = new URLSearchParams(location.hash.slice(1)).get("player") ?? "";
    const current = latest.current;
    const response = await fetch(`/api/player/${widget}`, { method: "POST", headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" }, body: JSON.stringify({ action, lease: lease.current, item: current.item?.id, version: current.state.version, error }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error);
    if (data.lease) lease.current = data.lease;
    return data;
  }
  useEffect(() => {
    let active = true;
    const renew = async () => { try { await post("lease"); if (active) { setStatus(fixture ? "Fixture player · no YouTube network requests" : "Player connected"); if (latest.current.state.state === "playing") iframe.current?.playVideo(); } } catch (error) { if (active) { lease.current = undefined; setStatus(error instanceof Error ? error.message : "Player lease failed"); iframe.current?.pauseVideo(); } } };
    void renew(); const timer = setInterval(renew, 5000);
    return () => { active = false; clearInterval(timer); };
    // A source owns one lease independently of the item being played.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget, fixture]);
  useEffect(() => {
    if (fixture || !item || !host.current) return;
    let active = true;
    const boundItem = item.id;
    const element = document.createElement("div"); host.current.append(element);
    void youtube().then(api => {
      if (!active) return;
      iframe.current = new api.Player(element, { width: "100%", height: "100%", videoId: item.video_id, playerVars: { origin: location.origin, playsinline: 1, autoplay: 0, controls: 1 }, events: {
        onReady: () => { if (!active) return; iframe.current?.setVolume(latest.current.state.volume); if (latest.current.state.state === "playing" && lease.current) iframe.current?.playVideo(); },
        onStateChange: (event: { data: number }) => { if (active && event.data === 0 && latest.current.item?.id === boundItem && latest.current.state.state === "playing") void post("ended").catch(error => setStatus(error.message)); },
        onError: (event: { data: number }) => { if (active && latest.current.item?.id === boundItem) void post("error", String(event.data)).catch(error => setStatus(error.message)); },
        onAutoplayBlocked: () => { if (active) void post("blocked").catch(error => setStatus(error.message)); }
      } });
    }).catch(error => { if (active) { setStatus(error.message); void post("error", "iframe_load").catch(() => {}); } });
    return () => { active = false; iframe.current?.destroy(); iframe.current = null; element.remove(); };
    // An item owns its iframe callbacks; old item callbacks cannot acknowledge its successor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, state.generation, fixture]);
  return <section><h2>{item?.title ?? "Queue idle"}</h2><p className="widget-status" role="status">{state.error ?? status} · {state.state}</p>{!fixture && <div className="youtube-frame" ref={host} />}{fixture && item && <button disabled={state.state !== "playing"} onClick={() => post("ended").catch(error => setStatus(error.message))}>Finish fixture item</button>}</section>;
}
