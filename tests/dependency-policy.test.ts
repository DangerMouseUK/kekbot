import { expect, it } from "vitest";
import { dependencyPolicy, validateDependencyReview, dependencyBlockers } from "../scripts/dependency-policy.mjs";
import { auditSummary, imageSummary, reviewDependencies } from "../scripts/dependency-review.mjs";

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
