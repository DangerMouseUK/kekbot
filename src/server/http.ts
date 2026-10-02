import { AppError, isAppError } from "./errors.ts";
import { sameSecret } from "./crypto.ts";
import { getRuntime, type Runtime } from "./runtime.ts";

export { boundedBody } from "./body.ts";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function failure(error: unknown) {
  return json({ error: isAppError(error) ? error.code : "configuration_or_storage_error" }, isAppError(error) ? error.status : 503);
}

let rejected = 0;
let windowEnds = 0;
export function requireProof(request: Request): Runtime {
  const runtime = getRuntime();
  if (Date.now() > windowEnds) { rejected = 0; windowEnds = Date.now() + 60000; }
  const token = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43,128})$/)?.[1];
  if (token && sameSecret(token, runtime.config.proofToken)) return runtime;
  if (rejected >= 60) throw new AppError("proof_auth_rate_limited", 429);
  rejected++;
  throw new AppError("proof_token_required", 401);
}
