"use client";
import { ActionForm, Table, permitted, text } from "../ui";
import type { PanelProps } from "./types";
import WorkQueue from "./work-queue";

export default function RewardsPanel({ snapshot: s, auth, run, busy, expired }: PanelProps) {
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
        <h2>Pending redemptions</h2>
        <WorkQueue firstPage={s.pendingRedemptions} view="pending-redemptions" expired={expired}>
          {(row, refresh) => (
            <article key={String(row.id)}>
              <p>
                {text(row.id)} · {text(row.viewer)} · {text(row.reward)} · {text(row.cost)} points
              </p>
              {can("engage") && (
                <div className="actions">
                  <button
                    disabled={busy}
                    onClick={async () => {
                      await run("reward.complete", { target: row.id });
                      await refresh();
                    }}
                  >
                    Mark fulfilled
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={async () => {
                      await run("reward.reject", { target: row.id });
                      await refresh();
                    }}
                  >
                    Reject and refund
                  </button>
                </div>
              )}
            </article>
          )}
        </WorkQueue>
      </section>
      <section>
        <h2>Recent redemptions</h2>
        {s.redemptions.map((row) => (
          <article key={String(row.id)}>
            <p>
              {text(row.viewer)} · {text(row.reward)} · {text(row.cost)} points · {text(row.status)}
            </p>
          </article>
        ))}
      </section>
    </>
  );
}
