import { expect, it } from "vitest";
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
});
it("fails closed until every live/operator gate and exact frozen source/image are accepted", () => {
  const evidence = manifest(); expect(releaseBlockers(evidence, identity)).toEqual(acceptanceIds);
  for (const id of acceptanceIds) evidence.gates[id] = { outcome: "pass", date: "2026-10-07", reference: "docs/RELEASE_READINESS.md#acceptance-record" };
  expect(releaseBlockers(evidence, identity)).toEqual([]);
  expect(releaseBlockers(evidence, { ...identity, sourceRef: "c".repeat(40) })).toContain("candidate_source_mismatch");
  expect(releaseBlockers(evidence, { ...identity, imageDigest: `sha256:${"d".repeat(64)}` })).toContain("candidate_image_mismatch");
  expect(releaseBlockers(evidence, { ...identity, version: "0.1.0-dev.0" })).toContain("stable_v1_version_required");
  evidence.gates.P07.outcome = "fail"; evidence.gates.P07.date = null; evidence.gates.P07.reference = null;
  expect(releaseBlockers(evidence, identity)).toContain("P07");
});
