import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

export function auditSummary(result) {
  let data;
  try { data = JSON.parse(result.stdout); } catch { return { available: false, passed: false }; }
  if (![0, 1].includes(result.status) || !data.metadata?.vulnerabilities || data.error) return { available: false, passed: false };
  const levels = ["info", "low", "moderate", "high", "critical"];
  if (!levels.every(key => Number.isInteger(data.metadata.vulnerabilities[key]) && data.metadata.vulnerabilities[key] >= 0)) return { available: false, passed: false };
  const counts = Object.fromEntries(levels.map(key => [key, data.metadata.vulnerabilities[key]]));
  return { available: true, passed: Object.values(counts).every(count => count === 0), counts };
}
export function imageSummary(result) {
  let data;
  try { data = JSON.parse(result.stdout); } catch { return { available: false, passed: false }; }
  if (result.status !== 0 || !Array.isArray(data.Results) || !data.Results.length || !/^sha256:[a-f0-9]{64}$/.test(data.Metadata?.ImageID ?? "")) return { available: false, passed: false };
  const counts = {};
  for (const target of data.Results) for (const vulnerability of target.Vulnerabilities ?? []) {
    const severity = ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(vulnerability.Severity) ? vulnerability.Severity : "UNKNOWN";
    counts[severity] = (counts[severity] ?? 0) + 1;
  }
  return { available: true, passed: !Object.values(counts).some(Boolean), imageDigest: data.Metadata.ImageID, counts };
}
/** @param {(binary: string, args: string[], options: import('node:child_process').SpawnSyncOptionsWithStringEncoding) => {status: number | null, stdout: string}} execute */
export function reviewDependencies(values, execute = spawnSync) {
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const run = (binary, args) => execute(binary, args, { encoding: "utf8", windowsHide: true, shell: false, timeout: 360000, maxBuffer: 32 * 1024 * 1024 });
  // Launch pnpm through Node on Windows; do not use shell interpolation.
  const audit = args => process.platform === "win32" && process.env.npm_execpath ? run(process.execPath, [process.env.npm_execpath, ...args]) : run(pnpm, args);
  const application = auditSummary(audit(["audit", "--prod", "--json"]));
  const tooling = auditSummary(audit(["audit", "--json"]));
  let image = { available: false, passed: false };
  if (values.scanner && values["image-archive"]) {
    const version = run(values.scanner, ["--version", "--format", "json"]);
    try {
      if (version.status === 0 && JSON.parse(version.stdout).Version === "0.75.0") image = imageSummary(run(values.scanner, ["image", "--input", values["image-archive"], "--scanners", "vuln", "--format", "json", "--quiet", "--timeout", "5m"]));
    } catch { /* An unavailable scanner cannot pass release review. */ }
  }
  return { application, tooling, image };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { scanner: { type: "string" }, "image-archive": { type: "string" } } });
  const report = reviewDependencies(values);
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (Object.values(report).some(result => !result.passed)) process.exitCode = 1;
}
