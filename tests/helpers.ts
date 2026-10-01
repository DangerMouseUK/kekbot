import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initialize } from "../src/server/maintenance.ts";
import { readConfig, type Config, type Environment } from "../src/server/config.ts";
import { openStore } from "../src/server/storage/database.ts";
import { Repository } from "../src/server/storage/repository.ts";

export function environment(mode: "fixture" | "live" = "fixture") {
  const root = mkdtempSync(join(tmpdir(), "kekbot-test-"));
  const env: Environment = { KEKBOT_MODE: mode, KEKBOT_DATA_DIR: root, KEKBOT_RUN_JOBS: "1", KICK_BROADCASTER_USER_ID: "123" };
  initialize(env);
  if (mode === "live") Object.assign(env, { KEKBOT_PUBLIC_URL: "https://kekbot.example", KICK_CLIENT_ID: "test-client", KICK_CLIENT_SECRET: "test-client-secret" });
  return { root, env, config: readConfig(env) };
}

export function repository(config: Config) { return new Repository(openStore(config)); }

export function fixtureChat() {
  return { message_id: "test-message", broadcaster: { user_id: 123 }, sender: { user_id: 456 }, content: "!kekbot" };
}
