import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { Runtime } from "../src/server/runtime.ts";
import { jobs } from "../src/server/storage/schema.ts";
import { environment, fixtureChat, repository } from "./helpers.ts";
import { DeliveryError } from "../src/server/errors.ts";

describe("bounded background runtime", () => {
  it("renews its installation lease while a provider request outlasts the original lease", async () => {
    vi.useFakeTimers();
    const { config } = environment(), runtime = new Runtime(config);
    Object.assign(runtime.config, { mode: "live" });
    let complete!: () => void;
    const reply = vi.spyOn(runtime.kick, "reply").mockImplementation(() => new Promise<void>(resolve => { complete = resolve; }));
    try {
      runtime.repository.enqueue("slow-provider", "kick.reply", {}, 0);
      runtime.start(); await Promise.resolve();
      expect(reply).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(35000);
      expect(() => runtime.repository.acquireLease("competing-runtime")).toThrow("instance_already_running_or_in_maintenance");
      expect(runtime.healthy()).toBe(true);
    } finally { complete?.(); await runtime.stop(); vi.useRealTimers(); }
  });
  it("processes persisted work without a dashboard and resumes after restart", async () => {
    const { config } = environment();
    const repo = repository(config);
    repo.acceptReceipt("offline-delivery", "chat.message.sent", fixtureChat());
    repo.store.close();
    const first = new Runtime(config); first.start();
    try {
      await vi.waitFor(() => expect(first.repository.setting("fixture_last_reply")).toBe("reply:offline-delivery"));
      expect(first.healthy()).toBe(true);
    } finally { await first.stop(); }
    const second = new Runtime(config); second.start();
    try {
      expect(second.repository.acceptReceipt("offline-delivery", "chat.message.sent", fixtureChat())).toBe(false);
      second.repository.enqueue("after-restart", "proof.record", {});
      await vi.waitFor(() => expect(second.repository.setting("proof_last_record")).toBe("after-restart"));
      expect(second.repository.store.orm.select().from(jobs).where(eq(jobs.id, "reply:offline-delivery")).all()).toHaveLength(1);
    } finally { await second.stop(); }
  });

  it("does not start when jobs are disabled", async () => {
    const { config } = environment();
    const runtime = new Runtime({ ...config, runJobs: false });
    try {
      expect(() => runtime.start()).toThrow("runtime_disabled_set_KEKBOT_RUN_JOBS");
      expect(runtime.repository.setting("worker_heartbeat")).toBeUndefined();
    } finally { await runtime.stop(); }
  });

  it("records ambiguous provider delivery instead of resending", async () => {
    const { config } = environment("live");
    const runtime = new Runtime(config);
    try {
      runtime.repository.enqueue("uncertain", "kick.reply", {}, 0);
      const job = runtime.repository.claim()!;
      vi.spyOn(runtime.kick, "reply").mockRejectedValue(new DeliveryError("kick_network_error", "uncertain"));
      await runtime.execute(job);
      expect(runtime.repository.store.orm.select().from(jobs).where(eq(jobs.id, job.id)).get()?.status).toBe("uncertain");
      expect(runtime.repository.claim()).toBeUndefined();
    } finally { await runtime.stop(); }
  });
});
