import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { parseArgs } from "node:util";
import { createGzip } from "node:zlib";
import { auditImage } from "./image-audit.mjs";
import { readEvidence, releaseBlockers } from "./release-policy.mjs";

const { values } = parseArgs({ options: { "source-only": { type: "boolean" }, image: { type: "string" }, gitleaks: { type: "string" }, stable: { type: "boolean" }, evidence: { type: "string", default: "docs/release-evidence.json" } } });
const run = (command, args) => execFileSync(command, args, { encoding: "utf8", windowsHide: true }).trim();
try {
  if (values["source-only"] && values.image || !values["source-only"] && !values.image || values.stable && values["source-only"]) throw new Error("invalid_release_package_arguments");
  if (run("git", ["status", "--porcelain", "--untracked-files=normal"])) throw new Error("release_requires_clean_committed_source");
  run(process.execPath, ["scripts/check-publication.mjs"]);
  const sourceRef = run("git", ["rev-parse", "HEAD"]), { version } = JSON.parse(readFileSync("package.json", "utf8"));
  if (!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(version)) throw new Error("invalid_release_version");
  const evidence = readEvidence(values.evidence);
  const image = values.image ? auditImage(values.image, values.gitleaks, { sourceRef, version }) : null;
  if (values.stable && releaseBlockers(evidence, { sourceRef, version, imageDigest: image?.imageId }).length) throw new Error("stable_release_acceptance_pending");
  if (values.stable) run(process.execPath, ["scripts/check-release.mjs", "--stable", "--evidence", resolve(values.evidence), "--image-digest", image.imageId]);
  const name = `kekbot-${version}-${sourceRef.slice(0, 12)}`, destination = resolve("output/release", name);
  if (existsSync(destination)) throw new Error("release_output_already_exists");
  mkdirSync(destination, { recursive: true });
  const source = `${name}-source.tar.gz`;
  run("git", ["archive", "--format=tar.gz", `--prefix=${name}/`, "--output", join(destination, source), sourceRef]);
  if (image) {
    const save = spawn("docker", ["save", values.image], { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
    const exited = new Promise((resolveExit, reject) => { save.once("error", reject); save.once("exit", code => code === 0 ? resolveExit() : reject(new Error("release_image_save_failed"))); });
    await Promise.all([pipeline(save.stdout, createGzip(), createWriteStream(join(destination, `${name}-linux-amd64-image.tar.gz`))), exited]);
    const legal = mkdtempSync(join(tmpdir(), "kekbot-release-legal-")); let container;
    try {
      container = run("docker", ["create", values.image]);
      run("docker", ["cp", `${container}:/app/THIRD_PARTY_LICENSES`, legal]);
      const inventory = JSON.parse(readFileSync(join(legal, "THIRD_PARTY_LICENSES/index.json"), "utf8"));
      if (!inventory.length || inventory.some(pkg => !pkg.notices.length || new Set(pkg.notices).size !== pkg.notices.length || pkg.notices.some(path => !existsSync(join(legal, "THIRD_PARTY_LICENSES", `${pkg.name.replaceAll("/", "_")}@${pkg.version}`, path)) || !readFileSync(join(legal, "THIRD_PARTY_LICENSES", `${pkg.name.replaceAll("/", "_")}@${pkg.version}`, path)).length))) throw new Error("release_license_inventory_incomplete");
      run("docker", ["cp", `${container}:/app/LICENSE`, legal]);
      run("docker", ["cp", `${container}:/app/DEPENDENCIES.md`, legal]);
      run("tar", ["--create", "--gzip", "--file", join(destination, `${name}-notices.tar.gz`), "--directory", legal, "LICENSE", "DEPENDENCIES.md", "THIRD_PARTY_LICENSES"]);
    } finally {
      if (container) run("docker", ["rm", container]);
      if (!resolve(legal).startsWith(resolve(tmpdir(), "kekbot-release-legal-"))) throw new Error("unexpected_legal_cleanup_path");
      rmSync(legal, { recursive: true, force: true });
    }
  }
  writeFileSync(join(destination, "release.json"), JSON.stringify({ format: "kekbot-release", version: 1, applicationVersion: version, sourceRef, sourceArchive: source, image, status: values.stable ? "acceptance-verified-unpublished" : "candidate-unaccepted", reproducibility: "Exact locked inputs and source identity; image bytes may vary with base image/toolchain. Archive SHA256 verifies these artifacts, not an identical rebuild.", schemaVersion: 2, backupFormat: 1 }, null, 2) + "\n");
  const sums = [];
  for (const file of readdirSync(destination).sort()) {
    const hash = createHash("sha256"); for await (const bytes of createReadStream(join(destination, file))) hash.update(bytes);
    sums.push(`${hash.digest("hex")}  ${file}`);
  }
  writeFileSync(join(destination, "SHA256SUMS"), sums.join("\n") + "\n");
  process.stdout.write(`Prepared ${values["source-only"] ? "source-only" : "source/image/notices"} ${values.stable ? "acceptance-verified" : "unaccepted candidate"} package ${name}. No tag, registry or release was published.\n`);
} catch (error) {
  const code = /^[a-z_]+$/.test(error.message) ? error.message : "release_package_failed";
  process.stderr.write(`${code}; no runtime configuration or credential values printed.\n`); process.exitCode = 1;
}
