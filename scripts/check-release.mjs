import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { readEvidence, releaseBlockers } from "./release-policy.mjs";

const { values } = parseArgs({ options: { stable: { type: "boolean" }, source: { type: "string", default: "." }, evidence: { type: "string", default: "docs/release-evidence.json" }, "image-digest": { type: "string" } } });
try {
  const evidence = readEvidence(values.evidence), source = resolve(values.source), evidenceRoot = resolve(dirname(values.evidence), "..");
  for (const row of Object.values(evidence.gates)) if (row.reference) {
    const [file, anchor] = row.reference.split("#");
    const content = readFileSync(resolve(evidenceRoot, file), "utf8");
    if (!content.includes(`id="${anchor}"`)) throw new Error("release_evidence_anchor_missing");
  }
  const sourceRef = execFileSync("git", ["rev-parse", "HEAD"], { cwd: source, encoding: "utf8", windowsHide: true }).trim();
  const { version } = JSON.parse(readFileSync(resolve(source, "package.json"), "utf8"));
  const blockers = releaseBlockers(evidence, { sourceRef, imageDigest: values["image-digest"], version });
  process.stdout.write(`Release evidence valid; ${Object.values(evidence.gates).filter(row => row.outcome !== "pass").length} acceptance gates pending or unaccepted.\n`);
  if (values.stable && blockers.length) { process.stderr.write(`Stable release blocked: ${blockers.join(", ")}.\n`); process.exitCode = 1; }
} catch { process.stderr.write("Release evidence or source identity is invalid.\n"); process.exitCode = 1; }
