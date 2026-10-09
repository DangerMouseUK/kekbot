import { expect, it } from "vitest";
import { dependencyPolicy, validateDependencyReview, dependencyBlockers } from "../scripts/dependency-policy.mjs";
import { auditSummary, imageSummary, reviewDependencies } from "../scripts/dependency-review.mjs";
import { bracesRemediation, verifyBracesRemediation } from "../scripts/dependency-patches.mjs";
import { readFileSync } from "node:fs";

const sourceRef = "a".repeat(40), imageDigest = `sha256:${"b".repeat(64)}`;
const review = () => ({ format: "kekbot-dependency-review", version: 1, candidate: { sourceRef, imageDigest }, reviews: Object.fromEntries(["application", "tooling", "image", "licenses"].map(name => [name, { outcome: "pass", date: "2026-10-08", reference: "docs/DEPENDENCY_MAINTENANCE.md#review-record" } as { outcome: string; date: string | null; reference: string | null }])) });
it("validates current exact pins and requires a complete identity-bound release review", () => {
  expect(dependencyPolicy()).toEqual([]); const record = review();
  expect(dependencyBlockers(record, sourceRef, imageDigest)).toEqual([]);
  expect(dependencyBlockers(record, "c".repeat(40), imageDigest)).toContain("dependency_source_mismatch");
  expect(dependencyBlockers(record, sourceRef, `sha256:${"d".repeat(64)}`)).toContain("dependency_image_mismatch");
  delete record.reviews.tooling; expect(() => validateDependencyReview(record)).toThrow("invalid_dependency_review");
});
it("fails closed on missing, impossible or undated evidence and refuses private extra fields", () => {
  const record = review(); record.reviews.application.date = "2026-02-31";
  expect(() => validateDependencyReview(record)).toThrow("dependency_pass_requires_evidence");
  expect(() => validateDependencyReview({ ...review(), privateNotes: "unsupported" })).toThrow();
  const pending = review(); pending.reviews.image = { outcome: "pending", date: null, reference: null };
  expect(dependencyBlockers(pending, sourceRef, imageDigest)).toContain("dependency_image_unaccepted");
});
it("reports advisory counts only and does not turn scanner/network errors into passes", () => {
  expect(auditSummary({ status: 0, stdout: JSON.stringify({ metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 } } }) })).toMatchObject({ passed: true });
  expect(auditSummary({ status: 1, stdout: JSON.stringify({ metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0 } } }) })).toMatchObject({ passed: false });
  expect(auditSummary({ status: 1, stdout: JSON.stringify({ error: "private provider response" }) })).toEqual({ available: false, passed: false });
  expect(imageSummary({ status: 0, stdout: JSON.stringify({ Results: [{ Class: "os-pkgs", Type: "debian", Vulnerabilities: [] }], Metadata: { ImageID: imageDigest } }) })).toMatchObject({ passed: true, imageDigest });
  expect(imageSummary({ status: 0, stdout: JSON.stringify({ Results: [], Metadata: { ImageID: imageDigest } }) })).toMatchObject({ passed: false, available: false });
  expect(imageSummary({ status: 1, stdout: "database unavailable" })).toMatchObject({ passed: false, available: false });
  const commands: string[][] = [];
  const report = reviewDependencies({ scanner: "fixture-scanner", "image-archive": "fixture.tar" }, (_binary, args) => { commands.push(args); return { status: 1, stdout: "" }; });
  expect(report.image.passed).toBe(false); expect(commands.every(args => !args.includes("update") && !args.includes("install"))).toBe(true);
});
it("opt-in image findings omit raw scanner fields, bound output and retain every severity count", () => {
  const vulnerability = { VulnerabilityID: "CVE-2026-12345", PkgName: "libc6", InstalledVersion: "2.36-9+deb12u1", FixedVersion: "2.36-9+deb12u2", Severity: "HIGH", Status: "fixed", Title: "private scanner text", PkgPath: "/private/runtime", PrimaryURL: "https://private.example/token" };
  const stdout = JSON.stringify({ Metadata: { ImageID: imageDigest }, Results: [{ Target: "/private/archive", Vulnerabilities: [...Array.from({ length: 201 }, () => vulnerability), { ...vulnerability, VulnerabilityID: "private scanner text", PkgName: "/private/runtime", InstalledVersion: "https://private.example", FixedVersion: "private scanner text", Severity: "CRITICAL", Status: "private scanner text" }] }] });
  const ordinary = imageSummary({ status: 0, stdout });
  expect(ordinary).not.toHaveProperty("findings");
  const report = imageSummary({ status: 0, stdout }, true);
  expect(report).toMatchObject({ passed: false, counts: { HIGH: 201, CRITICAL: 1 }, omittedFindings: 2 });
  if (!("findings" in report) || !report.findings) throw new Error("missing_opt_in_findings");
  expect(report.findings).toHaveLength(200);
  expect(report.findings[0]).toEqual({ id: "unavailable", package: "unavailable", installed: "unavailable", fixed: "unavailable", severity: "CRITICAL", status: "unknown" });
  expect(report.findings[1]).toEqual({ id: vulnerability.VulnerabilityID, package: vulnerability.PkgName, installed: vulnerability.InstalledVersion, fixed: vulnerability.FixedVersion, severity: "HIGH", status: "fixed" });
  expect(JSON.stringify(report)).not.toMatch(/private|PrimaryURL|PkgPath|Title|Target/);
  const oversized = imageSummary({ status: 0, stdout: JSON.stringify({ Metadata: { ImageID: imageDigest }, Results: [{ Vulnerabilities: [{ ...vulnerability, VulnerabilityID: "CVE-2026-" + "9".repeat(4096), PkgName: "@" + "a".repeat(4096) + "/name" }] }] }) }, true);
  expect(oversized).toMatchObject({ findings: [{ id: "unavailable", package: "unavailable" }] });
  const go = imageSummary({ status: 0, stdout: JSON.stringify({ Metadata: { ImageID: imageDigest }, Results: [{ Vulnerabilities: [{ ...vulnerability, VulnerabilityID: "GO-2026-12345", PkgName: "golang.org/x/net", InstalledVersion: "v0.57.0" }] }] }) }, true);
  expect(go).toMatchObject({ findings: [{ id: "GO-2026-12345", package: "golang.org/x/net", installed: "v0.57.0" }] });
});

