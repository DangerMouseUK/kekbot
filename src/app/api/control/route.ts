import { boundedBody, failure, json, requireAccount } from "../../../server/http.ts";
import { control } from "../../../server/control.ts";
import { csv } from "../../../server/domain/operations.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  try {
    const { app, actor } = requireAccount(request);
    const params = new URL(request.url).searchParams;
    const view = params.get("view");
    if (view === "uncertain-jobs" || view === "pending-redemptions") return json(app.bot.state.workQueue(view, { cursor: params.get("cursor") ?? undefined, limit: params.get("limit") ?? undefined }));
    if (params.get("view") === "media-history") return json(app.bot.media.history({ cursor: params.get("cursor") ?? undefined, limit: params.get("limit") ?? undefined }));
    if (params.get("view") === "analytics") {
      const result = app.bot.operations.analytics(Number(params.get("from") ?? Date.now() - 30 * 86400000), Number(params.get("to") ?? Date.now()), params.get("stream") ?? undefined);
      if (params.get("format") === "csv") return new Response(csv(result.rows as Record<string, unknown>[]), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=kekbot-analytics.csv", "Cache-Control": "no-store" } });
      return json(result);
    }
    const state = app.bot.state;
    return json({ ...state.snapshot(actor), kick: app.kick.status(), healthy: app.healthy(), ...(actor.role === "owner" ? {
      accounts: state.db.prepare("SELECT id,username,role,permissions,disabled,created_at FROM accounts ORDER BY created_at").all(),
      tokens: state.db.prepare("SELECT id,name,kind,scopes,created_at FROM access_tokens").all(),
      assets: (state.db.prepare("SELECT value FROM settings WHERE key LIKE 'asset:%'").all() as { value: string }[]).map(row => JSON.parse(row.value))
    } : {}) });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try { const { app, actor } = requireAccount(request); return json(await control(app, actor, JSON.parse((await boundedBody(request, 12 * 1024 * 1024)).toString()))); }
  catch (error) { return failure(error); }
}
