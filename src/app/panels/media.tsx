"use client";
import { useEffect, useRef, useState } from "react";
import { ActionForm, permitted, text, type Row } from "../ui";
import type { PanelProps } from "./types";

type History = { items: Row[]; nextCursor: string | null };

export default function MediaPanel({ snapshot: s, auth, run, busy }: PanelProps) {
  const canManage = permitted(auth.actor, "media");
  const [history, setHistory] = useState<History>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function loadHistory(cursor?: string) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ view: "media-history", limit: "50" });
      if (cursor) params.set("cursor", cursor);
      const response = await fetch(`/api/control?${params}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "History unavailable");
      if (!controller.signal.aborted) setHistory(result);
    } catch (error) {
      if (!controller.signal.aborted)
        setError(error instanceof Error ? error.message : "History unavailable");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  function itemCard(item: Row) {
    const actions =
      item.status === "pending"
        ? ["approve", "reject", "remove"]
        : ["approved", "failed"].includes(String(item.status))
          ? ["remove"]
          : [];
    return (
      <article key={String(item.id)}>
        <h3>{text(item.title ?? item.video_id)}</h3>
        <p>
          {text(item.status)} · {text(item.duration ?? "Unknown")} seconds ·{" "}
          {text(item.error ?? "")}
        </p>
        <p className="help">
          {text(item.id)} · version {text(item.version)}
        </p>
        {canManage && (
          <div className="actions">
            {actions.map((action) => (
              <button
                key={action}
                disabled={busy}
                onClick={() => run(`media.${action}`, { target: item.id, version: item.version })}
              >
                {action}
              </button>
            ))}
            {item.status === "approved" && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  run("media.reorder", {
                    ids: [
                      item.id,
                      ...s.media
                        .filter((row) => row.status === "approved" && row.id !== item.id)
                        .map((row) => row.id),
                    ],
                  })
                }
              >
                Move to top
              </button>
            )}
          </div>
        )}
      </article>
    );
  }

  return (
    <>
      <p>
        Enable media in Maintenance settings. Live playback needs a visible OBS player source and
        its separate credential.
      </p>
      {canManage && (
        <ActionForm
          action="media.request"
          fields={["url"]}
          button="Add YouTube request"
          run={run}
          busy={busy}
        />
      )}
      <section>
        <h2>Player · {s.player.state}</h2>
        <p>{s.player.error ?? "Ready for an approved item and connected player."}</p>
        <p>
          Version {s.player.version} · Volume {s.player.volume}%
        </p>
        {canManage && (
          <div className="actions">
            {["pause", "resume", "skip"].map((action) => (
              <button
                key={action}
                disabled={busy}
                onClick={() => run(`player.${action}`, { version: s.player.version })}
              >
                {action}
              </button>
            ))}
            <label>
              Volume
              <input
                type="range"
                min={0}
                max={100}
                defaultValue={s.player.volume}
                disabled={busy}
                onPointerUp={(event) =>
                  run("player.volume", {
                    version: s.player.version,
                    value: Number(event.currentTarget.value),
                  })
                }
                onKeyUp={(event) => {
                  if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
                    void run("player.volume", {
                      version: s.player.version,
                      value: Number(event.currentTarget.value),
                    });
                }}
              />
            </label>
          </div>
        )}
      </section>
      <section>
        <h2>Requests and queue</h2>
        {s.media.map(itemCard)}
        {!s.media.length && <p>No active requests.</p>}
        {canManage && (
          <button
            className="secondary"
            disabled={busy}
            onClick={() => {
              if (confirm("Remove waiting queue items?")) void run("media.clear");
            }}
          >
            Clear waiting items
          </button>
        )}
      </section>
      <section>
        <h2>Media history</h2>
        <p>
          Completed, skipped, rejected, removed and failed requests. Refresh to see recent changes.
        </p>
        <div className="actions">
          <button disabled={loading} onClick={() => loadHistory()}>
            {history ? "Latest history" : "Load media history"}
          </button>
          {history?.nextCursor && (
            <button
              className="secondary"
              disabled={loading}
              onClick={() => loadHistory(history.nextCursor!)}
            >
              Older history
            </button>
          )}
        </div>
        {loading && <p role="status">Loading history...</p>}
        {error && <p role="alert">{error}</p>}
        {history?.items.map(itemCard)}
        {history && !history.items.length && <p>No historical requests.</p>}
      </section>
    </>
  );
}
