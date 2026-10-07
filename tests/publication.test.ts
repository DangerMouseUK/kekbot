import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    if (!resolve(directory).startsWith(resolve(tmpdir(), "kekbot-publication-test-"))) throw new Error("unexpected_cleanup_path");
    rmSync(directory, { recursive: true, force: true });
  }
});
function checkout() {
  const cwd = mkdtempSync(join(tmpdir(), "kekbot-publication-test-"));
  directories.push(cwd);
  const git = (args: string[]) => execFileSync("git", ["-c", "core.autocrlf=false", ...args], { cwd, encoding: "utf8", windowsHide: true });
  git(["init", "--quiet"]);
  return { cwd, git, check: () => spawnSync(process.execPath, [resolve("scripts/check-publication.mjs")], { cwd, encoding: "utf8", windowsHide: true }) };
}

describe("publication boundary", () => {
  it("handles unstaged deletions while still inspecting indexed private material", () => {
    const repo = checkout(), path = join(repo.cwd, "obsolete.txt");
    writeFileSync(path, "obsolete clean implementation"); repo.git(["add", "obsolete.txt"]); unlinkSync(path);
    expect(repo.check().status).toBe(0);
    const pair = generateKeyPairSync("ed25519", { privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
    writeFileSync(path, pair.privateKey); repo.git(["add", "obsolete.txt"]); unlinkSync(path);
    const result = repo.check();
    expect(result.status).toBe(1); expect(result.stderr).toContain("private key or personal path");
    expect(result.stderr).not.toContain(pair.privateKey);
  });
  it("allows reusable config and an empty provider example", () => {
    const repo = checkout();
    writeFileSync(join(repo.cwd, ".env.example"), "KEKBOT_MODE=fixture\nKICK_CLIENT_ID=\nKICK_CLIENT_SECRET=\n");
    writeFileSync(join(repo.cwd, "compose.yaml"), "services: {}\n");
    expect(repo.check().status).toBe(0);
  });

  it("rejects forced tracking of ignored runtime config without printing its values", () => {
    const repo = checkout();
    writeFileSync(join(repo.cwd, ".gitignore"), "*.env\n");
    writeFileSync(join(repo.cwd, "runtime.env"), "private-runtime-fixture\n");
    repo.git(["add", "--force", "runtime.env"]);
    const result = repo.check();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("runtime.env: private artifact");
    expect(result.stderr).not.toContain("private-runtime-fixture");
  });

  it("rejects private key material saved under an ordinary filename", () => {
    const repo = checkout();
    const pair = generateKeyPairSync("ed25519", { privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
    writeFileSync(join(repo.cwd, "notes.txt"), pair.privateKey);
    const result = repo.check();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("notes.txt: private key or personal path");
    expect(result.stderr).not.toContain(pair.privateKey);
  });

  it("rejects filled provider examples and private evidence filenames", () => {
    const repo = checkout();
    writeFileSync(join(repo.cwd, ".env.example"), ["KICK_CLIENT_ID", "fixture-provider-value\n"].join("="));
    writeFileSync(join(repo.cwd, "kick-live-evidence.json"), "{}");
    const result = repo.check();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("provider-specific example values must be empty");
    expect(result.stderr).toContain("private artifact cannot be published");
    expect(result.stderr).not.toContain("fixture-provider-value");
  });
});
