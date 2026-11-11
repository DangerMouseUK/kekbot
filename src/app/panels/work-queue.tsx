"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { describeError } from "../messages";
import type { Row, WorkPage } from "../ui";

export default function WorkQueue({
  firstPage,
  view,
  children,
  expired,
}: {
  firstPage: WorkPage;
  view: "uncertain-jobs" | "pending-redemptions";
  children: (row: Row, refresh: () => Promise<void>) => ReactNode;
  expired: () => void;
}) {
  const [loaded, setLoaded] = useState<{ cursor: string; page: WorkPage }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const page = loaded?.page ?? firstPage;

  async function load(cursor?: string) {
    request.current?.abort();
    setError("");
    if (!cursor) {
      setLoaded(undefined);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    try {
      const params = new URLSearchParams({ view, limit: "50", cursor });
      const response = await fetch(`/api/control?${params}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.status === 401) {
        expired();
        return;
      }
      const result = await response.json();
      if (!response.ok) throw new Error(describeError(String(result.error)).title);
      if (!controller.signal.aborted) setLoaded({ cursor, page: result });
    } catch (error) {
      if (!controller.signal.aborted)
        setError(error instanceof Error ? error.message : "This list is unavailable right now.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  const refresh = () => load(loaded?.cursor);
  return (
    <>
      {/* Paging controls appear only when there is more than one page to move between. */}
      {(loaded || page.nextCursor) && (
        <>
          <p className="help">
            Everything still waiting, oldest included, 50 at a time. Newest first.
          </p>
          <div className="actions">
            <button disabled={loading} onClick={() => load()}>
              Newest waiting items
            </button>
            {loaded && (
              <button disabled={loading} onClick={refresh}>
                Refresh this page
              </button>
            )}
            {page.nextCursor && (
              <button
                className="secondary"
                disabled={loading}
                onClick={() => load(page.nextCursor!)}
              >
                Older waiting items
              </button>
            )}
          </div>
        </>
      )}
      {loading && <p aria-live="polite">Loading waiting items…</p>}
      {error && <p role="alert">{error}</p>}
      <QueueItems items={page.items} renderItem={children} refresh={refresh} />
      {!page.items.length && <p className="empty">Nothing is waiting.</p>}
    </>
  );
}

function QueueItems({
  items,
  renderItem,
  refresh,
}: {
  items: Row[];
  renderItem: (row: Row, refresh: () => Promise<void>) => ReactNode;
  refresh: () => Promise<void>;
}) {
  return items.map((row) => renderItem(row, refresh));
}
