import { failure, json, requireProof } from "../../../../../server/http.ts";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try { return json(await requireProof(request).kick.subscribe()); }
  catch (error) { return failure(error); }
}
