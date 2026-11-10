import { afterEach, describe, expect, it } from "vitest";
import { readFileSync, rmSync } from "node:fs";
import { AuthService } from "../src/server/auth.ts";
import { BotService } from "../src/server/domain/bot.ts";
import { ERASED_VIEWER } from "../src/server/domain/state.ts";
import { environment, repository } from "./helpers.ts";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const fn of cleanup.splice(0).reverse()) fn();
});
async function setup() {
  const env = environment();
  cleanup.push(() => rmSync(env.root, { recursive: true, force: true }));
  const repo = repository(env.config);
  cleanup.push(() => repo.store.close());
  const auth = new AuthService(repo),
    bot = new BotService(repo, env.config);
  const login = await auth.setup(readFileSync(env.config.setupTokenFile, "utf8").trim(), {
    username: "owner",
    password: "a strong fixture password",
  });
  const owner = auth.session(login.token);
  const invite = auth.invite(owner, "readonly");
  const reader = auth.session(
    (
      await auth.acceptInvite(invite.token, {
        username: "reader",
        password: "a readonly fixture password",
      })
    ).token,
  );
  const chat = (id: string, user: number, username: string, content: string) => {
    repo.acceptReceipt(id, "chat.message.sent", {
      content,
      message_id: `message-${id}`,
      sender: { user_id: user, username },
      broadcaster: { user_id: 123 },
    });
    bot.event(repo.claim()!);
  };
  return { repo, bot, owner, reader, chat };
}

describe("dashboard read models", () => {
  it("bounds viewer search, treats wildcards literally and omits erased viewers", async () => {
    const { repo, bot } = await setup();
    const add = repo.store.sqlite.prepare(
      "INSERT INTO viewers(id,name,role,last_seen,messages) VALUES(?,?,'viewer',?,1)",
    );
    add.run("1", "under_score", 3);
    add.run("2", "underXscore", 2);
    add.run("3", ERASED_VIEWER, 1);
    for (let i = 0; i < 30; i++) add.run(String(100 + i), `Bulk ${i}`, 10 + i);
    expect(bot.state.searchViewers("_").map((row) => (row as { id: string }).id)).toEqual(["1"]);
    expect(bot.state.searchViewers("%")).toEqual([]);
    expect(bot.state.searchViewers("2").some((row) => (row as { id: string }).id === "2")).toBe(
      true,
    );
    expect(bot.state.searchViewers("Erased")).toEqual([]);
    expect(bot.state.searchViewers("")).toHaveLength(20);
    expect(() => bot.state.searchViewers("x".repeat(51))).toThrow();
  });

  it("shows recent chat and message references only to moderation authority", async () => {
    const { bot, owner, reader, chat } = await setup();
    bot.state.save(owner, "rule", undefined, { name: "No links", type: "link", action: "warn" });
    chat("one", 456, "Fixture viewer", "hello there");
    chat("two", 456, "Fixture viewer", "visit spam.example now");
    const ownerView = bot.state.snapshot(owner);
    expect(ownerView.recentChat.map((row) => (row as { text: string }).text)).toEqual([
      "visit spam.example now",
      "hello there",
    ]);
    expect(ownerView.recentChat[0]).toMatchObject({
      messageId: "message-two",
      userId: 456,
      flagged: 1,
    });
    expect(ownerView.incidents[0]).toMatchObject({
      viewerName: "Fixture viewer",
      ruleName: "No links",
      messageId: "message-two",
    });
    expect(bot.state.snapshot(reader).recentChat).toEqual([]);
  });

  it("labels audit actors by role for non-owners and names viewers and timers", async () => {
    const { bot, owner, reader, chat, repo } = await setup();
    const goal = bot.state.save(owner, "goal", undefined, {
      name: "Follows",
      metric: "manual",
      target: 10,
    });
    const timer = bot.state.save(owner, "timer", undefined, {
      name: "Reminder",
      messages: ["Hi"],
      interval: 60,
      minMessages: 2,
    });
    chat("one", 456, "Fixture viewer", "hello");
    bot.engagement.adjust(owner, "456", 25, "Welcome bonus");
    const ownerAudit = bot.state.snapshot(owner).audit as Record<string, unknown>[];
    const readerAudit = bot.state.snapshot(reader).audit as Record<string, unknown>[];
    expect(ownerAudit.find((row) => row.target === goal.id)).toMatchObject({
      actorLabel: "owner",
      targetName: "Follows",
    });
    expect(readerAudit.find((row) => row.target === goal.id)).toMatchObject({
      actorLabel: "the owner",
    });
    expect(JSON.stringify(readerAudit)).not.toContain('"actorLabel":"owner"');
    expect(readerAudit.find((row) => row.action === "points.adjust")).toMatchObject({
      viewerName: "Fixture viewer",
    });
    expect(bot.state.snapshot(reader).leaderboard[0]).toMatchObject({
      viewer: "456",
      name: "Fixture viewer",
      balance: 25,
    });

    bot.automation.recoverTimers(1000);
    expect(bot.state.snapshot(owner).timers).toEqual([
      { id: timer.id, next: 61000, waitingMessages: 2, lastSent: null },
    ]);
    repo.store.sqlite
      .prepare(
        "INSERT INTO jobs(id,kind,payload,status,due_at,created_at) VALUES(?,'kick.reply','{}','succeeded',0,5)",
      )
      .run(`timer:${timer.id}:5`);
    expect(bot.state.snapshot(owner).timers[0].lastSent).toEqual({
      status: "succeeded",
      at: 5,
      error: null,
    });
  });
});
