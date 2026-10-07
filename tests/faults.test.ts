import { fork, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { digest } from "../src/server/crypto.ts";
import { Runtime } from "../src/server/runtime.ts";
import { openStore } from "../src/server/storage/database.ts";
import { backup, restore } from "../src/server/maintenance.ts";
import { environment, fixtureChat, repository } from "./helpers.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function setup() { const context = environment(); roots.push(context.root); return context; }
const script = fileURLToPath(new URL("./support/crash-process.ts", import.meta.url));

describe("storage and process fault recovery", () => {
  it("survives abrupt termination with committed state, rollback and safe expired-job recovery", async () => {
    const { env, config } = setup();
    const child = fork(script, ["hold"], { env: { ...process.env, ...env }, execArgv: [], stdio: ["ignore", "ignore", "ignore", "ipc"], windowsHide: true });
    try {
      await new Promise<void>((resolve, reject) => { child.once("message", () => resolve()); child.once("error", reject); child.once("exit", () => reject(new Error("crash_child_exited_before_ready"))); });
    } finally {
      const exited = new Promise<void>(resolve => child.once("exit", () => resolve()));
      child.kill("SIGKILL"); await exited;
    }
    const repo = repository(config);
    try {
      expect(repo.setting("acknowledged")).toBe("survives_abrupt_termination");
      expect(repo.setting("uncommitted")).toBeUndefined();
      const recovered = repo.claim(111)!; expect(recovered.id).toBe("recover-local"); repo.finish(recovered, "succeeded");
      expect(repo.claim(111)).toBeUndefined();
      expect(repo.store.sqlite.prepare("SELECT status FROM jobs WHERE id='abandoned-send'").get()).toEqual({ status: "uncertain" });
      expect(repo.store.sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
      expect(repo.store.sqlite.pragma("foreign_key_check")).toEqual([]);
    } finally { repo.store.close(); }
  });

  it("rolls back receipt and job writes at SQLite's real page limit and recovers after capacity returns", () => {
    const { config } = setup(), repo = repository(config);
    try {
      repo.store.sqlite.exec("CREATE TABLE capacity_probe(data BLOB)");
      const pages = Number(repo.store.sqlite.pragma("page_count", { simple: true }));
      repo.store.sqlite.pragma(`max_page_count = ${pages + 2}`);
      expect(() => repo.acceptReceipt("full-storage", "chat.message.sent", { ...fixtureChat(), content: "x".repeat(64000) })).toThrow(/full/i);
      expect(repo.store.sqlite.prepare("SELECT count(*) AS n FROM receipts WHERE id='full-storage'").get()).toEqual({ n: 0 });
      expect(repo.store.sqlite.prepare("SELECT count(*) AS n FROM jobs WHERE id='event:full-storage'").get()).toEqual({ n: 0 });
      repo.store.sqlite.pragma("max_page_count = 1073741823");
      expect(repo.acceptReceipt("full-storage", "chat.message.sent", fixtureChat())).toBe(true);
      expect(repo.store.sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
    } finally { repo.store.close(); }
  });

  it("fails closed when storage becomes read-only without acknowledging pending work", async () => {
    const { config } = setup(), runtime = new Runtime(config);
    try {
      runtime.start(); await vi.waitFor(() => expect(runtime.healthy()).toBe(true));
      runtime.repository.enqueue("read-only-job", "proof.record", {}, Date.now() + 1000);
      runtime.repository.store.sqlite.pragma("query_only = ON");
      await vi.waitFor(() => expect(runtime.healthy()).toBe(false));
      expect(runtime.repository.store.sqlite.prepare("SELECT status FROM jobs WHERE id='read-only-job'").get()).toEqual({ status: "pending" });
      runtime.repository.store.sqlite.pragma("query_only = OFF");
    } finally { await runtime.stop(); }
    const reopened = new Runtime(config); reopened.start();
    try { await vi.waitFor(() => expect(reopened.repository.setting("proof_last_record")).toBe("read-only-job"), { timeout: 4000 }); }
    finally { await reopened.stop(); }
  });

  it("rolls back an interrupted migration and leaves the original schema/data usable", () => {
    const { config, env, root } = setup();
    const directory = join(root, "legacy"), database = join(directory, "kekbot.sqlite"), isolated = join(root, "migration-source");
    mkdirSync(directory); mkdirSync(isolated);
    cpSync(resolve("drizzle"), join(isolated, "drizzle"), { recursive: true });
    const legacy = new Database(database), journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
    legacy.exec(readFileSync("drizzle/0000_dizzy_grandmaster.sql", "utf8"));
    legacy.exec("CREATE TABLE __drizzle_migrations(id INTEGER PRIMARY KEY,hash TEXT NOT NULL,created_at NUMERIC)");
    legacy.prepare("INSERT INTO __drizzle_migrations(hash,created_at) VALUES(?,?)").run("historical", journal.entries[0].when);
    for (const [key, value] of [["schema_version", "1"], ["mode", "fixture"], ["key_fingerprint", digest(config.key)], ["original", "preserved"]]) legacy.prepare("INSERT INTO settings(key,value) VALUES(?,?)").run(key, value);
    legacy.close();
    const stage = join(root, "staged"); mkdirSync(join(stage, "fixture"), { recursive: true });
    cpSync(database, join(stage, "fixture", "kekbot.sqlite"));
    cpSync(join(config.directory, "secrets"), join(stage, "fixture", "secrets"), { recursive: true });
    const migration = join(isolated, "drizzle", `${journal.entries[1].tag}.sql`);
    writeFileSync(migration, readFileSync(migration, "utf8") + "\n--> statement-breakpoint\nTHIS IS DELIBERATELY INVALID SQL;\n");
    const result = spawnSync(process.execPath, [script, "migrate"], { cwd: isolated, env: { ...process.env, ...env, KEKBOT_DATA_DIR: stage }, encoding: "utf8", windowsHide: true });
    expect(result.status).toBe(1);
    const failed = new Database(join(stage, "fixture", "kekbot.sqlite"));
    try {
      expect(failed.prepare("SELECT value FROM settings WHERE key='schema_version'").get()).toEqual({ value: "1" });
      expect(failed.prepare("SELECT value FROM settings WHERE key='original'").get()).toEqual({ value: "preserved" });
      expect(failed.prepare("SELECT name FROM sqlite_master WHERE name='accounts'").get()).toBeUndefined();
      expect(failed.pragma("integrity_check", { simple: true })).toBe("ok");
    } finally { failed.close(); }
    const repaired = openStore({ ...config, directory: join(stage, "fixture"), database: join(stage, "fixture", "kekbot.sqlite"), assets: join(stage, "fixture", "assets") });
    try { expect(repaired.sqlite.prepare("SELECT value FROM settings WHERE key='original'").get()).toEqual({ value: "preserved" }); }
    finally { repaired.close(); }
  });

  it("rejects damaged database/assets before writing a restore target", async () => {
    const { config, root } = setup();
    writeFileSync(join(config.assets, "synthetic.png"), "synthetic asset");
    const snapshot = join(root, "snapshot"); await backup(config, snapshot);
    const target = { ...config, directory: join(root, "target"), database: join(root, "target", "kekbot.sqlite"), assets: join(root, "target", "assets") };
    writeFileSync(join(snapshot, "assets", "synthetic.png"), "modified asset");
    expect(() => restore(target, snapshot)).toThrow("backup_asset_checksum_mismatch");
    writeFileSync(join(snapshot, "kekbot.sqlite"), "corrupt database");
    expect(() => restore(target, snapshot)).toThrow("backup_database_checksum_mismatch");
    expect(() => readFileSync(target.database)).toThrow();
  });
});
