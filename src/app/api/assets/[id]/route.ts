import { getRuntime } from "../../../../server/runtime.ts";
import { failure, requireAccount } from "../../../../server/http.ts";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const app = getRuntime(), { id } = await context.params;
    const params = new URL(request.url).searchParams;
    if (params.has("token")) {
      const widget = params.get("widget") ?? "";
      app.bot.presentation.token(params.get("token")!, "widget", `widget:${widget}`);
      if (app.bot.state.document(widget)?.data.type !== "alerts") return new Response(null, { status: 403 });
    } else requireAccount(request);
    const asset = app.bot.presentation.asset(id);
    return new Response(new Uint8Array(asset.bytes), { headers: { "Content-Type": asset.type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return failure(error); }
}
