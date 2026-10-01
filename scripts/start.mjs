import { spawn } from "node:child_process";
import { resolve } from "node:path";

const env = { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", NEXT_MANUAL_SIG_HANDLE: "1",
  HOSTNAME: process.env.HOSTNAME ?? "127.0.0.1", KEKBOT_DATA_DIR: resolve(process.env.KEKBOT_DATA_DIR ?? "data") };
for (const key of ["KEKBOT_ENCRYPTION_KEY_FILE", "KEKBOT_PROOF_TOKEN_FILE", "KICK_CLIENT_SECRET_FILE"]) {
  if (env[key]) env[key] = resolve(env[key]);
}
const child = spawn(process.execPath, [".next/standalone/server.js"], { stdio: "inherit", env, windowsHide: true });
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => child.kill(signal));
child.once("error", () => { process.stderr.write("KekBot standalone server could not start. Run pnpm build first.\n"); process.exitCode = 1; });
child.once("exit", code => { process.exitCode = code ?? 1; });
