import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { z } from "zod";
import { AppError } from "./errors.ts";

export type Mode = "live" | "fixture";
export type Environment = Record<string, string | undefined>;
export type Paths = ReturnType<typeof readPaths>;
export type Config = ReturnType<typeof readConfig>;

export function readPaths(env: Environment = process.env) {
  const mode = z.enum(["live", "fixture"]).parse(env.KEKBOT_MODE ?? "live");
  // Operator data and secrets are runtime inputs, never build-traced files.
  const root = resolve(/* turbopackIgnore: true */ env.KEKBOT_DATA_DIR ?? "data");
  const directory = join(/* turbopackIgnore: true */ root, mode);
  return {
    mode, root, directory,
    database: join(directory, "kekbot.sqlite"),
    assets: join(directory, "assets"),
    keyFile: resolve(/* turbopackIgnore: true */ env.KEKBOT_ENCRYPTION_KEY_FILE ?? join(directory, "secrets", "encryption.key")),
    proofTokenFile: resolve(/* turbopackIgnore: true */ env.KEKBOT_PROOF_TOKEN_FILE ?? join(directory, "secrets", "proof.token")),
    setupTokenFile: join(directory, "secrets", "setup.token"),
    fixturePublicKeyFile: join(directory, "secrets", "fixture-public.pem"),
    fixtureDiscordPublicKeyFile: join(directory, "secrets", "fixture-discord-public.pem")
  };
}

function secretFile(path: string, code: string): string {
  try { return readFileSync(/* turbopackIgnore: true */ path, "utf8").trim(); }
  catch { throw new AppError(code, 503); }
}

export function readConfig(env: Environment = process.env) {
  const paths = readPaths(env);
  const rawKey = secretFile(paths.keyFile, "encryption_key_missing_run_init");
  if (!/^[a-f0-9]{64}$/i.test(rawKey)) throw new AppError("invalid_encryption_key", 503);
  const proofToken = secretFile(paths.proofTokenFile, "proof_token_missing_run_init");
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(proofToken)) throw new AppError("invalid_proof_token", 503);
  const chatType = z.enum(["bot", "user"]).parse(env.KICK_CHAT_TYPE ?? "bot");
  let publicUrl: string | undefined;
  if (env.KEKBOT_PUBLIC_URL) {
    const parsed = new URL(env.KEKBOT_PUBLIC_URL);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/" ||
        (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:"))) {
      throw new AppError("public_url_must_be_https_origin", 503);
    }
    publicUrl = parsed.origin;
  }
  const broadcasterId = env.KICK_BROADCASTER_USER_ID ? Number(env.KICK_BROADCASTER_USER_ID) : undefined;
  if (broadcasterId !== undefined && (!Number.isSafeInteger(broadcasterId) || broadcasterId <= 0)) {
    throw new AppError("invalid_broadcaster_id", 503);
  }
  if (paths.mode === "fixture" && (env.KICK_CLIENT_ID || env.KICK_CLIENT_SECRET || env.KICK_CLIENT_SECRET_FILE)) {
    throw new AppError("fixture_mode_rejects_live_credentials", 503);
  }
  return {
    ...paths, key: Buffer.from(rawKey, "hex"), proofToken, publicUrl, broadcasterId, chatType,
    clientId: env.KICK_CLIENT_ID,
    clientSecret: env.KICK_CLIENT_SECRET_FILE ? secretFile(env.KICK_CLIENT_SECRET_FILE, "kick_secret_missing") : env.KICK_CLIENT_SECRET,
    runJobs: env.KEKBOT_RUN_JOBS === "1", enableProof: env.KEKBOT_ENABLE_PROOF === "1",
    fixturePublicKey: paths.mode === "fixture" ? secretFile(paths.fixturePublicKeyFile, "fixture_key_missing_run_init") : undefined,
    fixtureDiscordPublicKey: paths.mode === "fixture" ? secretFile(paths.fixtureDiscordPublicKeyFile, "fixture_discord_key_missing_run_init") : undefined
  };
}

export function requireKick(config: Config) {
  if (config.mode !== "live") throw new AppError("live_actions_disabled_in_fixture_mode", 409);
  if (!config.publicUrl || !config.clientId || !config.clientSecret || !config.broadcasterId) {
    throw new AppError("kick_configuration_incomplete", 503);
  }
  return { publicUrl: config.publicUrl, clientId: config.clientId, clientSecret: config.clientSecret, broadcasterId: config.broadcasterId };
}
