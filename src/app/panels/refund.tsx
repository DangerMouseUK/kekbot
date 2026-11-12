// Shared by Control room and Points & rewards: refunding a redemption is final.
import { text, type Row } from "../ui";
import type { PanelProps } from "./types";

/** "Reject and refund" is final: ask first, with Cancel focused. */
export function confirmRefund(confirm: PanelProps["confirm"], row: Row) {
  return confirm({
    title: "Reject and refund this redemption?",
    body: (
      <p>
        {text(row.viewerName ?? "The viewer")} gets {Number(row.cost).toLocaleString()} points back
        for {text(row.rewardName ?? "the reward")}. This cannot be undone.
      </p>
    ),
    confirm: "Reject and refund",
    danger: true,
  });
}
