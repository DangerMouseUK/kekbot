import type { Metadata } from "next";
import "./style.css";

export const metadata: Metadata = { title: "KekBot", description: "Self-hosted Kick and Discord creator toolkit." };

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
