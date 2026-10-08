"use client";
import { Table } from "../ui";
import type { PanelProps } from "./types";

export default function ActivitiesPanel({ snapshot: s }: PanelProps) {
  return (
    <>
      <p>
        Viewers use !vote &lt;option number&gt; and !enter in Kick chat. OBS sources only display
        results.
      </p>
      <Table rows={s.activities} columns={["activity", "choice", "count"]} />
    </>
  );
}
