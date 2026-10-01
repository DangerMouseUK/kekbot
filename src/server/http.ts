import { AppError } from "./errors.ts";
import { sameSecret } from "./crypto.ts";
import { getRuntime, type Runtime } from "./runtime.ts";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function failure(error: unknown) {
  return json({ error: error instanceof AppError ? error.code : "configuration_or_storage_error" }, error instanceof AppError ? error.status : 503);
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

export async function boundedBody(request: Request, maximum = 65536) {
  const size = request.headers.get("content-length");
  if (size && Number(size) > maximum) throw new AppError("request_too_large", 413);
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maximum) { await reader.cancel(); throw new AppError("request_too_large", 413); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
