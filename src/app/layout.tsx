import type { Metadata } from "next";
import "./style.css";
// Widget/alert presentation rules are scoped to .widget-root; the dashboard alert preview reuses them.
import "./widgets/widgets.css";

export const metadata: Metadata = { title: "KekBot", description: "Self-hosted Kick and Discord creator toolkit." };

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
