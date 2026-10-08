import { readFileSync } from "node:fs";

export const acceptanceIds = [
  ...Array.from({ length: 24 }, (_, i) => `L${String(i + 1).padStart(2, "0")}`),
  ...Array.from({ length: 7 }, (_, i) => `P${String(i + 1).padStart(2, "0")}`),
  "O01", "O02"
];
const sha = /^[a-f0-9]{40}$/, digest = /^sha256:[a-f0-9]{64}$/;
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join() === keys.toSorted().join();
const calendarDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export function validateEvidence(evidence) {
  if (!exactKeys(evidence, ["format", "version", "candidate", "gates"]) || evidence.format !== "kekbot-release-evidence" || evidence.version !== 1) throw new Error("invalid_release_evidence");
  if (!exactKeys(evidence.candidate, ["sourceRef", "imageDigest"]) || evidence.candidate.sourceRef !== null && !sha.test(evidence.candidate.sourceRef) || evidence.candidate.imageDigest !== null && !digest.test(evidence.candidate.imageDigest)) throw new Error("invalid_release_candidate_identity");
  if (!exactKeys(evidence.gates, acceptanceIds)) throw new Error("missing_or_unknown_release_gate");
  for (const row of Object.values(evidence.gates)) {
    if (!exactKeys(row, ["outcome", "date", "reference"]) || !["pending", "pass", "fail", "blocked"].includes(row.outcome)) throw new Error("invalid_release_gate");
    if (row.outcome === "pass" && (!evidence.candidate.sourceRef || !evidence.candidate.imageDigest || !calendarDate(row.date) || !/^docs\/[A-Z_]+\.md#[a-z0-9-]+$/.test(row.reference ?? ""))) throw new Error("release_pass_requires_dated_public_evidence_and_identity");
    if (row.outcome !== "pass" && (row.date !== null || row.reference !== null)) throw new Error("unaccepted_gate_cannot_claim_evidence");
  }
  return evidence;
}
export function releaseBlockers(evidence, { sourceRef, imageDigest, version }) {
  validateEvidence(evidence);
  const blockers = acceptanceIds.filter(id => evidence.gates[id].outcome !== "pass");
  if (!sha.test(sourceRef) || evidence.candidate.sourceRef !== sourceRef) blockers.push("candidate_source_mismatch");
  if (!digest.test(imageDigest ?? "") || evidence.candidate.imageDigest !== imageDigest) blockers.push("candidate_image_mismatch");
  if (!/^[1-9]\d*\.\d+\.\d+$/.test(version)) blockers.push("stable_v1_version_required");
  return blockers;
}
export function readEvidence(path = "docs/release-evidence.json") { return validateEvidence(JSON.parse(readFileSync(path, "utf8"))); }
