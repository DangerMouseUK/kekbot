import { json } from "../../../../server/http.ts";

export const runtime = "nodejs";
export function GET() { return json({ status: "alive" }); }
