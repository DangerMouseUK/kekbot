import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { readConfig, readPaths } from "../src/server/config.ts";
import { backup, initialize, restore } from "../src/server/maintenance.ts";
import { environment, repository } from "./helpers.ts";

function restoreConfig(context: ReturnType<typeof environment>) {
  const env = { ...context.env, KEKBOT_DATA_DIR: join(context.root, "restored") };
  const paths = readPaths(env);
  mkdirSync(join(paths.directory, "secrets"), { recursive: true });
  for (const name of ["encryption.key", "proof.token", "fixture-public.pem", "fixture-private.pem"]) {
    copyFileSync(join(context.config.directory, "secrets", name), join(paths.directory, "secrets", name));
  }
  return readConfig(env);
}

describe("portable recovery", () => {
  it("backs up the real database and assets, excludes secrets, and restores to new storage", async () => {
    const context = environment();
    const repo = repository(context.config);
    repo.set("persistent", "portable");
    repo.enqueue("recover-job", "proof.record", {});
    repo.store.close();
    writeFileSync(join(context.config.assets, "test-image.png"), "fixture-asset");
    mkdirSync(join(context.config.directory, "secrets/proof-captures"));
    writeFileSync(join(context.config.directory, "secrets/proof-captures/private.capture"), "encrypted proof evidence");
    const output = join(context.root, "backup");
    await backup(context.config, output);
    const snapshot = new Database(join(output, "kekbot.sqlite"), { readonly: true });
    try { expect(snapshot.pragma("journal_mode", { simple: true })).toBe("delete"); }
    finally { snapshot.close(); }
    expect(existsSync(join(output, "kekbot.sqlite-wal"))).toBe(false);
    expect(existsSync(join(output, "kekbot.sqlite-shm"))).toBe(false);
    expect(existsSync(join(output, "secrets"))).toBe(false);
    expect(existsSync(join(output, "proof-captures"))).toBe(false);
    const target = restoreConfig(context);
    restore(target, output);
    const restored = repository(target);
    try {
      expect(restored.setting("persistent")).toBe("portable");
      expect(restored.claim()?.id).toBe("recover-job");
      expect(readFileSync(join(target.assets, "test-image.png"), "utf8")).toBe("fixture-asset");
    } finally { restored.store.close(); }
    expect(() => restore(target, output)).toThrow("restore_requires_new_data_directory");
  });

  it("refuses backup while an application lease is active", async () => {
    const context = environment();
    const repo = repository(context.config);
    try {
      repo.acquireLease("active-runtime");
      await expect(backup(context.config, join(context.root, "blocked-backup"))).rejects.toThrow("instance_already_running_or_in_maintenance");
    } finally { repo.releaseLease("active-runtime"); repo.store.close(); }
  });

  it("preserves existing initialization secrets and rejects wrong keys and damaged backups", async () => {
    const context = environment();
    const original = readFileSync(context.config.keyFile, "utf8");
    initialize(context.env);
    expect(readFileSync(context.config.keyFile, "utf8")).toBe(original);
    const output = join(context.root, "backup");
    await backup(context.config, output);
    const target = restoreConfig(context);
    expect(() => restore({ ...target, key: Buffer.alloc(32, 8) }, output)).toThrow("restore_requires_original_encryption_key");
    const manifestPath = join(output, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.assets = [{ name: "../secrets/encryption.key", bytes: 0, sha256: "0".repeat(64) }];
    writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(() => restore(target, output)).toThrow("unsupported_or_invalid_backup_manifest");
    expect(existsSync(target.database)).toBe(false);
  });
});
