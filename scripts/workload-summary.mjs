import { appendFileSync, existsSync, readFileSync } from "node:fs";

// Allowlist aggregate fields. Never upload the raw runtime directory or traces.
const path = "output/workload/report.json";
if (!existsSync(path)) {
  process.stdout.write("No completed workload report; inspect the failed step.\n");
} else {
  const report = JSON.parse(readFileSync(path, "utf8"));
  if (report.format !== "kekbot-workload" || report.targetMode !== "fixture" || report.targetLocation !== "local" || report.referenceAcceptance !== false || !/^[a-f0-9]{40}$/.test(report.sourceRef)) throw new Error("invalid_fixture_report");
  const numeric = value => value === null || value === undefined ? "unavailable" : Number.isFinite(value) && value >= 0 ? String(Math.round(value * 100) / 100) : "invalid";
  const fields = {
    "Source commit": report.sourceRef,
    "Sustained seconds": numeric(report.profile.sustainedSeconds),
    "Burst seconds": numeric(report.profile.burstSeconds),
    "Browser clients": numeric(report.browserClients),
    "Requests sent": numeric(report.sent),
    "Decisions / replies": `${numeric(report.counts.decided)} / ${numeric(report.counts.replied)}`,
    "Failed operations": numeric(report.counts.failures),
    "Driver errors": numeric(report.failures.length),
    "Peak sampled application RSS (MiB)": numeric(report.peakRssBytes / 1048576),
    "Peak sampled backlog": numeric(report.peakBacklog),
    "Backlog drain (ms)": numeric(report.backlogDrainMs),
    "Intake p95 (ms)": numeric(report.httpIntakeP95Ms),
    "Receipt-to-decision p95 (ms)": numeric(report.receiptToDecisionP95Ms),
    "Receipt-to-fixture-reply p95 (ms)": numeric(report.receiptToFixtureReplyP95Ms),
    "Restart readiness (ms)": numeric(report.restartReadyMs),
    "Visible update probes (ms)": report.visibleUpdateMs.map(numeric).join(", ")
  };
  const summary = `## Synthetic fixture soak\n\nHosted CI shares resources with its driver and browsers. This is durability/load evidence, not reference-host or real-provider acceptance.\n\n| Measurement | Result |\n| --- | --- |\n${Object.entries(fields).map(([key, value]) => `| ${key} | ${value} |`).join("\n")}\n`;
  process.stdout.write(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}
