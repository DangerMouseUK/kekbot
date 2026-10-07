import { NextRequest, NextResponse } from "next/server";
import { getRuntime } from "../../../../../server/runtime.ts";
import { AppError } from "../../../../../server/errors.ts";
import { failure, requireAccount } from "../../../../../server/http.ts";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    const binding = request.cookies.get("kekbot_oauth")?.value;
    if (!code || code.length > 4096 || !state || state.length > 128 || !binding) throw new AppError("oauth_callback_missing_parameters", 400);
    const app = getRuntime();
    if (app.config.mode === "live") requireAccount(request, "integrations");
    await app.kick.complete(code, state, binding);
    const response = new NextResponse("KekBot authorization saved. Return to Connections and reconcile subscriptions.", { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
    response.cookies.set("kekbot_oauth", "", { maxAge: 0, path: "/api/providers/kick/callback" });
    return response;
  } catch (error) {
    // Callback responses never echo the authorization code, state, or provider response.
    return failure(error);
  }
}
