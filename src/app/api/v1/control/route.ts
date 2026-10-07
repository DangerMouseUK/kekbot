import { randomUUID } from "node:crypto";
import { boundedBody, failure, json } from "../../../../server/http.ts";
import { getRuntime } from "../../../../server/runtime.ts";
import { control } from "../../../../server/control.ts";
import type { Permission } from "../../../../server/auth.ts";
import { AppError } from "../../../../server/errors.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const rates = new Map<string, { count: number; until: number }>();
function access(request: Request, scope: string) {
  const app = getRuntime();
  const bearer = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43,128})$/)?.[1] ?? "";
  const token = app.bot.presentation.token(bearer, "api", scope);
  if (rates.size > 1000) for (const [key, value] of rates) if (value.until < Date.now()) rates.delete(key);
  const rate = rates.get(token.id);
  if (rate && rate.until > Date.now() && rate.count >= 60) throw new AppError("api_rate_limited", 429);
  rates.set(token.id, { count: rate && rate.until > Date.now() ? rate.count + 1 : 1, until: rate && rate.until > Date.now() ? rate.until : Date.now() + 60000 });
  return { app, actor: { id: token.account_id, role: "owner" as const, permissions: JSON.parse(token.scopes) as Permission[], capabilityId: token.id } };
}
export function GET(request: Request) {
  try { const { app, actor } = access(request, "read"); return json({ version: 1, state: app.bot.state.snapshot(actor) }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const body = JSON.parse((await boundedBody(request, 65536)).toString()) as { action: string; input?: Record<string, unknown> };
    const permission = body.action?.startsWith("config.") ? "configure" : body.action?.startsWith("media.") || body.action?.startsWith("player.") ? "media" : body.action?.startsWith("moderation.") ? "moderate" : body.action?.startsWith("reward.") || body.action?.startsWith("raffle.") || body.action === "activity.close" || body.action === "points.adjust" ? "engage" : ["status", "timers.pause", "timers.resume", "alert.manual", "goal.adjust"].includes(body.action) ? "operate" : undefined;
    if (!permission || body.action?.startsWith("config.") && ["settings", "guild"].includes(String(body.input?.kind))) throw new AppError("operation_not_in_integration_api", 403);
    const { app, actor } = access(request, permission);
    app.bot.state.audit(actor.id, "api.request", randomUUID(), "pending");
    return json({ version: 1, result: await control(app, actor, body) });
  } catch (error) { return failure(error); }
}
