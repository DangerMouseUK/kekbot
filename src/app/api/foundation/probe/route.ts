import { randomUUID } from "node:crypto";
import { failure, json, requireProof } from "../../../../server/http.ts";

export const runtime = "nodejs";
export function POST(request: Request) {
  try {
    const app = requireProof(request);
    const id = `proof:${randomUUID()}`;
    app.repository.enqueue(id, "proof.record", {});
    return json({ id, status: "pending" }, 202);
  } catch (error) { return failure(error); }
}
