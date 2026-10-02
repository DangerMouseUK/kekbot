import { failure, json, requireProof } from "../../../../../server/http.ts";

export const runtime = "nodejs";
export function POST(request: Request) {
  try { return json(requireProof(request).proofCapture.arm()); }
  catch (error) { return failure(error); }
}
