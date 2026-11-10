"use client";
import { permitted } from "../ui";
import type { PanelProps } from "./types";

export default function TimersPanel({ snapshot: s, auth, run, busy }: PanelProps) {
  const paused = Boolean(s.settings.timersPaused);
  const timers = s.documents.filter((doc) => doc.kind === "timer");
  const on = timers.filter((doc) => doc.data.enabled !== false).length;
  return (
    <section aria-labelledby="timers-state" className={paused ? "banner warn" : "banner"}>
      <div>
        <h2 id="timers-state">{paused ? "All timers are paused" : "Timers are running"}</h2>
        <p>
          {timers.length
            ? `${on} of ${timers.length} timer${timers.length === 1 ? " is" : "s are"} turned on.`
            : "No timers yet."}{" "}
          Paused or offline timers skip missed messages instead of sending them all at once.
        </p>
      </div>
      {permitted(auth.actor, "operate") && (
        <button
          className={paused ? undefined : "secondary"}
          disabled={busy}
          onClick={() => run(paused ? "timers.resume" : "timers.pause")}
        >
          {paused ? "Resume timers" : "Pause all timers"}
        </button>
      )}
    </section>
  );
}
