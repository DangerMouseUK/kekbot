import { AppError } from "./errors.ts";

export async function boundedBody(request: { headers: Headers; body: ReadableStream<Uint8Array> | null }, maximum = 65536) {
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
