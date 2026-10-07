import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "kekbot-packaged-cli-"));
for (const name of ["src", "drizzle"]) cpSync(resolve(".next/standalone", name), join(directory, name), { recursive: true });
cpSync(resolve(".next/standalone/package.json"), join(directory, "package.json"));
mkdirSync(join(directory, "node_modules"));
for (const name of ["better-sqlite3", "drizzle-orm", "zod"]) {
  cpSync(resolve(".next/standalone/node_modules", name), join(directory, "node_modules", name), { recursive: true, dereference: true });
}
const env = { ...process.env, KEKBOT_MODE: "fixture", KEKBOT_DATA_DIR: join(directory, "data"), KEKBOT_RUN_JOBS: "0", KICK_BROADCASTER_USER_ID: "123" };
for (const key of ["KICK_CLIENT_ID", "KICK_CLIENT_SECRET", "KICK_CLIENT_SECRET_FILE", "KEKBOT_ENCRYPTION_KEY_FILE", "KEKBOT_PROOF_TOKEN_FILE"]) delete env[key];
function command(args, environment = env) {
  const result = spawnSync(process.execPath, ["src/cli.ts", ...args], { cwd: directory, env: environment, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`Packaged CLI failed: ${args[0]}`);
  return JSON.parse(result.stdout);
}
try {
  command(["init"]);
  const seed = command(["fixture-seed"]);
  if (seed.widgets !== 18) throw new Error("Incomplete fixture seed");
  const passwordFile = join(directory, "recovery-password");
  writeFileSync(passwordFile, randomBytes(32).toString("base64url"), { mode: 0o600 });
  command(["recover-owner", "fixture-owner", passwordFile]);
  const before = command(["doctor"]);
  if (before.integrity !== "ok" || before.accounts[0]?.count !== 1) throw new Error("Account diagnostics failed");
  command(["backup", join(directory, "backup")]);
  const restoredEnv = { ...env, KEKBOT_DATA_DIR: join(directory, "restored") };
  const secrets = join(directory, "restored", "fixture", "secrets");
  mkdirSync(secrets, { recursive: true });
  for (const name of ["encryption.key", "proof.token", "fixture-public.pem", "fixture-discord-public.pem"]) {
    writeFileSync(join(secrets, name), readFileSync(join(directory, "data", "fixture", "secrets", name)), { mode: 0o600 });
  }
  command(["restore", join(directory, "backup")], restoredEnv);
  const after = command(["doctor"], restoredEnv);
  if (after.integrity !== "ok" || JSON.stringify(after.accounts) !== JSON.stringify(before.accounts)) throw new Error("Restored accounts differ");
  process.stdout.write("Packaged CLI init, fixture seed, owner recovery, diagnostics, backup and separate-directory restore passed outside the checkout.\n");
} finally { rmSync(directory, { recursive: true, force: true }); }
