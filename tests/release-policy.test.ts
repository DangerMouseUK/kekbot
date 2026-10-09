import { expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { acceptanceIds, validateEvidence, releaseBlockers } from "../scripts/release-policy.mjs";

const identity = { sourceRef: "a".repeat(40), imageDigest: `sha256:${"b".repeat(64)}`, version: "1.0.0" };
const manifest = () => ({ format: "kekbot-release-evidence", version: 1, candidate: { sourceRef: identity.sourceRef, imageDigest: identity.imageDigest }, gates: Object.fromEntries(acceptanceIds.map(id => [id, { outcome: "pending", date: null, reference: null } as { outcome: string; date: string | null; reference: string | null }])) });
it("rejects omitted gates, unknown fields and passes without dated public evidence", () => {
  const missing = manifest(); delete missing.gates.L01;
  expect(() => validateEvidence(missing)).toThrow("missing_or_unknown_release_gate");
  const unknown = { ...manifest(), privateNotes: "not a supported public field" };
  expect(() => validateEvidence(unknown)).toThrow("invalid_release_evidence");
  const unsupported = manifest(); unsupported.gates.L01.outcome = "pass";
  expect(() => validateEvidence(unsupported)).toThrow("release_pass_requires");
  unsupported.gates.L01 = { outcome: "pass", date: "2026-02-31", reference: "docs/RELEASE_READINESS.md#acceptance-record" };
  expect(() => validateEvidence(unsupported)).toThrow("release_pass_requires");
});

it("checks real external sign-off references against an immutable source and rejects missing anchors", () => {
  const root = mkdtempSync(join(tmpdir(), "kekbot-release-evidence-test-"));
  const source = join(root, "source"), signoff = join(root, "signoff"), docs = join(signoff, "docs");
  const git = (args: string[]) => execFileSync("git", args, { cwd: source, encoding: "utf8", windowsHide: true }).trim();
  try {
    mkdirSync(source); mkdirSync(docs, { recursive: true });
    writeFileSync(join(source, "package.json"), JSON.stringify({ version: "1.0.0" }));
    git(["init", "--quiet"]); git(["add", "."]); git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "frozen fixture"]);
    const evidence = manifest(); evidence.candidate.sourceRef = git(["rev-parse", "HEAD"]);
    for (const id of acceptanceIds) evidence.gates[id] = { outcome: "pass", date: "2026-10-07", reference: "docs/RELEASE_READINESS.md#acceptance-record" };
    const path = join(docs, "release-evidence.json"), record = join(docs, "RELEASE_READINESS.md");
    writeFileSync(path, JSON.stringify(evidence)); writeFileSync(record, '<a id="acceptance-record"></a>\nSynthetic fixture evidence, not project acceptance.\n');
    const dependency = { format: "kekbot-dependency-review", version: 1, candidate: { sourceRef: evidence.candidate.sourceRef, imageDigest: identity.imageDigest }, reviews: Object.fromEntries(["application", "tooling", "image", "licenses"].map(name => [name, { outcome: "pass", date: "2026-10-07", reference: "docs/RELEASE_READINESS.md#acceptance-record" }])) };
    writeFileSync(join(docs, "dependency-review.json"), JSON.stringify(dependency));
    const check = () => spawnSync(process.execPath, ["scripts/check-release.mjs", "--stable", "--source", source, "--evidence", path, "--image-digest", identity.imageDigest], { encoding: "utf8", windowsHide: true });
    expect(check().status).toBe(0);
    const originalSource = dependency.candidate.sourceRef;
    dependency.candidate.sourceRef = "d".repeat(40);
    writeFileSync(join(docs, "dependency-review.json"), JSON.stringify(dependency));
    expect(check().stderr).toContain("dependency_source_mismatch");
    dependency.candidate.sourceRef = originalSource;
    writeFileSync(join(docs, "dependency-review.json"), JSON.stringify(dependency));
    writeFileSync(record, "Missing the explicit evidence anchor\n"); expect(check().status).toBe(1);
    writeFileSync(record, '<a id="acceptance-record"></a>\n');
    evidence.candidate.sourceRef = "c".repeat(40); writeFileSync(path, JSON.stringify(evidence)); expect(check().stderr).toContain("candidate_source_mismatch");
  } finally {
    if (!resolve(root).startsWith(resolve(tmpdir(), "kekbot-release-evidence-test-"))) throw new Error("unexpected_cleanup_path");
    rmSync(root, { recursive: true, force: true });
  }
});
it("fails closed until every live/operator gate and exact frozen source/image are accepted", () => {
  const evidence = manifest(); expect(releaseBlockers(evidence, identity)).toEqual(acceptanceIds);
  for (const id of acceptanceIds) evidence.gates[id] = { outcome: "pass", date: "2026-10-07", reference: "docs/RELEASE_READINESS.md#acceptance-record" };
  expect(releaseBlockers(evidence, identity)).toEqual([]);
  expect(releaseBlockers(evidence, { ...identity, sourceRef: "c".repeat(40) })).toContain("candidate_source_mismatch");
  expect(releaseBlockers(evidence, { ...identity, imageDigest: `sha256:${"d".repeat(64)}` })).toContain("candidate_image_mismatch");
  expect(releaseBlockers(evidence, { ...identity, version: "0.1.0-dev.0" })).toContain("stable_v1_version_required");
  expect(releaseBlockers(evidence, { ...identity, version: "0.1.0-beta.1" })).toContain("stable_v1_version_required");
  evidence.gates.P07.outcome = "fail"; evidence.gates.P07.date = null; evidence.gates.P07.reference = null;
  expect(releaseBlockers(evidence, identity)).toContain("P07");
});
