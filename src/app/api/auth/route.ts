import { boundedBody, cookie, failure, json, requireAccount, sameOrigin, sessionCookie } from "../../../server/http.ts";
import { getRuntime } from "../../../server/runtime.ts";
import { AppError } from "../../../server/errors.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
let attempts = 0, windowEnd = 0;

export function GET(request: Request) {
  try {
    const app = getRuntime();
    const claimed = Boolean(app.repository.store.sqlite.prepare("SELECT 1 FROM accounts WHERE role='owner'").get());
    try {
      const actor = app.auth.session(cookie(request, "kekbot_session"));
      return json({ claimed, actor: { id: actor.id, username: actor.username, role: actor.role, permissions: actor.permissions }, csrf: actor.csrf, mode: app.config.mode, proofEnabled: app.config.enableProof });
    } catch { return json({ claimed, actor: null, mode: app.config.mode, proofEnabled: app.config.enableProof }); }
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const app = getRuntime();
    sameOrigin(request, app);
    const body = JSON.parse((await boundedBody(request, 4096)).toString()) as { action?: string; token?: string; currentPassword?: string; password?: string };
    if (["setup", "login", "invite"].includes(body.action ?? "")) {
      if (Date.now() > windowEnd) { windowEnd = Date.now() + 60000; attempts = 0; }
      if (++attempts > 30) throw new AppError("authentication_rate_limited", 429);
      const result = body.action === "setup" ? await app.auth.setup(body.token ?? "", body) : body.action === "invite" ? await app.auth.acceptInvite(body.token ?? "", body) : await app.auth.login(body);
      const response = json({ ok: true, csrf: result.csrf });
      response.headers.set("Set-Cookie", sessionCookie(result.token, app.config.publicUrl?.startsWith("https:") ?? false));
      return response;
    }
    const { actor } = requireAccount(request);
    if (body.action === "logout") app.auth.logout(actor.sessionId);
    else if (body.action === "password") await app.auth.changePassword(actor, body.currentPassword ?? "", body.password ?? "");
    else throw new AppError("unknown_authentication_action", 400);
    const response = json({ ok: true });
    response.headers.set("Set-Cookie", sessionCookie("", app.config.publicUrl?.startsWith("https:") ?? false, 0));
    return response;
  } catch (error) { return failure(error); }
}
