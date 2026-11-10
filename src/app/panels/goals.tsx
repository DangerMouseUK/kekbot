"use client";
import type { PanelProps } from "./types";

export default function GoalsPanel({ snapshot: s }: PanelProps) {
  if (!s.documents.some((doc) => doc.kind === "goal")) return null;
  return (
    <p className="help">
      Automatic goals count follows, subscriptions, points or media requests as they happen. They do
      not import earlier totals. To show a goal on stream, add a goal widget in Widgets.
    </p>
  );
}
