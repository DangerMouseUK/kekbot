import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const exact = /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/;
const keys = (value, expected) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join() === expected.toSorted().join();
export function dependencyPolicy(root = ".") {
  const read = path => readFileSync(resolve(root, path), "utf8");
  const pkg = JSON.parse(read("package.json")), problems = [];
  for (const group of ["dependencies", "devDependencies"]) for (const [name, version] of Object.entries(pkg[group] ?? {})) {
    if (!exact.test(version)) problems.push(`unfixed_dependency:${name}`);
  }
  const node = read(".node-version").trim(), pnpm = pkg.packageManager?.match(/^pnpm@(\d+\.\d+\.\d+)$/)?.[1];
  if (!exact.test(node) || pkg.engines?.node !== `>=${node} <${Number(node.split(".")[0]) + 1}`) problems.push("node_pin_mismatch");
  if (!pnpm || pkg.engines?.pnpm !== pnpm || !read("Dockerfile").includes(`pnpm@${pnpm}`)) problems.push("pnpm_pin_mismatch");
  const bases = [...read("Dockerfile").matchAll(/^FROM node:([^\s@]+)(?:@sha256:[a-f0-9]{64})?/gm)];
  if (bases.length !== 2 || bases.some(match => match[1] !== `${node}-bookworm-slim`)) problems.push("node_image_pin_mismatch");
  for (const line of read(".github/workflows/ci.yml").split("\n")) {
    if (/uses:/.test(line) && !/uses: [a-zA-Z0-9_.-]+\/[a-zA-Z0-9_./-]+@[a-f0-9]{40}(?:\s|$)/.test(line)) problems.push("unpinned_workflow_action");
  }
  if (!read(".npmrc").includes("save-exact=true")) problems.push("save_exact_required");
  return problems;
}

export function validateDependencyReview(value) {
  if (!keys(value, ["format", "version", "candidate", "reviews"]) || value.format !== "kekbot-dependency-review" || value.version !== 1 || !keys(value.candidate, ["sourceRef", "imageDigest"]) || !keys(value.reviews, ["application", "tooling", "image", "licenses"])) throw new Error("invalid_dependency_review");
  if (value.candidate.sourceRef !== null && !/^[a-f0-9]{40}$/.test(value.candidate.sourceRef) || value.candidate.imageDigest !== null && !/^sha256:[a-f0-9]{64}$/.test(value.candidate.imageDigest)) throw new Error("invalid_dependency_candidate");
  for (const review of Object.values(value.reviews)) {
    if (!keys(review, ["outcome", "date", "reference"]) || !["pending", "pass", "fail", "blocked"].includes(review.outcome)) throw new Error("invalid_dependency_review_result");
    if (review.outcome === "pass") {
      if (!value.candidate.sourceRef || !value.candidate.imageDigest || typeof review.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(review.date) || !Number.isFinite(Date.parse(review.date)) || new Date(review.date).toISOString().slice(0, 10) !== review.date || !/^docs\/[A-Z_]+\.md#[a-z0-9-]+$/.test(review.reference ?? "")) throw new Error("dependency_pass_requires_evidence");
    } else if (review.date !== null || review.reference !== null) throw new Error("unaccepted_dependency_review_has_evidence");
  }
  return value;
}

export function dependencyBlockers(review, sourceRef, imageDigest) {
  validateDependencyReview(review);
  return [
    ...Object.entries(review.reviews).filter(([, row]) => row.outcome !== "pass").map(([name]) => `dependency_${name}_unaccepted`),
    ...(review.candidate.sourceRef !== sourceRef ? ["dependency_source_mismatch"] : []),
    ...(review.candidate.imageDigest !== imageDigest ? ["dependency_image_mismatch"] : [])
  ];
}
