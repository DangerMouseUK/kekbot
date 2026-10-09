import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { imageSummary } from "./dependency-review.mjs";

// govulncheck emits a sequence of JSON objects, not a single JSON document.
export function jsonSequence(text) {
  const values = []; let start = -1, depth = 0, quoted = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (start < 0) { if (/\s/.test(char)) continue; if (char !== "{") throw new Error("invalid_scan_stream"); start = i; }
    if (quoted) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') quoted = false; }
    else if (char === '"') quoted = true;
    else if (char === "{" || char === "[") depth++;
    else if (char === "}" || char === "]") { if (--depth === 0) { values.push(JSON.parse(text.slice(start, i + 1))); start = -1; } }
  }
  if (start >= 0 || !values.length) throw new Error("incomplete_scan_stream");
  return values;
}
export function assessGoBinary(scan, symbols) {
  try {
    if (scan.status !== 0 || symbols.status !== 0 || !/\bT main\.main\b/.test(symbols.stdout) || !symbols.stdout.includes("github.com/caddyserver/caddy/v2") || symbols.stdout.includes("golang.org/x/crypto/openpgp")) return { available: false, passed: false };
    const messages = jsonSequence(scan.stdout), configs = messages.filter(row => row.config), sboms = messages.filter(row => row.SBOM);
    if (configs.length !== 1 || sboms.length !== 1 || messages.some(row => Object.keys(row).length !== 1 || !["config", "SBOM", "progress", "osv", "finding"].includes(Object.keys(row)[0]))) return { available: false, passed: false };
    const config = configs[0].config, sbom = sboms[0].SBOM;
    if (config.scanner_name !== "govulncheck" || config.scanner_version !== "v1.8.0" || config.scan_mode !== "binary" || config.scan_level !== "symbol" || config.db !== "https://vuln.go.dev" || sbom.go_version !== "go1.27.2" || !Array.isArray(sbom.modules)) return { available: false, passed: false };
    for (const [path, version] of [["github.com/caddyserver/caddy/v2", "v2.11.6"], ["golang.org/x/net", "v0.60.0"], ["golang.org/x/crypto", "v0.57.0"]]) if (!sbom.modules.some(module => module.path === path && module.version === version)) return { available: false, passed: false };
    const findings = messages.filter(row => row.finding).map(row => row.finding);
    const onlyUncompiledOpenPgp = findings.length === 1 && findings[0].osv === "GO-2026-5932" && findings[0].trace?.length === 1 && findings[0].trace[0].module === "golang.org/x/crypto" && findings[0].trace[0].version === "v0.57.0" && !findings[0].trace[0].package && !findings[0].trace[0].function;
    return { available: true, passed: onlyUncompiledOpenPgp, goVersion: sbom.go_version, moduleOnly: onlyUncompiledOpenPgp ? ["GO-2026-5932"] : [], symbolCount: symbols.stdout.trim().split("\n").length };
  } catch { return { available: false, passed: false }; }
}
export function reconcileProxy(image, binary) {
  const exact = image.available && binary.available && binary.passed && image.imageDigest === binary.imageDigest && image.findings?.length === 1 && image.omittedFindings === 0 && image.findings[0].id === "GO-2026-5932" && image.findings[0].package === "golang.org/x/crypto" && image.findings[0].installed === "v0.57.0" && Object.values(image.counts).reduce((sum, count) => sum + count, 0) === 1;
  return { ...image, passed: Boolean(exact), notAffected: exact ? [{ id: "GO-2026-5932", reason: "OpenPGP packages absent from the verified binary symbol table", binarySha256: binary.binarySha256 }] : [], binary };
}
export function reviewProxy(values) {
  const run = (binary, args) => spawnSync(binary, args, { encoding: "utf8", windowsHide: true, shell: false, timeout: 360000, maxBuffer: 64 * 1024 * 1024 });
  const directory = mkdtempSync(join(tmpdir(), "kekbot-proxy-review-")); let container;
  try {
    if (process.platform !== "linux") throw new Error("linux_required");
    const version = run(values.scanner, ["--version", "--format", "json"]);
    if (version.status !== 0 || JSON.parse(version.stdout).Version !== "0.75.0") throw new Error("scanner_version_mismatch");
    const image = imageSummary(run(values.scanner, ["image", "--input", values.archive, "--scanners", "vuln", "--format", "json", "--quiet", "--timeout", "5m"]), true);
    if (!image.available) throw new Error("image_scan_unavailable");
    // Select only the image ID from the scanned archive, never a mutable tag or
    // a caller-supplied binary. Docker must already have that same image loaded.
    const created = run("docker", ["create", image.imageDigest]);
    if (created.status !== 0 || !/^[a-f0-9]{64}\s*$/.test(created.stdout)) throw new Error("image_unavailable");
    container = created.stdout.trim(); const path = join(directory, "caddy");
    if (run("docker", ["cp", `${container}:/usr/bin/caddy`, path]).status !== 0) throw new Error("binary_unavailable");
    const binary = { ...assessGoBinary(run(values.govulncheck, ["-mode=binary", "-json", path]), run(values.go, ["tool", "nm", path])), imageDigest: image.imageDigest, binarySha256: createHash("sha256").update(readFileSync(path)).digest("hex") };
    return reconcileProxy(image, binary);
  } catch { return { available: false, passed: false }; }
  finally { if (container) run("docker", ["rm", container]); rmSync(directory, { recursive: true, force: true }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { scanner: { type: "string" }, archive: { type: "string" }, govulncheck: { type: "string" }, go: { type: "string" } } });
  const report = reviewProxy(values); process.stdout.write(JSON.stringify(report, null, 2) + "\n"); if (!report.passed) process.exitCode = 1;
}
