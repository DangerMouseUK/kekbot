"use client";
import {} from "../ui";
import type { PanelProps } from "./types";

export default function WidgetsPanel({}: PanelProps) {
  return (
    <p>
      Use independent revocable tokens for OBS Browser Sources. Player sources receive a separate
      acknowledgement credential. Revoke tokens in Maintenance.
    </p>
  );
}
