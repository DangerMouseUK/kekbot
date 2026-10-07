import { AppError, isAppError } from "./errors.ts";
import { sameSecret } from "./crypto.ts";
import { getRuntime, type Runtime } from "./runtime.ts";
import { authorize, type Permission } from "./auth.ts";
import { ZodError } from "zod";

export { boundedBody } from "./body.ts";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function failure(error: unknown) {
  if (error instanceof ZodError) return json({ error: "invalid_input", fields: error.issues.map(issue => issue.path.join(".")) }, 400);
  return json({ error: isAppError(error) ? error.code : "configuration_or_storage_error" }, isAppError(error) ? error.status : 503);
}

let rejected = 0;
let windowEnds = 0;
export function requireProof(request: Request): Runtime {
  const runtime = getRuntime();
  if (!runtime.config.enableProof) throw new AppError("proof_tools_disabled", 404);
  if (runtime.config.mode === "live") requireAccount(request, "maintenance");
  if (Date.now() > windowEnds) { rejected = 0; windowEnds = Date.now() + 60000; }
  const token = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43,128})$/)?.[1];
  if (token && sameSecret(token, runtime.config.proofToken)) return runtime;
  if (rejected >= 60) throw new AppError("proof_auth_rate_limited", 429);
  rejected++;
  throw new AppError("proof_token_required", 401);
}

export function cookie(request: Request, name: string) {
  return request.headers.get("cookie")?.split(";").map(s => s.trim()).find(s => s.startsWith(`${name}=`))?.slice(name.length + 1);
}

export function sameOrigin(request: Request, app = getRuntime()) {
  const expected = app.config.publicUrl ?? new URL(request.url).origin;
  if (request.headers.get("origin") !== expected || request.headers.get("sec-fetch-site") === "cross-site") throw new AppError("same_origin_required", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AppError("json_required", 415);
}

export function requireAccount(request: Request, permission?: Permission) {
  const app = getRuntime();
  const actor = app.auth.session(cookie(request, "kekbot_session"));
  authorize(actor, permission);
  if (!["GET", "HEAD"].includes(request.method)) {
    sameOrigin(request, app);
    if (request.headers.get("x-csrf-token") !== actor.csrf) throw new AppError("csrf_required", 403);
  }
  return { app, actor };
}

export function sessionCookie(token: string, secure: boolean, maxAge = 43200) {
  return `kekbot_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}
