import { getRuntime } from "../../../../../server/runtime.ts";
import { boundedBody, failure, json } from "../../../../../server/http.ts";
import { acceptKickWebhook } from "../../../../../server/providers/kick-webhook.ts";
import { AppError } from "../../../../../server/errors.ts";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const app = getRuntime();
    if (!app.healthy()) throw new AppError("runtime_unavailable", 503);
    if (!app.config.broadcasterId) throw new AppError("broadcaster_not_configured", 503);
    const body = await boundedBody(request);
    return json(acceptKickWebhook(app.repository, body, request.headers, await app.kick.verificationKey(), app.config.broadcasterId));
  } catch (error) { return failure(error); }
}
