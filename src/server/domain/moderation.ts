import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Actor } from "../auth.ts";
import { AppError } from "../errors.ts";
import { configSchemas } from "./catalog.ts";
import { State } from "./state.ts";

export type ChatMessage = { content: string; message_id: string; sender: { user_id: number; username?: string; identity?: { badges?: { type: string }[] } | null }; broadcaster: { user_id: number } };
export function chatRole(message: ChatMessage) {
  if (message.sender.user_id === message.broadcaster.user_id) return "broadcaster";
  const badges = message.sender.identity?.badges?.map(b => b.type.toLowerCase()) ?? [];
  return ["moderator", "vip", "subscriber"].find(role => badges.includes(role)) ?? "viewer";
}
export function evaluateRule(rule: z.infer<typeof configSchemas.rule>, content: string, role: string, recent: { text: string; at: number }[], now = Date.now()) {
  if (!rule.enabled || rule.trustedRoles.includes(role as never) || rule.startsAt !== null && rule.startsAt > now || rule.endsAt !== null && rule.endsAt <= now) return false;
  const text = content.toLowerCase();
  const window = recent.filter(message => message.at >= now - rule.windowSeconds * 1000);
  if (rule.type === "phrase") return rule.patterns.some(pattern => text.includes(pattern.toLowerCase()));
  if (rule.type === "link") {
    const domains = text.match(/(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?=[/\s:]|$)/g) ?? [];
    return domains.some(domain => { const host = domain.replace(/^https?:\/\//, ""); return !rule.allowedDomains.some(allowed => host === allowed || host.endsWith(`.${allowed}`)); });
  }
  if (rule.type === "repetition") return window.filter(message => message.text.toLowerCase() === text).length + 1 >= rule.threshold;
  if (rule.type === "burst") return window.length + 1 >= rule.threshold;
  const letters = content.match(/[a-z]/gi) ?? [];
  return letters.length >= 10 && letters.filter(letter => letter === letter.toUpperCase()).length / letters.length * 100 >= rule.threshold;
}

export class ModerationService {
  readonly state: State;
  constructor(state: State) { this.state = state; }
  inspect(message: ChatMessage, receiptId: string) {
    if (this.state.settings.moderationPaused) return false;
    const role = chatRole(message), viewer = String(message.sender.user_id), now = Date.now();
    const history = JSON.parse(this.state.repository.setting(`chat_window:${viewer}`) ?? "[]") as { text: string; at: number }[];
    const matched = this.state.list("rule").find(rule => evaluateRule(rule.data, message.content, role, history, now));
    this.state.repository.set(`chat_window:${viewer}`, JSON.stringify([...history.filter(m => now - m.at <= 600000).slice(-98), { text: message.content.slice(0, 500), at: now }]));
    if (!matched) return false;
    const previous = (this.state.db.prepare("SELECT count(*) AS n FROM incidents WHERE viewer=? AND at>?").get(viewer, now - 3600000) as { n: number }).n;
    const action = matched.data.escalation && previous >= 2 ? "timeout" : matched.data.action;
    const id = `moderation:${receiptId}`, jobId = `action:${id}`;
    this.state.db.prepare("INSERT OR IGNORE INTO incidents(id,viewer,rule,action,reason,job_id,at) VALUES(?,?,?,?,?,?,?)").run(id, viewer, matched.id, action, matched.data.name, jobId, now);
    this.state.effect(jobId, "kick.action", { action, userId: message.sender.user_id, messageId: message.message_id, reason: matched.data.name, duration: matched.data.duration });
    this.state.notify("moderation", `Rule ${matched.data.name}: ${action} requested for ${viewer}`, id);
    this.state.observe(id, "moderation.incidents");
    return true;
  }
  manual(actor: Actor, input: unknown, id: string = randomUUID()) {
    this.state.assertActor(actor, "moderate");
    const action = z.object({ action: z.enum(["warn", "delete", "timeout", "ban"]), userId: z.number().int().positive(), messageId: z.string().min(1).max(128).optional(), duration: z.number().int().min(1).max(10080).default(10), reason: z.string().min(1).max(100), acknowledge: z.boolean().default(false) }).parse(input);
    if ((action.action === "ban" || action.action === "delete") && !action.acknowledge) throw new AppError("operator_acknowledgement_required", 409);
    if (action.action === "delete" && !action.messageId) throw new AppError("message_id_required", 400);
    this.state.db.transaction(() => {
      this.state.db.prepare("INSERT OR IGNORE INTO incidents(id,viewer,rule,action,reason,job_id,at) VALUES(?,?,'manual',?,?,?,?)").run(id, String(action.userId), action.action, action.reason, `action:${id}`, Date.now());
      this.state.effect(`action:${id}`, "kick.action", action, actor, "moderate");
      this.state.audit(actor.id, `moderation.${action.action}`, id, "pending");
    }).immediate();
    return { id, status: "pending" };
  }
  test(rule: unknown, content: string, role: string) {
    return { matched: evaluateRule(configSchemas.rule.parse(rule), z.string().max(10000).parse(content), role, []), preview: true };
  }
}
