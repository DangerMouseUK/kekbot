import type { ConfirmOptions, Run, Session, Snapshot } from "../ui";
export type PanelProps = {
  snapshot: Snapshot;
  auth: Session;
  /** Runs a control action, shows a plain-English notice and resolves to the result (or undefined on failure). */
  run: Run;
  busy: boolean;
  /** Shows a sentence, or a raw API error code translated to plain English. */
  message: (text: string) => void;
  expired: () => void;
  /** Switches to another dashboard panel. */
  navigate: (panel: string) => void;
  /** Opens an accessible confirmation dialog. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};
