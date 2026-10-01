import type { Metadata } from "next";
import "./style.css";

export const metadata: Metadata = { title: "KekBot foundation", description: "Self-hosted Kick and Discord bot foundation harness." };

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
