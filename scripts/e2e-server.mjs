import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = mkdtempSync(join(tmpdir(), "kekbot-e2e-"));
const env = { ...process.env, KEKBOT_MODE: "fixture", KEKBOT_DATA_DIR: root, KEKBOT_RUN_JOBS: "1", KEKBOT_ENABLE_PROOF: "1", NEXT_TELEMETRY_DISABLED: "1",
  KICK_BROADCASTER_USER_ID: "123", KEKBOT_PUBLIC_URL: "http://127.0.0.1:3137", PORT: "3137", HOSTNAME: "127.0.0.1" };
for (const key of ["KICK_CLIENT_ID", "KICK_CLIENT_SECRET", "KICK_CLIENT_SECRET_FILE", "KEKBOT_ENCRYPTION_KEY_FILE", "KEKBOT_PROOF_TOKEN_FILE"]) delete env[key];
const initialized = spawnSync(process.execPath, ["src/cli.ts", "init"], { env, encoding: "utf8", windowsHide: true });
if (initialized.status !== 0) { process.stderr.write(initialized.stdout + initialized.stderr); process.exit(1); }
mkdirSync("output/playwright", { recursive: true });
writeFileSync(resolve("output/playwright/e2e-data-path.txt"), root, { mode: 0o600 });
const child = spawn(process.execPath, ["scripts/start.mjs"], { env, stdio: "inherit", windowsHide: true });
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => child.kill(signal));
child.once("exit", code => { process.exitCode = code ?? 1; });
