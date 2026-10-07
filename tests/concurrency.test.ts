import { Worker } from "node:worker_threads";
import { rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { seedFixture } from "../src/server/fixture-seed.ts";
import { BotService } from "../src/server/domain/bot.ts";
import type { Actor } from "../src/server/auth.ts";
import { environment, repository } from "./helpers.ts";

const cleanup: (() => void)[] = [];
afterEach(() => { for (const fn of cleanup.splice(0).reverse()) fn(); });
async function setup() {
  const context = environment(); cleanup.push(() => rmSync(context.root, { recursive: true, force: true }));
  await seedFixture(context.config);
  const repo = repository(context.config); cleanup.push(() => repo.store.close());
  const account = repo.store.sqlite.prepare("SELECT id,role FROM accounts WHERE role='owner'").get() as { id: string; role: "owner" };
  return { ...context, repo, bot: new BotService(repo, context.config), owner: { ...account, permissions: [] } as Actor };
}
type Outcome = { ok: boolean; result?: unknown; error?: string };
async function race(env: ReturnType<typeof environment>["env"], operations: { name: string; input: Record<string, string | number> }[]) {
  const workers = operations.map(operation => new Worker(new URL("./support/contender.ts", import.meta.url), { workerData: { env, ...operation }, execArgv: [] }));
  try {
    const results = workers.map(worker => new Promise<Outcome>((resolve, reject) => {
      worker.once("error", reject);
      worker.once("exit", code => { if (code !== 0) reject(new Error(`contender_exited_${code}`)); });
      worker.once("message", () => worker.once("message", resolve));
    }));
    await Promise.all(workers.map(worker => new Promise<void>((resolve, reject) => { worker.once("message", () => resolve()); worker.once("error", reject); })));
    for (const worker of workers) worker.postMessage("start");
    return await Promise.all(results);
  } finally { await Promise.all(workers.map(worker => worker.terminate())); }
}

describe("separate-connection SQLite contention", () => {
  it("commits one receipt/job pair for simultaneous duplicate deliveries", async () => {
    const { env, repo } = await setup();
    const results = await race(env, Array.from({ length: 6 }, () => ({ name: "receipt", input: { id: "contended-delivery" } })));
    expect(results.every(result => result.ok)).toBe(true);
    expect(results.filter(result => result.result === true)).toHaveLength(1);
    expect(repo.store.sqlite.prepare("SELECT count(*) AS n FROM jobs WHERE id='event:contended-delivery'").get()).toEqual({ n: 1 });
    expect(repo.store.sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
  });

  it("allows one approval and rejects every stale concurrent approval", async () => {
    const { env, bot, owner } = await setup();
    const settings = bot.state.document("instance")!; bot.state.save(owner, "settings", "instance", { ...settings.data, mediaEnabled: true, requestCooldown: 0 }, settings.version);
    const item = bot.media.request("abcdefghijk", "456"); await bot.media.validate(item.id, false);
    const results = await race(env, Array.from({ length: 4 }, () => ({ name: "approve", input: { id: item.id, version: bot.media.item(item.id)!.version } })));
    expect(results.filter(result => result.ok)).toHaveLength(1);
    expect(results.filter(result => !result.ok).every(result => result.error === "media_changed_reload")).toBe(true);
    expect(bot.media.item(item.id)?.status).toBe("approved");
  });

  it("cannot overspend under concurrent redemptions or refund one redemption twice", async () => {
    const { env, bot, owner, repo } = await setup();
    const reward = bot.state.save(owner, "reward", "contended-reward", { name: "Contended reward", cost: 100 });
    const results = await race(env, Array.from({ length: 4 }, (_, index) => ({ name: "redeem", input: { id: `contended-${index}`, reward: reward.id } })));
    expect(results.filter(result => result.ok)).toHaveLength(1);
    expect(results.filter(result => !result.ok).every(result => result.error === "insufficient_points")).toBe(true);
    expect(bot.engagement.balance("456")).toBe(0);
    const redemption = repo.store.sqlite.prepare("SELECT id FROM redemptions WHERE reward=?").get(reward.id) as { id: string };
    const refunds = await race(env, Array.from({ length: 4 }, () => ({ name: "refund", input: { id: redemption.id } })));
    expect(refunds.filter(result => result.ok)).toHaveLength(1);
    expect(bot.engagement.balance("456")).toBe(100);
    expect(repo.store.sqlite.prepare("SELECT count(*) AS n FROM ledger WHERE id=?").get(`refund:${redemption.id}`)).toEqual({ n: 1 });
  });

  it("keeps one identity vote and one audited draw with concurrent callers", async () => {
    const { env, bot, owner, repo } = await setup();
    const poll = bot.state.save(owner, "poll", "contended-poll", { name: "Poll", options: ["A", "B"], endsAt: Date.now() + 60000 });
    const votes = await race(env, [1, 2, 1, 2].map(choice => ({ name: "vote", input: { id: poll.id, choice } })));
    expect(votes.some(result => result.ok)).toBe(true);
    expect(votes.filter(result => !result.ok).every(result => result.error === "vote_already_cast")).toBe(true);
    expect(repo.store.sqlite.prepare("SELECT count(*) AS n FROM participation WHERE activity=?").get(poll.id)).toEqual({ n: 1 });
    const raffle = bot.state.save(owner, "raffle", "contended-raffle", { name: "Raffle", endsAt: Date.now() + 60000 });
    bot.engagement.enter(raffle.id, "456", "viewer"); bot.engagement.enter(raffle.id, "789", "viewer"); bot.engagement.close(owner, raffle.id);
    const draws = await race(env, Array.from({ length: 4 }, () => ({ name: "draw", input: { id: raffle.id } })));
    expect(draws.filter(result => result.ok)).toHaveLength(1);
    expect(repo.store.sqlite.prepare("SELECT count(*) AS n FROM audit WHERE action='raffle.draw' AND target LIKE ?").get(`${raffle.id}:%`)).toEqual({ n: 1 });
  });

  it("grants one player lease and skips or completes the current item once", async () => {
    const { env, bot, owner } = await setup();
    const settings = bot.state.document("instance")!; bot.state.save(owner, "settings", "instance", { ...settings.data, mediaEnabled: true, requestCooldown: 0 }, settings.version);
    const first = bot.media.request("abcdefghijk", "456"), second = bot.media.request("lmnopqrstuv", "789"), third = bot.media.request("0123456789a", "999");
    for (const item of [first, second, third]) await bot.media.validate(item.id, true);
    bot.media.control(owner, "resume", bot.media.player.version);
    const credentials = ["synthetic-one", "synthetic-two", "synthetic-three"];
    const leases = await race(env, credentials.map(credential => ({ name: "lease", input: { credential } })));
    expect(leases.filter(result => result.ok)).toHaveLength(1);
    const index = leases.findIndex(result => result.ok), lease = (leases[index].result as { lease: string }).lease;
    const version = bot.media.player.version;
    const outcomes = await race(env, [{ name: "skip", input: { version } }, { name: "ended", input: { version, lease, id: first.id, credential: credentials[index] } }]);
    expect(outcomes.filter(result => result.ok)).toHaveLength(1);
    expect(bot.media.player.current).toBe(second.id);
    expect(["skipped", "completed"]).toContain(bot.media.item(first.id)?.status);
    expect(bot.media.item(third.id)?.status).toBe("approved");
  });

  it("preserves one winning optimistic configuration edit", async () => {
    const { env, bot, owner } = await setup();
    const command = bot.state.save(owner, "command", "contended-command", { name: "Original", trigger: "!contended", responses: ["Synthetic response"] });
    const results = await race(env, Array.from({ length: 4 }, (_, index) => ({ name: "edit", input: { id: command.id, version: command.version, name: `Edit ${index}` } })));
    expect(results.filter(result => result.ok)).toHaveLength(1);
    expect(results.filter(result => !result.ok).every(result => result.error === "configuration_changed_reload")).toBe(true);
    expect(bot.state.document(command.id)?.version).toBe(command.version + 1);
  });
});
