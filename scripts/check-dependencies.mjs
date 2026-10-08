import { readFileSync } from "node:fs";
import { dependencyPolicy, validateDependencyReview } from "./dependency-policy.mjs";
try {
  const problems = dependencyPolicy();
  validateDependencyReview(JSON.parse(readFileSync("docs/dependency-review.json", "utf8")));
  if (problems.length) throw new Error(problems.join(", "));
  process.stdout.write("Exact dependency/toolchain/CI pins and dependency-review structure passed. This offline check is not a vulnerability scan or release sign-off.\n");
} catch (error) { process.stderr.write(`Dependency policy failed: ${error.message}\n`); process.exitCode = 1; }
