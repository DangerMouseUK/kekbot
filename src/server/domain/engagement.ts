import { randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Actor } from "../auth.ts";
import { AppError } from "../errors.ts";
import { State } from "./state.ts";
import { configSchemas } from "./catalog.ts";
import { PresentationService } from "./presentation.ts";

export class EngagementService {
  readonly state: State;
  constructor(state: State) { this.state = state; }
  balance(viewer: string) { return (this.state.db.prepare("SELECT coalesce(sum(amount),0) AS balance FROM ledger WHERE viewer=?").get(viewer) as { balance: number }).balance; }
  adjust(actor: Actor, viewer: string, amount: number, reason: string, id: string = randomUUID()) {
    this.state.assertActor(actor, "engage");
    z.string().regex(/^\d{1,24}$/).parse(viewer);
    z.number().int().min(-1000000).max(1000000).parse(amount);
    z.string().min(1).max(200).parse(reason);
    return this.state.db.transaction(() => {
      if (this.state.db.prepare("SELECT 1 FROM ledger WHERE id=?").get(id)) return { balance: this.balance(viewer) };
      if (this.balance(viewer) + amount < 0) throw new AppError("insufficient_points", 409);
      this.state.db.prepare("INSERT INTO ledger(id,viewer,amount,reason,at) VALUES(?,?,?,?,?)").run(id, viewer, amount, reason, Date.now());
      this.state.audit(actor.id, "points.adjust", viewer);
      return { balance: this.balance(viewer) };
    }).immediate();
  }

  accrue(now = Date.now()) {
    const settings = this.state.settings;
    if (!settings.pointsEnabled || this.state.repository.setting("stream_is_live") !== "true") return;
    const interval = settings.pointsInterval * 1000;
    const bucket = Math.floor(now / interval);
    const active = this.state.db.prepare("SELECT id FROM viewers WHERE last_seen>? AND role!='bot'").all(now - settings.activeWindow * 1000) as { id: string }[];
    this.state.db.transaction(() => {
      for (const viewer of active) {
        const added = this.state.db.prepare("INSERT OR IGNORE INTO ledger(id,viewer,amount,reason,at) VALUES(?,?,?,'observed_activity',?)").run(`activity:${viewer.id}:${bucket}`, viewer.id, settings.pointsAmount, now);
        if (added.changes) {
          this.state.db.prepare("UPDATE viewers SET watch_minutes=watch_minutes+? WHERE id=?").run(Math.floor(settings.pointsInterval / 60), viewer.id);
          this.state.observe(`activity:${viewer.id}:${bucket}`, "points.accrued", settings.pointsAmount);
          new PresentationService(this.state).goal("points", settings.pointsAmount, `activity:${viewer.id}:${bucket}`);
        }
      }
      if (active.length) this.state.emit("points", {});
    }).immediate();
  }

  redeem(viewer: string, rewardId: string, id: string = randomUUID()) {
    return this.state.db.transaction(() => {
      const existing = this.state.db.prepare("SELECT * FROM redemptions WHERE id=?").get(id);
      if (existing) return existing;
      const document = this.state.document(rewardId);
      if (!document || document.kind !== "reward") throw new AppError("reward_not_found", 404);
      const reward = configSchemas.reward.parse(document.data);
      if (!reward.enabled || !this.state.settings.pointsEnabled) throw new AppError("reward_disabled", 409);
      if (this.balance(viewer) < reward.cost) throw new AppError("insufficient_points", 409);
      this.state.db.prepare("INSERT INTO ledger(id,viewer,amount,reason,at) VALUES(?,?,?,?,?)").run(`redemption:${id}`, viewer, -reward.cost, `reward:${rewardId}`, Date.now());
      this.state.db.prepare("INSERT INTO redemptions(id,viewer,reward,cost,status,created_at) VALUES(?,?,?,?,'pending',?)").run(id, viewer, rewardId, reward.cost, Date.now());
      this.state.audit(`kick:${viewer}`, "reward.redeem", id, "pending");
      this.state.notify("engagement", `Reward requested: ${reward.name} · ${id}`, `redemption:${id}`);
      this.state.observe(`redemption:${id}`, "rewards.requested");
      return { id, status: "pending" };
    }).immediate();
  }

  fulfill(actor: Actor, id: string, result: "complete" | "reject") {
    this.state.assertActor(actor, "engage");
    return this.state.db.transaction(() => {
      const row = this.state.db.prepare("SELECT * FROM redemptions WHERE id=?").get(id) as { status: string; viewer: string; cost: number; reward: string } | undefined;
      if (!row || row.status !== "pending") throw new AppError("redemption_already_decided", 409);
      this.state.db.prepare("UPDATE redemptions SET status=? WHERE id=? AND status='pending'").run(result === "complete" ? "completed" : "refunded", id);
      if (result === "reject") this.state.db.prepare("INSERT INTO ledger(id,viewer,amount,reason,at) VALUES(?,?,?,?,?)").run(`refund:${id}`, row.viewer, row.cost, "reward_refund", Date.now());
      const reward = this.state.document(row.reward);
      if (result === "complete" && reward?.data.fulfillment === "alert") new PresentationService(this.state).alert("manual", { name: String(reward.data.name), text: String(reward.data.description), user: row.viewer }, `reward:${id}`);
      this.state.observe(`fulfillment:${id}`, `rewards.${result}`);
      this.state.audit(actor.id, `reward.${result}`, id);
      return { status: result === "complete" ? "completed" : "refunded" };
    }).immediate();
  }

