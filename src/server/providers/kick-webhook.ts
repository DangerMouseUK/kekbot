import { verify } from "node:crypto";
import { z } from "zod";
import { AppError } from "../errors.ts";
import type { Repository } from "../storage/repository.ts";

export const WEBHOOK_MAX_BYTES = 65536;
export const WEBHOOK_MAX_AGE_MS = 48 * 3600000;
const user = z.object({ user_id: z.number().int().positive(), username: z.string().max(100).optional(), identity: z.object({ badges: z.array(z.object({ type: z.string().max(50) })).max(50).optional() }).nullable().optional() });
const common = z.object({ broadcaster: user });
const chat = common.extend({ message_id: z.string().min(1).max(128), sender: user, content: z.string().max(10000) });
const follow = common.extend({ follower: user });
const subscription = common.extend({ subscriber: user, duration: z.number().int().positive(), created_at: z.string(), expires_at: z.string() });
const gifts = common.extend({ gifter: z.object({ user_id: z.number().int().positive().nullable(), username: z.string().max(100).nullable().optional() }), giftees: z.array(user).min(1).max(1000), created_at: z.string(), expires_at: z.string() });
const stream = common.extend({ is_live: z.boolean(), started_at: z.string().nullable(), ended_at: z.string().nullable() });

export function acceptKickWebhook(repository: Repository, body: Buffer, headers: Headers, publicKey: string, broadcasterId: number, now = Date.now()) {
  if (body.length > WEBHOOK_MAX_BYTES) throw new AppError("webhook_too_large", 413);
  const id = headers.get("kick-event-message-id");
  const timestamp = headers.get("kick-event-message-timestamp");
  const signature = headers.get("kick-event-signature");
  const event = headers.get("kick-event-type");
  if (!id || !/^[0-9A-HJKMNP-TV-Z]{26}$/.test(id) || !timestamp || !signature || !event) throw new AppError("missing_or_invalid_signed_headers", 400);
  if (headers.get("kick-event-version") !== "1") throw new AppError("unsupported_event_version", 422);
  const sentAt = Date.parse(timestamp);
  if (!Number.isFinite(sentAt) || sentAt < now - WEBHOOK_MAX_AGE_MS || sentAt > now + 300000) throw new AppError("webhook_timestamp_outside_retry_window", 401);
  let valid = false;
  try {
    valid = verify("RSA-SHA256", Buffer.concat([Buffer.from(`${id}.${timestamp}.`), body]), publicKey, Buffer.from(signature, "base64"));
  } catch { throw new AppError("invalid_webhook_signature", 401); }
  if (!valid) throw new AppError("invalid_webhook_signature", 401);
  let value: unknown;
  try { value = JSON.parse(body.toString("utf8")); }
  catch { throw new AppError("invalid_webhook_json", 400); }
  const schema = event === "chat.message.sent" ? chat : event === "channel.followed" ? follow : event === "livestream.status.updated" ? stream : ["channel.subscription.new", "channel.subscription.renewal"].includes(event) ? subscription : event === "channel.subscription.gifts" ? gifts : undefined;
  if (!schema) throw new AppError("unsupported_event_type", 422);
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new AppError("invalid_webhook_payload", 422);
  if (parsed.data.broadcaster.user_id !== broadcasterId) throw new AppError("event_for_different_channel", 403);
  const accepted = repository.acceptReceipt(id, event, { ...parsed.data, _provider_sent_at: sentAt }, now);
  return { accepted, duplicate: !accepted };
}
