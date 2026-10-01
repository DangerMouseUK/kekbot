import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", ...process.argv.slice(2)], {
  stdio: "inherit", env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" }, windowsHide: true
});
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => child.kill(signal));
child.once("error", () => { process.stderr.write("KekBot development server could not start.\n"); process.exitCode = 1; });
child.once("exit", code => { process.exitCode = code ?? 1; });
