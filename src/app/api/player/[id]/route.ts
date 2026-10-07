import { z } from "zod";
import { getRuntime } from "../../../../server/runtime.ts";
import { boundedBody, failure, json } from "../../../../server/http.ts";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const app = getRuntime(), { id } = await context.params;
    const widget = app.bot.state.document(id);
    if (!widget || widget.kind !== "widget" || !widget.data.enabled || widget.data.type !== "player") return json({ error: "player_source_disabled" }, 403);
    const bearer = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    const credential = app.bot.presentation.token(bearer, "player", `widget:${id}`);
    const input = z.object({ action: z.enum(["lease", "ended", "error", "blocked"]), lease: z.string().max(100).optional(), item: z.string().max(100).optional(), version: z.number().int().nonnegative().optional(), error: z.string().max(80).optional() }).parse(JSON.parse((await boundedBody(request, 4096)).toString()));
    if (input.action === "lease") return json(app.bot.media.lease(credential.id, input.lease));
    return json(app.bot.media.acknowledge(credential.id, z.string().parse(input.lease), z.string().parse(input.item), z.number().parse(input.version), input.action, input.error));
  } catch (error) { return failure(error); }
}
