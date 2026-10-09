import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { bracesRemediation, verifyBracesRemediation } from "./dependency-patches.mjs";

export function auditSummary(result, bracesPatchVerified = false) {
  let data;
  try { data = JSON.parse(result.stdout); } catch { return { available: false, passed: false }; }
  if (![0, 1].includes(result.status) || !data?.metadata?.vulnerabilities || data.error) return { available: false, passed: false };
  const levels = ["info", "low", "moderate", "high", "critical"];
  if (!levels.every(key => Number.isInteger(data.metadata.vulnerabilities[key]) && data.metadata.vulnerabilities[key] >= 0)) return { available: false, passed: false };
  const counts = Object.fromEntries(levels.map(key => [key, data.metadata.vulnerabilities[key]]));
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const advisories = Object.values(data.advisories ?? {});
  if (total === 0) return { available: true, passed: result.status === 0 && advisories.length === 0, counts };
  const patched = bracesPatchVerified && total === 1 && advisories.length === 1 && counts.high === 1 && advisories.every(advisory =>
    advisory.github_advisory_id === bracesRemediation.advisory && advisory.module_name === "braces" && advisory.severity === "high" &&
    Array.isArray(advisory.findings) && advisory.findings.length === 1 && advisory.findings.every(finding =>
      finding.version === "3.0.3" && Array.isArray(finding.paths) && finding.paths.length === 1 && finding.paths[0] === bracesRemediation.path));
  return { available: true, passed: patched, counts, locallyPatched: patched ? [bracesRemediation.advisory] : [] };
}
export function imageSummary(result, includeFindings = false) {
  let data;
  try { data = JSON.parse(result.stdout); } catch { return { available: false, passed: false }; }
  if (result.status !== 0 || !Array.isArray(data.Results) || !data.Results.length || !/^sha256:[a-f0-9]{64}$/.test(data.Metadata?.ImageID ?? "")) return { available: false, passed: false };
  const counts = {}, findings = [];
  const safe = (value, pattern) => typeof value === "string" && pattern.test(value) ? value : "unavailable";
  for (const target of data.Results) for (const vulnerability of target.Vulnerabilities ?? []) {
    const severity = ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(vulnerability.Severity) ? vulnerability.Severity : "UNKNOWN";
    counts[severity] = (counts[severity] ?? 0) + 1;
    if (includeFindings) findings.push({
      id: safe(vulnerability.VulnerabilityID, /^(?:CVE-\d{4}-\d{4,12}|GO-\d{4}-\d{4,12}|GHSA-[a-z0-9-]{10,24}|TEMP-[A-Fa-f0-9-]{4,80})$/),
      package: safe(vulnerability.PkgName, /^(?:(?:@[a-zA-Z0-9_.-]{1,64}\/)?[a-zA-Z0-9_.+-]{1,128}|golang\.org\/[a-zA-Z0-9_.+/-]{1,128})$/),
      installed: safe(vulnerability.InstalledVersion, /^[a-zA-Z0-9][a-zA-Z0-9_.:+~,-]{0,127}$/),
      fixed: safe(vulnerability.FixedVersion, /^[a-zA-Z0-9][a-zA-Z0-9_.:+~,-]{0,127}$/),
      severity,
      status: ["fixed", "affected", "will_not_fix", "under_investigation", "unknown", "end_of_life"].includes(vulnerability.Status) ? vulnerability.Status : "unknown"
    });
  }
  const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, UNKNOWN: 3, LOW: 4 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity] || a.package.localeCompare(b.package) || a.id.localeCompare(b.id));
  return { available: true, passed: !Object.values(counts).some(Boolean), imageDigest: data.Metadata.ImageID, counts,
    ...(includeFindings ? { findings: findings.slice(0, 200), omittedFindings: Math.max(0, findings.length - 200) } : {}) };
}
/** @param {(binary: string, args: string[], options: import('node:child_process').SpawnSyncOptionsWithStringEncoding) => {status: number | null, stdout: string}} execute */
export function reviewDependencies(values, execute = spawnSync) {
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const run = (binary, args) => execute(binary, args, { encoding: "utf8", windowsHide: true, shell: false, timeout: 360000, maxBuffer: 32 * 1024 * 1024 });
  // Launch pnpm through Node on Windows; do not use shell interpolation.
  const audit = args => process.platform === "win32" && process.env.npm_execpath ? run(process.execPath, [process.env.npm_execpath, ...args]) : run(pnpm, args);
  const patched = verifyBracesRemediation();
  const application = auditSummary(audit(["audit", "--prod", "--json"]), patched);
  const tooling = auditSummary(audit(["audit", "--json"]), patched);
  let image = { available: false, passed: false };
  if (values.scanner && values["image-archive"]) {
    const version = run(values.scanner, ["--version", "--format", "json"]);
    try {
      if (version.status === 0 && JSON.parse(version.stdout).Version === "0.75.0") image = imageSummary(run(values.scanner, ["image", "--input", values["image-archive"], "--scanners", "vuln", "--format", "json", "--quiet", "--timeout", "5m"]), values["image-findings"] === true);
    } catch { /* An unavailable scanner cannot pass release review. */ }
  }
  return { application, tooling, image };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { scanner: { type: "string" }, "image-archive": { type: "string" }, "image-findings": { type: "boolean", default: false } } });
  const report = reviewDependencies(values);
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (Object.values(report).some(result => !result.passed)) process.exitCode = 1;
}
