import { NextResponse } from "next/server";
import { failure, requireAccount } from "../../../../server/http.ts";
import { randomToken } from "../../../../server/crypto.ts";
export const runtime = "nodejs";
export function POST(request: Request) {
  try {
    const { app, actor } = requireAccount(request, "integrations");
    const binding = randomToken();
    const response = NextResponse.json({ url: app.kick.authorize(binding, new URL(request.url).searchParams.get("moderation") === "1") }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set("kekbot_oauth", binding, { httpOnly: true, sameSite: "lax", secure: app.config.publicUrl?.startsWith("https:"), maxAge: 600, path: "/api/providers/kick/callback" });
    app.bot.state.audit(actor.id, "kick.authorize.start", "kick");
    return response;
  } catch (error) { return failure(error); }
}
