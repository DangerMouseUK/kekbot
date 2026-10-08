"use client";
import { ActionForm, Table, permitted, text } from "../ui";
import type { PanelProps } from "./types";

export default function RewardsPanel({ snapshot: s, auth, run, busy }: PanelProps) {
  const can = (permission: Parameters<typeof permitted>[1]) => permitted(auth.actor, permission);
  return (
    <>
      <p>
        Watchtime is an estimate from observed chat activity. Enable accrual in Maintenance
        settings.
      </p>
      {can("engage") && (
        <ActionForm
          action="points.adjust"
          fields={["viewer", "amount", "reason"]}
          button="Adjust points"
          run={run}
          busy={busy}
        />
      )}
      <Table rows={s.leaderboard} columns={["viewer", "balance"]} />
      <section>
        <h2>Redemptions</h2>
        {s.redemptions.map((row) => (
          <article key={String(row.id)}>
            <p>
              {text(row.viewer)} · {text(row.reward)} · {text(row.cost)} points · {text(row.status)}
            </p>
            {row.status === "pending" && can("engage") && (
              <div className="actions">
                <button onClick={() => run("reward.complete", { target: row.id })}>
                  Mark fulfilled
                </button>
                <button
                  className="secondary"
                  onClick={() => run("reward.reject", { target: row.id })}
                >
                  Reject and refund
                </button>
              </div>
            )}
          </article>
        ))}
      </section>
    </>
  );
}
