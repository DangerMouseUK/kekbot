import { eventStream } from "../../../server/stream.ts";
import { failure } from "../../../server/http.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) { try { return eventStream(request); } catch (error) { return failure(error); } }
