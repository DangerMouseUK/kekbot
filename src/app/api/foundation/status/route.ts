import { failure, json, requireProof } from "../../../../server/http.ts";
import { SCHEMA_VERSION } from "../../../../server/storage/database.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  try {
    const app = requireProof(request);
    return json({
      stage: "foundation", mode: app.config.mode, schemaVersion: SCHEMA_VERSION,
      runtimeHealthy: app.healthy(), publicUrl: app.config.publicUrl ?? null,
      kick: app.kick.status(), ...app.repository.diagnostics(),
      capture: app.proofCapture.status(),
      proofLastRecord: app.repository.setting("proof_last_record") ?? null,
      fixtureLastReply: app.config.mode === "fixture" ? app.repository.setting("fixture_last_reply") ?? null : undefined
    });
  } catch (error) { return failure(error); }
}
