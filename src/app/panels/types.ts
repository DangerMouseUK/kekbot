import type { Run, Session, Snapshot } from "../ui";
export type PanelProps = {
  snapshot: Snapshot;
  auth: Session;
  run: Run;
  busy: boolean;
  message: (text: string) => void;
  expired: () => void;
};
