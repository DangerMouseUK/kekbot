import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import * as schema from "./schema.ts";
import { AppError } from "../errors.ts";
import { digest } from "../crypto.ts";
import type { Config } from "../config.ts";

export const SCHEMA_VERSION = 1;
export type Store = ReturnType<typeof openStore>;

export function openStore(config: Pick<Config, "database" | "directory" | "assets" | "key" | "mode">) {
  mkdirSync(config.directory, { recursive: true, mode: 0o700 });
  mkdirSync(config.assets, { recursive: true, mode: 0o700 });
  const sqlite = new Database(config.database, { timeout: 1000 });
  try {
    sqlite.pragma("foreign_keys = ON");
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("synchronous = FULL");
    const hasSettings = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'").get();
    if (hasSettings) {
      const version = sqlite.prepare("SELECT value FROM settings WHERE key='schema_version'").get() as { value: string } | undefined;
      if (version && Number(version.value) !== SCHEMA_VERSION) throw new AppError("unsupported_schema_version", 503);
      const fingerprint = sqlite.prepare("SELECT value FROM settings WHERE key='key_fingerprint'").get() as { value: string } | undefined;
      if (fingerprint && fingerprint.value !== digest(config.key)) throw new AppError("encryption_key_does_not_match_database", 503);
    }
    const orm = drizzle(sqlite, { schema });
    const migrations = resolve("drizzle");
    if (!existsSync(migrations)) throw new AppError("migrations_directory_missing", 503);
    migrate(orm, { migrationsFolder: migrations });
    sqlite.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)").run("schema_version", String(SCHEMA_VERSION));
    sqlite.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)").run("key_fingerprint", digest(config.key));
    sqlite.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)").run("mode", config.mode);
    const mode = sqlite.prepare("SELECT value FROM settings WHERE key='mode'").get() as { value: string };
    if (mode.value !== config.mode) throw new AppError("database_mode_mismatch", 503);
    return { sqlite, orm, close: () => sqlite.close() };
  } catch (error) { sqlite.close(); throw error; }
}
