import { getRuntime } from "../../../../server/runtime.ts";
import { json } from "../../../../server/http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() {
  try {
    const healthy = getRuntime().healthy();
    return json({ status: healthy ? "ready" : "unavailable" }, healthy ? 200 : 503);
  } catch { return json({ status: "unavailable" }, 503); }
}
