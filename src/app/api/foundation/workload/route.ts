import { failure, json, requireProof } from "../../../../server/http.ts";
import { AppError } from "../../../../server/errors.ts";
import { workloadStats } from "../../../../server/workload.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  try {
    const app = requireProof(request);
    if (app.config.mode !== "fixture") throw new AppError("fixture_workload_only", 404);
    const params = new URL(request.url).searchParams;
    return json(workloadStats(app.repository, params.get("run") ?? "", params.get("final") === "1"));
  } catch (error) { return failure(error); }
}
