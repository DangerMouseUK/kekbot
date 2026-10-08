"use client";
import { ActionForm, permitted } from "../ui";
import type { PanelProps } from "./types";

export default function GoalsPanel({ auth, run, busy }: PanelProps) {
  const can = (permission: Parameters<typeof permitted>[1]) => permitted(auth.actor, permission);
  return (
    can("operate") && (
      <ActionForm
        action="goal.adjust"
        fields={["target", "version", "value"]}
        button="Adjust or reset goal"
        run={run}
        busy={busy}
      />
    )
  );
}
