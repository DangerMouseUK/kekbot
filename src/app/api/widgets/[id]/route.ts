import { getRuntime } from "../../../../server/runtime.ts";
import { failure, json } from "../../../../server/http.ts";
import { eventStream } from "../../../../server/stream.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (new URL(request.url).searchParams.get("stream") === "1") return eventStream(request, id);
    const app = getRuntime();
    app.bot.presentation.token(new URL(request.url).searchParams.get("token") ?? "", "widget", `widget:${id}`);
    return json(app.bot.presentation.widget(id));
  } catch (error) { return failure(error); }
}