  vote(activity: string, viewer: string, choice: number) {
    return this.state.db.transaction(() => {
      const doc = this.state.document(activity);
      if (!doc || doc.kind !== "poll") throw new AppError("poll_not_found", 404);
      const poll = configSchemas.poll.parse(doc.data);
      if (!poll.enabled || poll.status !== "open" || poll.endsAt <= Date.now()) throw new AppError("poll_closed", 409);
      if (!Number.isInteger(choice) || choice < 1 || choice > poll.options.length) throw new AppError("invalid_vote", 400);
      const id = `${activity}:${viewer}`;
      const previous = this.state.db.prepare("SELECT choice FROM participation WHERE id=?").get(id) as { choice: string } | undefined;
      if (previous && !poll.allowChange && previous.choice !== String(choice)) throw new AppError("vote_already_cast", 409);
      this.state.db.prepare("INSERT INTO participation(id,activity,viewer,choice,at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET choice=excluded.choice").run(id, activity, viewer, String(choice), Date.now());
      this.state.emit("poll", { id: activity });
      this.state.observe(`vote:${id}`, "polls.votes");
      return { accepted: true };
    }).immediate();
  }

  enter(activity: string, viewer: string, role: string) {
    return this.state.db.transaction(() => {
      const doc = this.state.document(activity);
      if (!doc || doc.kind !== "raffle") throw new AppError("raffle_not_found", 404);
      const raffle = configSchemas.raffle.parse(doc.data);
      if (!raffle.enabled || raffle.status !== "open" || raffle.endsAt <= Date.now()) throw new AppError("raffle_closed", 409);
      if (raffle.roles.length && !raffle.roles.includes(role as never) || this.balance(viewer) < raffle.minPoints) throw new AppError("raffle_ineligible", 403);
      this.state.db.prepare("INSERT OR IGNORE INTO participation(id,activity,viewer,choice,at) VALUES(?,?,?,'entry',?)").run(`${activity}:${viewer}`, activity, viewer, Date.now());
      this.state.emit("raffle", { id: activity });
      this.state.observe(`entry:${activity}:${viewer}`, "raffles.entries");
      return { accepted: true };
    }).immediate();
  }

  close(actor: Actor, id: string) {
    this.state.assertActor(actor, "engage");
    this.state.db.transaction(() => {
      const doc = this.state.document(id);
      if (!doc || !["poll", "raffle"].includes(doc.kind) || doc.data.status !== "open") throw new AppError("activity_not_open", 409);
      this.state.db.prepare("UPDATE documents SET data=?,version=version+1,updated_at=? WHERE id=?").run(JSON.stringify({ ...doc.data, status: "closed" }), Date.now(), id);
      this.state.audit(actor.id, "activity.close", id);
      this.state.notify("engagement", `${String(doc.data.name)} closed`, `close:${id}`);
    }).immediate();
  }

  draw(actor: Actor, id: string, reroll = false) {
    this.state.assertActor(actor, "engage");
    return this.state.db.transaction(() => {
      const doc = this.state.document(id);
      if (!doc || doc.kind !== "raffle") throw new AppError("raffle_not_found", 404);
      const raffle = configSchemas.raffle.parse(doc.data);
      if (raffle.status === "open" || raffle.status === "drawn" && !reroll) throw new AppError("close_raffle_before_draw", 409);
      const entries = (this.state.db.prepare("SELECT viewer FROM participation WHERE activity=? ORDER BY viewer").all(id) as { viewer: string }[]).filter(row => !raffle.winners.includes(row.viewer));
      if (!entries.length) throw new AppError("no_eligible_entries", 409);
      const winner = entries[randomInt(entries.length)].viewer;
      this.state.db.prepare("UPDATE documents SET data=?,version=version+1,updated_at=? WHERE id=?").run(JSON.stringify({ ...raffle, status: "drawn", winners: [...raffle.winners, winner] }), Date.now(), id);
      this.state.audit(actor.id, reroll ? "raffle.reroll" : "raffle.draw", `${id}:${winner}`);
      this.state.observe(`draw:${id}:${winner}`, "raffles.draws");
      this.state.notify("engagement", `${raffle.name}: winner ${winner}`, `draw:${id}:${winner}`);
      return { winner };
    }).immediate();
  }

  expire(now = Date.now()) {
    for (const kind of ["poll", "raffle"] as const) for (const doc of this.state.list(kind)) if (doc.data.status === "open" && doc.data.endsAt <= now) {
      this.state.db.prepare("UPDATE documents SET data=?,version=version+1,updated_at=? WHERE id=?").run(JSON.stringify({ ...doc.data, status: "closed" }), now, doc.id);
      this.state.emit("activity", { id: doc.id });
    }
  }
}
