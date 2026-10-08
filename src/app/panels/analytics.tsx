"use client";
import { useState } from "react";
import { Table, text, type Row } from "../ui";
import type { PanelProps } from "./types";

export default function AnalyticsPanel({ message }: PanelProps) {
  const [analytics, setAnalytics] = useState<{ rows: Row[]; note: string; coverage: Row }>();
  return (
    <>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const values = new FormData(event.currentTarget);
          const params = new URLSearchParams({
            view: "analytics",
            from: String(new Date(String(values.get("from"))).getTime()),
            to: String(new Date(String(values.get("to"))).getTime() + 86399999),
            ...(values.get("stream") ? { stream: String(values.get("stream")) } : {}),
          });
          const response = await fetch(`/api/control?${params}`, { cache: "no-store" });
          const result = await response.json();
          if (response.ok) setAnalytics(result);
          else message(result.error);
        }}
      >
        <h2>Observed history</h2>
        <div className="fields">
          <label>
            From
            <input name="from" type="date" required />
          </label>
          <label>
            To
            <input name="to" type="date" required />
          </label>
          <label>
            Stream receipt ID (optional)
            <input name="stream" />
          </label>
        </div>
        <button>Load history</button>
        <a className="button secondary" href="/api/control?view=analytics&format=csv">
          Download last 30 days CSV
        </a>
      </form>
      {analytics && (
        <section>
          <p>{analytics.note}</p>
          <p>Coverage: {JSON.stringify(analytics.coverage)}</p>
          <div className="chart" aria-label="Observed daily metrics">
            {analytics.rows.slice(0, 60).map((row, i) => (
              <div key={i}>
                <span>
                  {text(row.day)} · {text(row.metric)}
                </span>
                <meter
                  min={0}
                  max={Math.max(1, ...analytics.rows.map((r) => Number(r.value)))}
                  value={Number(row.value)}
                />{" "}
                <span>{text(row.value)}</span>
              </div>
            ))}
          </div>
          <Table rows={analytics.rows} columns={["day", "metric", "value"]} />
        </section>
      )}
    </>
  );
}
