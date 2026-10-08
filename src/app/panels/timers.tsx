"use client";
import { permitted } from "../ui";
import type { PanelProps } from "./types";

export default function TimersPanel({ auth, run }: PanelProps) {
  const can = (permission: Parameters<typeof permitted>[1]) => permitted(auth.actor, permission);
  return (
    can("operate") && (
      <div className="actions">
        <button onClick={() => run("timers.pause")}>Pause all timers</button>
        <button onClick={() => run("timers.resume")}>Resume timers</button>
        <p>Offline and paused timers reschedule without sending missed messages.</p>
      </div>
    )
  );
}
