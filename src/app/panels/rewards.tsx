"use client";
import { useState } from "react";
import { Table, ViewerPicker, formatTime, permitted, relative, text, type Viewer } from "../ui";
import { confirmRefund } from "./control-room";
import type { PanelProps } from "./types";
import WorkQueue from "./work-queue";

function PointsAdjust({ run, busy, expired }: PanelProps) {
  const [viewer, setViewer] = useState<Viewer>(),
    [amount, setAmount] = useState(""),
    [reason, setReason] = useState("");
  async function adjust(sign: 1 | -1) {
    if (!viewer || !Number(amount) || !reason.trim()) return;
    const result = await run("points.adjust", {
      viewer: viewer.id,
      amount: sign * Math.abs(Math.round(Number(amount))),
      reason: reason.trim(),
    });
    if (result) {
      setViewer({ ...viewer, balance: Number(result.balance) });
      setAmount("");
      setReason("");
    }
  }
  return (
    <section aria-labelledby="adjust-heading">
      <h2 id="adjust-heading">Give or remove points</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void adjust(1);
        }}
      >
        <ViewerPicker value={viewer} onChange={setViewer} expired={expired} />
        <div className="fields">
          <label>
            Points
            <input
              type="number"
              min={1}
              max={1000000}
              step={1}
              required
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label>
            Reason
            <input
              required
              maxLength={200}
              list="point-reasons"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <datalist id="point-reasons">
              <option value="Giveaway prize" />
              <option value="Welcome bonus" />
              <option value="Correction" />
              <option value="Rule break" />
            </datalist>
          </label>
        </div>
        <div className="actions">
          <button disabled={busy || !viewer}>Add points</button>
          <button
            type="button"
            className="secondary"
            disabled={busy || !viewer || !Number(amount) || !reason.trim()}
            onClick={() => adjust(-1)}
          >
            Remove points
          </button>
        </div>
        {!viewer && <p className="help">Choose a viewer first. Balances cannot go below zero.</p>}
      </form>
    </section>
  );
}

export default function RewardsPanel(props: PanelProps) {
  const { snapshot: s, auth, run, busy, expired, confirm } = props;
  const can = permitted(auth.actor, "engage");
  return (
    <>
      {!s.settings.pointsEnabled && (
        <p className="notice info">
          Points are off, so viewers do not earn them and cannot redeem rewards. The owner can turn
          them on in Maintenance → Edit settings.
        </p>
      )}
      <section>
        <h2>Pending redemptions</h2>
        <WorkQueue firstPage={s.pendingRedemptions} view="pending-redemptions" expired={expired}>
          {(row, refresh) => (
            <article key={String(row.id)} className="work-item">
              {/* Screen readers hear which redemption each button acts on. */}
              <p id={`redemption-${String(row.id).replace(/\W/g, "")}`}>
                <strong>{text(row.viewerName ?? "A viewer")}</strong> redeemed{" "}
                <strong>{text(row.rewardName ?? "a deleted reward")}</strong> ·{" "}
                {Number(row.cost).toLocaleString()} points · {relative(Number(row.createdAt))}
              </p>
              <p className="help">
                Do what the reward promises, then mark it fulfilled. Reference {text(row.id)}
              </p>
              {can && (
                <div className="actions">
                  <button
                    disabled={busy}
                    aria-describedby={`redemption-${String(row.id).replace(/\W/g, "")}`}
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
                    aria-describedby={`redemption-${String(row.id).replace(/\W/g, "")}`}
                    onClick={async () => {
                      if (!(await confirmRefund(confirm, row))) return;
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
      {can && <PointsAdjust {...props} />}
      <section>
        <h2>Leaderboard</h2>
        <Table
          caption="Points leaderboard"
          empty="Nobody has points yet. Viewers earn them by chatting while you are live."
          rows={s.leaderboard.map((row, index) => ({ ...row, rank: index + 1 }))}
          columns={[
            { key: "rank", label: "Rank" },
            {
              key: "name",
              label: "Viewer",
              render: (row) => text(row.name ?? `Kick user ${row.viewer}`),
            },
            {
              key: "balance",
              label: "Points",
              render: (row) => Number(row.balance).toLocaleString(),
            },
          ]}
        />
      </section>
      <section>
        <h2>Recent redemptions</h2>
        <Table
          caption="Recent redemptions"
          empty="No redemptions yet. Viewers redeem with !redeem and the reward name."
          rows={s.redemptions}
          columns={[
            {
              key: "viewerName",
              label: "Viewer",
              render: (row) => text(row.viewerName ?? `Kick user ${row.viewer}`),
            },
            {
              key: "rewardName",
              label: "Reward",
              render: (row) => text(row.rewardName ?? "Deleted reward"),
            },
            { key: "cost", label: "Points", render: (row) => Number(row.cost).toLocaleString() },
            "status",
            { key: "created_at", label: "When", render: (row) => formatTime(row.created_at) },
          ]}
        />
      </section>
    </>
  );
}
