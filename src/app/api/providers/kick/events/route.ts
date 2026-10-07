import { getRuntime } from "../../../../../server/runtime.ts";
import { boundedBody, failure, json } from "../../../../../server/http.ts";
import { acceptKickWebhook } from "../../../../../server/providers/kick-webhook.ts";
import { AppError } from "../../../../../server/errors.ts";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const app = getRuntime();
    if (!app.healthy()) throw new AppError("runtime_unavailable", 503);
    const broadcasterId = app.kick.config.broadcasterId;
    if (!broadcasterId) throw new AppError("broadcaster_not_configured", 503);
    const body = await boundedBody(request);
    const result = acceptKickWebhook(app.repository, body, request.headers, await app.kick.verificationKey(), broadcasterId);
    if (app.config.enableProof) app.proofCapture.observe(body, request.headers, result.accepted);
    return json(result);
  } catch (error) { return failure(error); }
}
