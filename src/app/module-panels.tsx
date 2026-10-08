"use client";
import type { PanelProps } from "./panels/types";
import ConnectionsPanel from "./panels/connections";
import TimersPanel from "./panels/timers";
import AlertsPanel from "./panels/alerts";
import MediaPanel from "./panels/media";
import ModerationPanel from "./panels/moderation";
import GoalsPanel from "./panels/goals";
import RewardsPanel from "./panels/rewards";
import ActivitiesPanel from "./panels/activities";
import WidgetsPanel from "./panels/widgets";
import AnalyticsPanel from "./panels/analytics";
import AccountsPanel from "./panels/accounts";
import MaintenancePanel from "./panels/maintenance";

export default function ModulePanels({ panel, ...props }: PanelProps & { panel: string }) {
  switch (panel) {
    case "Connections":
      return <ConnectionsPanel {...props} />;
    case "Timers":
      return <TimersPanel {...props} />;
    case "Alerts":
      return <AlertsPanel {...props} />;
    case "Media":
      return <MediaPanel {...props} />;
    case "Moderation":
      return <ModerationPanel {...props} />;
    case "Goals":
      return <GoalsPanel {...props} />;
    case "Points & rewards":
      return <RewardsPanel {...props} />;
    case "Polls & raffles":
      return <ActivitiesPanel {...props} />;
    case "Widgets":
      return <WidgetsPanel {...props} />;
    case "Analytics":
      return <AnalyticsPanel {...props} />;
    case "Accounts":
      return <AccountsPanel {...props} />;
    case "Maintenance":
      return <MaintenancePanel {...props} />;
    default:
      return null;
  }
}
