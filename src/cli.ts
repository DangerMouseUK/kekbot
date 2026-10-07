import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, sign } from "node:crypto";
import Database from "better-sqlite3";
import { readConfig, readPaths } from "./server/config.ts";
import { AppError } from "./server/errors.ts";
import { backup, initialize, restore, recoverOwner } from "./server/maintenance.ts";
import { replayCapture } from "./server/proof-capture.ts";
import { seedFixture } from "./server/fixture-seed.ts";

const [command, argument, flag, ...extra] = process.argv.slice(2);
process.umask(0o077);
const print = (value: unknown) => process.stdout.write(JSON.stringify(value, null, 2) + "\n");

try {
  if (command === "init") {
    print(initialize());
  } else if (command === "fixture-seed") {
    print(await seedFixture(readConfig()));
  } else if (command === "doctor") {
    const config = readConfig();
    if (!existsSync(config.database)) throw new AppError("database_missing_run_init");
    const db = new Database(config.database, { readonly: true, fileMustExist: true });
    try {
      print({ mode: config.mode, database: config.database, integrity: db.pragma("quick_check", { simple: true }),
        schemaVersion: db.prepare("SELECT value FROM settings WHERE key='schema_version'").get(),
        instanceLease: db.prepare("SELECT expires_at AS expiresAt FROM leases WHERE name='instance'").get() ?? null,
        accounts: db.prepare("SELECT role,count(*) AS count FROM accounts GROUP BY role").all(),
        jobs: db.prepare("SELECT status,count(*) AS count FROM jobs GROUP BY status").all(),
        callbackConfigured: Boolean(config.publicUrl),
        credentialsConfigured: Boolean(config.publicUrl && (config.clientId && config.clientSecret && config.broadcasterId || db.prepare("SELECT 1 FROM connections WHERE provider='config:kick'").get())) });
    } finally { db.close(); }
  } else if (command === "backup" && argument) {
    print(await backup(readConfig(), argument));
  } else if (command === "restore" && argument) {
    print(restore(readConfig(), argument));
  } else if (command === "recover-owner" && argument && flag && !extra.length) {
    print(await recoverOwner(readConfig(), argument, flag));
  } else if (command === "proof-replay") {
    if (!argument || flag !== "--live" || extra.length) throw new AppError("usage_proof_replay_delivery_id_live_flag");
    const config = readConfig();
    const db = new Database(config.database, { readonly: true, fileMustExist: true });
    try {
      print(await replayCapture(config, argument, { live: true,
        committed: id => Boolean(db.prepare("SELECT id FROM receipts WHERE id=? AND event_type='chat.message.sent'").get(id)) }));
    } finally { db.close(); }
  } else if (command === "fixture-event") {
    const paths = readPaths();
    if (paths.mode !== "fixture") throw new AppError("fixture_command_requires_explicit_fixture_mode");
    const config = readConfig();
    if (!config.broadcasterId) throw new AppError("set_fixture_broadcaster_id");
    const body = JSON.stringify({ message_id: randomBytes(16).toString("hex"), broadcaster: { user_id: config.broadcasterId }, sender: { user_id: config.broadcasterId + 1 }, content: "!kekbot" });
    const id = "01" + [...randomBytes(24)].map(value => "0123456789ABCDEFGHJKMNPQRSTVWXYZ"[value % 32]).join("");
    const timestamp = new Date().toISOString();
    const signature = sign("RSA-SHA256", Buffer.from(`${id}.${timestamp}.${body}`), readFileSync(join(paths.directory, "secrets", "fixture-private.pem"))).toString("base64");
    const result = await fetch(`${config.publicUrl ?? "http://127.0.0.1:3000"}/api/providers/kick/events`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
      headers: { "Content-Type": "application/json", "Kick-Event-Message-Id": id, "Kick-Event-Message-Timestamp": timestamp, "Kick-Event-Signature": signature, "Kick-Event-Type": "chat.message.sent", "Kick-Event-Version": "1" }, body });
    print({ status: result.status, result: await result.json() });
    if (!result.ok) process.exitCode = 1;
  } else {
    process.stdout.write("KekBot CLI\n\n  init                           (creates or renews unclaimed setup token)\n  doctor\n  backup <new-backup-directory>  (stop the application first)\n  restore <backup-directory>     (empty target; original encryption key)\n  recover-owner <username> <protected-password-file> (stopped host only)\n  fixture-seed                   (fixture mode; stopped application)\n  fixture-event                  (fixture mode only)\n  proof-replay <delivery-id> --live (previously captured and committed event only)\n");
    if (command && command !== "help") process.exitCode = 1;
  }
} catch (error) {
  print({ error: error instanceof AppError ? error.code : "configuration_or_storage_error" });
  process.exitCode = 1;
}
