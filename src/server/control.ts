import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Runtime } from "./runtime.ts";
import type { Actor } from "./auth.ts";
import { configSchemas } from "./domain/catalog.ts";
import { AppError } from "./errors.ts";

export async function control(app: Runtime, actor: Actor, input: unknown) {
  const body = z.object({ action: z.string().max(80), input: z.record(z.string(), z.unknown()).default({}) }).parse(input);
  const data = body.input;
  const state = app.bot.state;
  const id = z.string().max(100).parse(data.id ?? "");
  switch (body.action) {
    case "config.save": {
      const document = state.save(actor, z.enum(Object.keys(configSchemas) as [keyof typeof configSchemas, ...(keyof typeof configSchemas)[]]).parse(data.kind), id || undefined, data.data, data.version as number | undefined);
      if (document.kind === "settings") app.bot.operations.retain();
      return document;
    }
    case "config.delete": return state.remove(actor, id, z.number().int().positive().parse(data.version)) ?? { deleted: true };
    case "account.invite": return app.auth.invite(actor, z.string().parse(data.role), z.array(z.string()).parse(data.permissions ?? []));
    case "account.disable": return app.auth.disable(actor, id, z.boolean().parse(data.disabled)) ?? { updated: true };
    case "account.revoke": state.assertActor(actor, "accounts"); state.db.prepare("DELETE FROM sessions WHERE account_id=?").run(id); state.audit(actor.id, "account.revoke_sessions", id); return { revoked: true };
    case "integration.save": { const result = state.saveSecret(actor, z.string().parse(data.provider), data.data); if (data.provider === "kick") app.kick.invalidate(); return result; }
    case "kick.refresh": state.assertActor(actor, "integrations"); return app.kick.refreshProof();
    case "kick.subscribe": state.assertActor(actor, "integrations"); return app.kick.subscribe(app.desiredEvents());
    case "kick.disconnect": state.assertActor(actor, "integrations"); { const result = await app.kick.disconnect(); state.audit(actor.id, "kick.disconnect", "kick", result.revocation); return result; }
    case "discord.register": return app.discord.register(actor);
    case "asset.upload": return app.bot.presentation.upload(actor, z.string().parse(data.name), z.string().parse(data.base64));
    case "asset.delete": return app.bot.presentation.deleteAsset(actor, id) ?? { deleted: true };
    case "token.create": return app.bot.presentation.issueToken(actor, z.string().parse(data.name), z.enum(["widget", "player", "api"]).parse(data.kind), z.array(z.string()).parse(data.scopes));
    case "token.revoke": return app.bot.presentation.revoke(actor, id) ?? { revoked: true };
    case "media.request": state.assertActor(actor, "media"); return app.bot.media.request(z.string().parse(data.url), actor.id, randomUUID(), true);
    case "media.reorder": return app.bot.media.reorder(actor, z.array(z.string()).max(500).parse(data.ids)) ?? { reordered: true };
    case "media.clear": return app.bot.media.clear(actor) ?? { cleared: true };
    case "points.adjust": return app.bot.engagement.adjust(actor, z.string().parse(data.viewer), z.number().parse(data.amount), z.string().parse(data.reason));
    case "moderation.test": state.assertActor(actor, "moderate"); return app.bot.moderation.test(data.rule, z.string().parse(data.content), z.string().parse(data.role));
    case "command.preview": return app.bot.automation.preview(actor, "command", data.data ?? state.document(id)?.data);
    case "timer.preview": return app.bot.automation.preview(actor, "timer", data.data ?? state.document(id)?.data);
    case "alert.preview": state.assertActor(actor, "operate"); return app.bot.presentation.alert(z.string().parse(data.event), { user: "Preview viewer", name: "Preview", text: "Preview alert", count: 1 }, "preview", true);
    case "configuration.export": return app.bot.operations.exportConfig(actor);
    case "configuration.import": return app.bot.operations.importConfig(actor, data.bundle, z.enum(["merge", "replace"]).parse(data.mode), z.boolean().parse(data.apply ?? false));
    case "privacy.erase": return app.bot.operations.eraseViewer(actor, z.string().parse(data.viewer));
    case "privacy.export": return app.bot.operations.viewerExport(actor, z.string().parse(data.viewer));
    case "diagnostics.export": return app.bot.operations.support(actor);
    case "job.resolve": {
      state.assertActor(actor, "maintenance");
      const result = z.enum(["confirmed", "failed"]).parse(data.result);
      const changed = state.db.prepare("UPDATE jobs SET status=?,last_error='operator_reconciled' WHERE id=? AND status='uncertain'").run(result === "confirmed" ? "succeeded" : "failed", id);
      if (!changed.changes) throw new AppError("job_not_uncertain", 409);
      state.audit(actor.id, "job.reconcile", id, result); return { reconciled: true };
    }
    default: return app.bot.action(actor, body.action, data, randomUUID());
  }
}
