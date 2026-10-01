export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.KEKBOT_RUN_JOBS === "1") {
    const { registerNodeRuntime } = await import("./server/bootstrap.ts");
    await registerNodeRuntime();
  }
}
