import { NextResponse } from "next/server";
import { randomToken } from "../../../../../server/crypto.ts";
import { failure, requireProof } from "../../../../../server/http.ts";

export const runtime = "nodejs";
export function POST(request: Request) {
  try {
    const app = requireProof(request);
    const binding = randomToken();
    const response = NextResponse.json({ url: app.kick.authorize(binding) }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set("kekbot_oauth", binding, { httpOnly: true, sameSite: "lax", secure: app.config.publicUrl?.startsWith("https:"), maxAge: 600, path: "/api/providers/kick/callback" });
    return response;
  } catch (error) { return failure(error); }
}
