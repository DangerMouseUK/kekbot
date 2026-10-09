"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
      if (!response.ok) throw new Error(result.error ?? "Queue unavailable");
      if (!controller.signal.aborted) setLoaded({ cursor, page: result });
    } catch (error) {
      if (!controller.signal.aborted)
        setError(error instanceof Error ? error.message : "Queue unavailable");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  const refresh = () => load(loaded?.cursor);
  return (
    <>
      <p>
        This queue includes older work still awaiting a decision. Recent history is shown
        separately.
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
          <button className="secondary" disabled={loading} onClick={() => load(page.nextCursor!)}>
            Older waiting items
          </button>
        )}
      </div>
      {loading && <p role="status">Loading waiting items...</p>}
      {error && <p role="alert">{error}</p>}
      <QueueItems items={page.items} renderItem={children} refresh={refresh} />
      {!page.items.length && <p>No waiting items on this page.</p>}
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
