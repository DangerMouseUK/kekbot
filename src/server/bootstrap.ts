import { initializeRuntime } from "./runtime.ts";

let registered = false;
export async function registerNodeRuntime() {
  if (registered) return;
  process.umask(0o077);
  const runtime = await initializeRuntime();
  registered = true;
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await runtime.stop();
    process.exit(0);
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
