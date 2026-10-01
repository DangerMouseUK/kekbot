import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync } from "node:fs";
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
for (const args of [["init"], ["doctor"], ["backup", join(directory, "backup")]]) {
  const result = spawnSync(process.execPath, ["src/cli.ts", ...args], { cwd: directory, env, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) { process.stderr.write(result.stdout + result.stderr); process.exit(1); }
}
process.stdout.write("Packaged CLI initialization, diagnostics, and SQLite backup passed outside the checkout.\n");
