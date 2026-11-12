import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, rmSync } from "node:fs";
import { AuthService } from "../src/server/auth.ts";
import { BotService } from "../src/server/domain/bot.ts";
import type { ConfigDocument } from "../src/server/domain/catalog.ts";
import { availabilityFields, availabilityOptions, commandAvailability, type Availability } from "../src/app/forms/availability.ts";
import { examples } from "../src/app/forms/examples.ts";
import { cardSummary } from "../src/app/panels/cards.tsx";
import type { Snapshot } from "../src/app/ui.tsx";
import { environment, repository } from "./helpers.ts";

// The command editor shows one "When it works" choice for the stored `condition` + `streamOnly`
// pair. These run real commands through the bot so the displayed choice is checked against what
// the runtime actually does, live and offline.
const cleanup: (() => void)[] = [];
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(1_800_000_000_000); });
afterEach(() => { vi.useRealTimers(); for (const fn of cleanup.splice(0).reverse()) fn(); });

async function setup() {
  const env = environment(); cleanup.push(() => rmSync(env.root, { recursive: true, force: true }));
  const repo = repository(env.config); cleanup.push(() => repo.store.close());
  const auth = new AuthService(repo), bot = new BotService(repo, env.config);
  const login = await auth.setup(readFileSync(env.config.setupTokenFile, "utf8").trim(), { username: "owner", password: "a strong fixture password" });
  const owner = auth.session(login.token)!;
  let receipt = 0, commands = 0;
  const save = (fields: Record<string, unknown>) => {
    const trigger = `!when_${++commands}`;
    bot.state.save(owner, "command", undefined, { ...examples.command, name: trigger, trigger, cooldown: 0, userCooldown: 0, responses: ["ok"], ...fields });
    return trigger;
  };
  /** Which of offline/live the command replies in, as an availability choice. */
  const observe = (trigger: string): Availability => {
    const replies = (["false", "true"] as const).map((live) => {
      repo.set("stream_is_live", live);
      vi.setSystemTime(Date.now() + 6000); // Past the per-viewer command guard.
      const id = `receipt-${++receipt}`;
      let job; while ((job = repo.claim())) repo.finish(job, "succeeded");
      repo.acceptReceipt(id, "chat.message.sent", { content: trigger, message_id: id, broadcaster: { user_id: 123 }, sender: { user_id: 456, username: "FixtureViewer", identity: null } });
      bot.event(repo.claim()!);
      return Boolean(repo.store.sqlite.prepare("SELECT 1 FROM jobs WHERE id=?").get(`reply:${id}`));
    });
    return replies[0] && replies[1] ? "always" : replies[1] ? "live" : replies[0] ? "offline" : "never";
  };
  return { save, observe };
}

const stored = [false, true].flatMap((streamOnly) => (["always", "live", "offline"] as const).map((condition) => ({ streamOnly, condition })));

describe("command availability", () => {
  it("shows every stored combination as the choice the runtime actually follows", async () => {
    const { save, observe } = await setup();
    for (const fields of stored) expect(observe(save(fields)), JSON.stringify(fields)).toBe(commandAvailability(fields));
  });

  it("saves each editor choice as fields the runtime follows, without the legacy switch", async () => {
    const { save, observe } = await setup();
    for (const choice of ["always", "live", "offline"] as const) {
      // Starting from the legacy "Require a live stream" switch, choosing clears it.
      const fields = availabilityFields(choice, { condition: "always", streamOnly: true });
      expect(fields).toEqual({ condition: choice, streamOnly: false });
      expect(observe(save(fields))).toBe(choice);
    }
  });

  it("offers Never only to display an existing contradictory command, and keeps it unchanged", () => {
    const never = { condition: "offline", streamOnly: true };
    expect(commandAvailability(never)).toBe("never");
    expect(availabilityFields("never", never)).toEqual(never);
    expect(availabilityOptions("never").map((option) => option.value)).toContain("never");
    expect(availabilityOptions("live").map((option) => option.value)).toEqual(["always", "live", "offline"]);
    // A missing condition (older documents) reads as the schema default.
    expect(commandAvailability({})).toBe("always");
    expect(commandAvailability({ streamOnly: true })).toBe("live");
  });

  it("says when a command works on its card", () => {
    const snapshot = { viewers: [] } as unknown as Snapshot;
    const card = (data: Record<string, unknown>) =>
      cardSummary("command", { id: "c", kind: "command", version: 1, updatedAt: 0, data: { ...examples.command, ...data } } as unknown as ConfigDocument, snapshot);
    expect(card({})).toBe("!welcome · “Welcome, {user}!”");
    expect(card({ streamOnly: true })).toBe("!welcome · “Welcome, {user}!” · only while live");
    expect(card({ condition: "offline" })).toBe("!welcome · “Welcome, {user}!” · only while offline");
    expect(card({ condition: "offline", streamOnly: true })).toMatch(/never runs/);
  });
});
