"use client";
import { useEffect, useRef, useState } from "react";
import { describeError, statusLabel } from "../messages";
import { Empty, formatDuration, formatTime, permitted, text, type Row } from "../ui";
import type { PanelProps } from "./types";

type History = { items: Row[]; nextCursor: string | null };

function itemLine(item: Row) {
  return `${text(item.requesterName ?? "Unknown requester")} · ${formatDuration(item.duration)}`;
}

export default function MediaPanel({
  snapshot: s,
  auth,
  run,
  busy,
  confirm,
  navigate,
  expired,
}: PanelProps) {
  const canManage = permitted(auth.actor, "media");
  const [history, setHistory] = useState<History>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [draftVolume, setDraftVolume] = useState<number>();
  const [dragging, setDragging] = useState<string>();
  const [url, setUrl] = useState("");
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
      if (response.status === 401) return expired();
      const result = await response.json();
      if (!response.ok) throw new Error(describeError(String(result.error)).title);
      if (!controller.signal.aborted) setHistory(result);
    } catch (error) {
      if (!controller.signal.aborted)
        setError(error instanceof Error ? error.message : "History is unavailable right now.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  const volume = draftVolume ?? s.player.volume;
  const current = s.media.find((row) => row.id === s.player.current);
  const approved = s.media.filter((row) => row.status === "approved");
  const pending = s.media.filter((row) => row.status === "pending");
  const checking = s.media.filter((row) => row.status === "validating");
  const waiting = approved.length + pending.length + checking.length;

  function reorder(id: string, to: number) {
    const ids = approved.map((row) => String(row.id));
    const from = ids.indexOf(id);
    if (from < 0 || to < 0 || to >= ids.length || from === to) return;
    ids.splice(from, 1);
    ids.splice(to, 0, id);
    void run("media.reorder", { ids });
  }
  function commitVolume() {
    if (draftVolume === undefined || draftVolume === s.player.volume)
      return setDraftVolume(undefined);
    void run("player.volume", { version: s.player.version, value: draftVolume }).finally(() =>
      setDraftVolume(undefined),
    );
  }

  function decide(
    item: Row,
    action: "approve" | "reject" | "remove",
    label: string,
    secondary = true,
  ) {
    return (
      <button
        className={secondary ? "secondary" : undefined}
        disabled={busy}
        onClick={() => run(`media.${action}`, { target: item.id, version: item.version })}
      >
        {label}
        <span className="visually-hidden"> {text(item.title ?? item.video_id)}</span>
      </button>
    );
  }

  function historyCard(item: Row) {
    return (
      <article key={String(item.id)}>
        <h3>{text(item.title ?? item.video_id)}</h3>
        <p>
          {statusLabel(item.status)} · {itemLine(item)} · {formatTime(item.created_at)}
        </p>
        {Boolean(item.error) && <p className="help">{describeError(String(item.error)).title}</p>}
        {canManage && item.status === "failed" && (
          <div className="actions">{decide(item, "remove", "Remove")}</div>
        )}
      </article>
    );
  }

  return (
    <>
      {!s.settings.mediaEnabled && (
        <div className="notice info">
          <p>
            Media requests are off.{" "}
            {auth.actor?.role === "owner"
              ? "Add a YouTube key in Connections, then turn on media in Maintenance → Edit settings."
              : "The owner can turn them on."}
          </p>
          {auth.actor?.role === "owner" && (
            <button className="secondary small" onClick={() => navigate("Maintenance")}>
              Open settings
            </button>
          )}
        </div>
      )}
      <section aria-labelledby="player-heading">
        <div className="section-title">
          <h2 id="player-heading">Player</h2>
          <span
            className={`badge ${s.player.error ? "warn" : s.player.state === "playing" ? "live" : "muted"}`}
          >
            {s.player.error
              ? "Needs attention"
              : s.player.state === "playing"
                ? "Playing"
                : "Paused"}
          </span>
        </div>
        {current ? (
          <p className="now-playing">
            <strong>
              #{text(current.position)} · {text(current.title ?? "Untitled")}
            </strong>{" "}
            · {itemLine(current)}
          </p>
        ) : (
          <p className="empty">
            Nothing is playing. Press Resume to start the next approved request.
          </p>
        )}
        {s.player.error ? (
          <p className="problem">
            {describeError(s.player.error).title} {describeError(s.player.error).next}
          </p>
        ) : (
          <p className="help">Playback needs a visible OBS player source. Widgets creates one.</p>
        )}
        {canManage && (
          <div className="player-controls">
            <div className="actions">
              {s.player.state === "playing" ? (
                <button
                  disabled={busy}
                  onClick={() => run("player.pause", { version: s.player.version })}
                >
                  Pause
                </button>
              ) : (
                <button
                  disabled={busy}
                  onClick={() => run("player.resume", { version: s.player.version })}
                >
                  Resume
                </button>
              )}
              <button
                className="secondary"
                disabled={busy || !current}
                onClick={() => run("player.skip", { version: s.player.version })}
              >
                Skip<span className="visually-hidden"> current video</span>
              </button>
            </div>
            <label className="volume">
              Volume <output>{volume}%</output>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={volume}
                disabled={busy}
                onChange={(event) => setDraftVolume(Number(event.target.value))}
                onPointerUp={commitVolume}
                onKeyUp={(event) => {
                  if (
                    [
                      "ArrowLeft",
                      "ArrowRight",
                      "ArrowUp",
                      "ArrowDown",
                      "Home",
                      "End",
                      "PageUp",
                      "PageDown",
                    ].includes(event.key)
                  )
                    commitVolume();
                }}
              />
            </label>
          </div>
        )}
      </section>
      {canManage && s.settings.mediaEnabled && (
        <form
          className="inline add-request"
          onSubmit={async (event) => {
            event.preventDefault();
            if (await run("media.request", { url: url.trim() })) setUrl("");
          }}
        >
          <label>
            Add a YouTube video
            <input
              value={url}
              required
              placeholder="https://www.youtube.com/watch?v=…"
              onChange={(event) => setUrl(event.target.value)}
            />
          </label>
          <button disabled={busy}>Add request</button>
        </form>
      )}
      <section aria-labelledby="queue-heading">
        <div className="section-title">
          <h2 id="queue-heading">Requests and queue</h2>
          {canManage && waiting > 0 && (
            <button
              className="secondary"
              disabled={busy}
              onClick={async () => {
                if (
                  await confirm({
                    title: "Clear the queue?",
                    body: (
                      <p>
                        This removes {waiting} waiting request{waiting === 1 ? "" : "s"}: approved,
                        waiting for approval and still being checked. The video playing now keeps
                        playing.
                      </p>
                    ),
                    confirm: "Clear queue",
                    danger: true,
                  })
                )
                  void run("media.clear");
              }}
            >
              Clear queue
            </button>
          )}
        </div>
        {!s.media.length && (
          <Empty title="The queue is empty.">
            Viewers request videos with !sr and a YouTube link
            {s.settings.autoApprove ? "" : "; you approve them here"}.
          </Empty>
        )}
        {pending.length > 0 && (
          <>
            <h3 className="group">Waiting for your approval ({pending.length})</h3>
            {pending.map((item) => (
              <article key={String(item.id)} className="queue-item">
                <h4>
                  #{text(item.position)} · {text(item.title ?? "Untitled")}
                </h4>
                <p>{itemLine(item)}</p>
                {canManage && (
                  <div className="actions">
                    {decide(item, "approve", "Approve", false)}
                    {decide(item, "reject", "Reject")}
                  </div>
                )}
              </article>
            ))}
          </>
        )}
        {approved.length > 0 && (
          <>
            <h3 className="group">Up next ({approved.length})</h3>
            {canManage && approved.length > 1 && (
              <p className="help">Drag requests, or use the arrow buttons, to change the order.</p>
            )}
            <ol className="queue">
              {approved.map((item, index) => (
                <li
                  key={String(item.id)}
                  draggable={canManage && !busy}
                  className={dragging === item.id ? "dragging" : undefined}
                  onDragStart={(event) => {
                    setDragging(String(item.id));
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => setDragging(undefined)}
                  onDragOver={(event) => {
                    if (dragging) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragging) reorder(dragging, index);
                    setDragging(undefined);
                  }}
                >
                  <article className="queue-item">
                    <h4>
                      #{text(item.position)} · {text(item.title ?? "Untitled")}
                    </h4>
                    <p>{itemLine(item)}</p>
                    {canManage && (
                      <div className="actions">
                        <button
                          className="secondary small"
                          disabled={busy || index === 0}
                          onClick={() => reorder(String(item.id), index - 1)}
                        >
                          ↑<span className="visually-hidden"> Move {text(item.title)} up</span>
                        </button>
                        <button
                          className="secondary small"
                          disabled={busy || index === approved.length - 1}
                          onClick={() => reorder(String(item.id), index + 1)}
                        >
                          ↓<span className="visually-hidden"> Move {text(item.title)} down</span>
                        </button>
                        {index > 0 && (
                          <button
                            className="secondary small"
                            disabled={busy}
                            onClick={() => reorder(String(item.id), 0)}
                          >
                            Move to top<span className="visually-hidden"> {text(item.title)}</span>
                          </button>
                        )}
                        {decide(item, "remove", "Remove")}
                      </div>
                    )}
                  </article>
                </li>
              ))}
            </ol>
          </>
        )}
        {checking.length > 0 && (
          <>
            <h3 className="group">Being checked ({checking.length})</h3>
            <p className="help">KekBot is reading the video details from YouTube.</p>
            <ul className="plain">
              {checking.map((item) => (
                <li key={String(item.id)}>
                  #{text(item.position)} · {text(item.video_id)} ·{" "}
                  {text(item.requesterName ?? "Unknown requester")}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <section>
        <h2>Media history</h2>
        <p>
          Played, skipped, rejected, removed and failed requests. Load it again to see recent
          changes.
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
        {loading && <p aria-live="polite">Loading history…</p>}
        {error && <p role="alert">{error}</p>}
        {history?.items.map(historyCard)}
        {history && !history.items.length && <p className="empty">No finished requests yet.</p>}
      </section>
    </>
  );
}
