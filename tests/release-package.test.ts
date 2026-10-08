import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

it("packages only committed public source, verifies identity/checksums and refuses a dirty source", () => {
  const root = mkdtempSync(join(tmpdir(), "kekbot-release-test-"));
  const git = (args: string[]) => execFileSync("git", ["-c", "core.autocrlf=false", ...args], { cwd: root, encoding: "utf8", windowsHide: true }).trim();
  const prepare = () => spawnSync(process.execPath, ["scripts/release-package.mjs", "--source-only"], { cwd: root, encoding: "utf8", windowsHide: true });
  try {
    mkdirSync(join(root, "scripts")); mkdirSync(join(root, "docs"));
    for (const name of ["release-package", "image-audit", "release-policy", "check-publication", "check-dependencies", "dependency-policy"]) cpSync(`scripts/${name}.mjs`, join(root, `scripts/${name}.mjs`));
    cpSync("docs/release-evidence.json", join(root, "docs/release-evidence.json"));
    cpSync("package.json", join(root, "package.json"));
    cpSync("docs/dependency-review.json", join(root, "docs/dependency-review.json"));
    for (const name of [".node-version", ".npmrc", "Dockerfile"]) cpSync(name, join(root, name));
    mkdirSync(join(root, ".github/workflows"), { recursive: true });
    cpSync(".github/workflows/ci.yml", join(root, ".github/workflows/ci.yml"));
    mkdirSync(join(root, "src/server/storage"), { recursive: true });
    cpSync("src/server/storage/database.ts", join(root, "src/server/storage/database.ts"));
    writeFileSync(join(root, ".gitignore"), "output/\nruntime.env\n");
    writeFileSync(join(root, "README.md"), "Public fixture source\n");
    git(["init", "--quiet"]); git(["add", "."]);
    git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "fixture source"]);
    writeFileSync(join(root, "runtime.env"), "PRIVATE_FIXTURE_RUNTIME=never-package-me\n");
    const result = prepare(); expect(result.status, result.stderr).toBe(0);
    const destination = join(root, "output/release", readdirSync(join(root, "output/release"))[0]);
    const manifest = JSON.parse(readFileSync(join(destination, "release.json"), "utf8"));
    expect(manifest).toMatchObject({ sourceRef: git(["rev-parse", "HEAD"]), status: "candidate-unaccepted", image: null });
    const listing = execFileSync("tar", ["-tzf", join(destination, manifest.sourceArchive)], { encoding: "utf8", windowsHide: true });
    expect(listing).toContain("README.md"); expect(listing).not.toContain("runtime.env"); expect(listing).not.toContain("output/");
    for (const line of readFileSync(join(destination, "SHA256SUMS"), "utf8").trim().split("\n")) {
      const [hash, name] = line.split("  "); expect(createHash("sha256").update(readFileSync(join(destination, name))).digest("hex")).toBe(hash);
    }
    writeFileSync(join(root, "README.md"), "Uncommitted change\n");
    expect(prepare().stderr).toContain("release_requires_clean_committed_source");
  } finally {
    if (!resolve(root).startsWith(resolve(tmpdir(), "kekbot-release-test-"))) throw new Error("unexpected_cleanup_path");
    rmSync(root, { recursive: true, force: true });
  }
});