it("accepts only the exact advisory path with verified local remediation while preserving raw counts", () => {
  const advisory = { github_advisory_id: bracesRemediation.advisory, module_name: "braces", severity: "high", findings: [{ version: "3.0.3", paths: [bracesRemediation.path] }] };
  const report = (entry = advisory, high = 1) => ({ status: 1, stdout: JSON.stringify({ metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high, critical: 0 } }, advisories: { fixture: entry } }) });
  expect(auditSummary(report())).toMatchObject({ passed: false });
  expect(auditSummary(report(), true)).toMatchObject({ passed: true, counts: { high: 1 }, locallyPatched: [bracesRemediation.advisory] });
  expect(auditSummary(report({ ...advisory, github_advisory_id: "GHSA-unreviewed" }), true).passed).toBe(false);
  expect(auditSummary(report({ ...advisory, findings: [{ version: "3.0.3", paths: [bracesRemediation.path, ".>another>braces"] }] }), true).passed).toBe(false);
  expect(auditSummary(report({ ...advisory, findings: [{ version: "3.0.2", paths: [bracesRemediation.path] }] }), true).passed).toBe(false);
  expect(auditSummary(report(advisory, 2), true).passed).toBe(false);
  expect(auditSummary({ ...report(advisory, 0), status: 0 }, true).passed).toBe(false);
  expect(auditSummary({ status: 0, stdout: "null" }, true).passed).toBe(false);
  expect(auditSummary({ status: 1, stdout: "unavailable" }, true).passed).toBe(false);
});
it("requires the installed parser, patch, manifest binding and lockfile to match remediation", () => {
  expect(verifyBracesRemediation()).toBe(true);
  for (const target of ["lib/parse.js", bracesRemediation.patch, "package.json", "pnpm-lock.yaml"]) {
    expect(verifyBracesRemediation(path => {
      const text = readFileSync(path, "utf8");
      if (path.replace(/\\/g, "/").endsWith(target)) return target === "package.json" ? "{}" : "tampered";
      return text;
    })).toBe(false);
  }
});
