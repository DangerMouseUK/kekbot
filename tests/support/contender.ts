// Each worker owns a separate SQLite connection, as independent HTTP/job callers do.
import { parentPort, workerData } from "node:worker_threads";
import { readConfig, type Environment } from "../../src/server/config.ts";
import { openStore } from "../../src/server/storage/database.ts";
import { Repository } from "../../src/server/storage/repository.ts";
import { BotService } from "../../src/server/domain/bot.ts";
import type { Actor } from "../../src/server/auth.ts";

const { env, name, input } = workerData as { env: Environment; name: string; input: Record<string, string | number> };
const config = readConfig(env), repository = new Repository(openStore(config)), bot = new BotService(repository, config);
const account = repository.store.sqlite.prepare("SELECT id,role FROM accounts WHERE role='owner'").get() as { id: string; role: "owner" };
const actor: Actor = { ...account, permissions: [] };
parentPort!.postMessage({ ready: true });
parentPort!.once("message", () => {
  try {
    let result: unknown;
    switch (name) {
      case "approve": result = bot.media.decide(actor, String(input.id), Number(input.version), "approve"); break;
      case "redeem": result = bot.engagement.redeem("456", String(input.reward), String(input.id)); break;
      case "refund": result = bot.engagement.fulfill(actor, String(input.id), "reject"); break;
      case "vote": result = bot.engagement.vote(String(input.id), "456", Number(input.choice)); break;
      case "draw": result = bot.engagement.draw(actor, String(input.id)); break;
      case "lease": result = bot.media.lease(String(input.credential)); break;
      case "skip": result = bot.media.control(actor, "skip", Number(input.version)); break;
      case "ended": result = bot.media.acknowledge(String(input.credential), String(input.lease), String(input.id), Number(input.version), "ended"); break;
      case "receipt": result = repository.acceptReceipt(String(input.id), "chat.message.sent", { message_id: "synthetic", sender: { user_id: 456 }, broadcaster: { user_id: 123 }, content: "!kekbot" }); break;
      case "edit": result = bot.state.save(actor, "command", String(input.id), { name: String(input.name), trigger: "!contended", responses: ["Synthetic response"] }, Number(input.version)); break;
      default: throw new Error("unsupported_test_operation");
    }
    parentPort!.postMessage({ ok: true, result });
  } catch (error) {
    parentPort!.postMessage({ ok: false, error: error instanceof Error ? error.message : "unknown_error" });
  } finally { repository.store.close(); }
});
