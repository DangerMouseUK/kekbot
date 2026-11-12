import { describe, expect, it } from "vitest";
import type { ConfigDocument } from "../src/server/domain/catalog.ts";
import { metricInfo, unitFor } from "../src/server/domain/analytics-metrics.ts";
import { auditSentence, kickEventLabels, successText } from "../src/app/messages.ts";
import { formatBytes, type Snapshot } from "../src/app/ui.tsx";
import { cardSummary } from "../src/app/panels/cards.tsx";
import { crossChecks } from "../src/app/forms/schema.ts";
import { examples } from "../src/app/forms/examples.ts";

// Wording found confusing during the new-streamer walkthrough; each case is what the screen now says.
const doc = (kind: ConfigDocument["kind"], data: Record<string, unknown>) =>
  ({ id: `${kind}-1`, kind, version: 1, updatedAt: 0, data }) as unknown as ConfigDocument;
const snapshot = { viewers: [] } as unknown as Snapshot;

describe("walkthrough wording", () => {
  it("does not claim a manual alert was queued when no Manual alert is enabled", () => {
    expect(successText("alert.manual", { queued: 1 })).toBe("Manual alert queued for your OBS alert source.");
    expect(successText("alert.manual", { queued: 0 })).toMatch(/^Nothing was shown: no enabled alert is set to “Manual alert”/);
  });

  it("says a fixture installation sends nothing to Discord when commands are registered", () => {
    expect(successText("discord.register", { fixture: true, commands: [] })).toMatch(/sends nothing to Discord/);
    expect(successText("discord.register", {})).toBe("Discord commands registered.");
  });

  it("capitalises role descriptions but keeps usernames exactly as typed", () => {
    const row = { id: 1, at: 0, action: "reward.redeem", target: "r", outcome: "ok" };
    expect(auditSentence({ ...row, actor: "kick:502", actorLabel: "viewer_two" })).toMatch(/^viewer_two /);
    expect(auditSentence({ ...row, actor: "account", actorLabel: "the owner" })).toMatch(/^The owner /);
    expect(auditSentence({ ...row, actor: "me", actorLabel: "streamer" }, "me")).toMatch(/^You /);
  });

  it("names Kick event types and large disk sizes in plain words", () => {
    expect(kickEventLabels["livestream.status.updated"]).toBe("Stream went live or offline");
    expect(kickEventLabels["chat.message.sent"]).toBe("Chat message");
    expect(formatBytes(400 * 1024 ** 3)).toBe("400.0 GB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(70)).toBe("70 B");
  });

  it("pluralises goal progress without truncating the word", () => {
    const info = metricInfo("goals.increments");
    expect(`1 ${unitFor(info, 1)}`).toBe("1 update");
    expect(`3 ${unitFor(info, 3)}`).toBe("3 updates");
  });

  it("summarises cards with the editor's names instead of stored values", () => {
    expect(cardSummary("widget", doc("widget", { type: "queue", theme: "mint", width: 800, height: 400 }), snapshot)).toBe(
      "Upcoming media requests · Mint theme · 800 × 400",
    );
    expect(
      cardSummary("guild", doc("guild", { guildId: "1", channelId: "2", events: ["live", "engagement"], roles: [{ id: "3", permission: "media" }], users: [] }), snapshot),
    ).toBe("Server 1 · channel 2 · posts go-live, polls, raffles and rewards · 1 permission grants");
    expect(cardSummary("raffle", doc("raffle", { status: "closed", minPoints: 0, roles: [] }), snapshot)).toBe("Entries closed");
    expect(cardSummary("raffle", doc("raffle", { status: "open", minPoints: 0, roles: [] }), snapshot)).toBe("Viewers type !enter");
    expect(cardSummary("poll", doc("poll", { status: "closed", options: ["A", "B"] }), snapshot)).toBe("2 options");
  });

  it("points built-in reply commands to Maintenance instead of only refusing them", () => {
    expect(crossChecks("command", { ...examples.command, trigger: "!discord" }, [], undefined).errors.trigger).toMatch(/Maintenance → Edit settings/);
    expect(crossChecks("command", { ...examples.command, trigger: "!points" }, [], undefined).errors.trigger).toBe(
      "!points is a built-in command. Choose a different trigger.",
    );
  });

  it("uses an example reward description that does not repeat the fulfilment wording", () => {
    const summary = cardSummary("reward", doc("reward", examples.reward), snapshot);
    expect(summary.match(/fulfilled by a moderator/gi)).toHaveLength(1);
  });
});
