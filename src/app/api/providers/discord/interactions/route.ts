import { boundedBody, failure, json } from "../../../../../server/http.ts";
import { getRuntime } from "../../../../../server/runtime.ts";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { return json(getRuntime().discord.intake(await boundedBody(request), request.headers)); }
  catch (error) { return failure(error); }
}
