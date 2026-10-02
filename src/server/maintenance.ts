import Database from "better-sqlite3";
import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { readConfig, readPaths, type Config, type Environment } from "./config.ts";
import { digest, randomToken } from "./crypto.ts";
import { AppError } from "./errors.ts";
import { openStore, SCHEMA_VERSION } from "./storage/database.ts";
import { Repository } from "./storage/repository.ts";

function newSecret(path: string, value: () => string) {
  if (existsSync(path)) return;
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, value() + "\n", { flag: "wx", mode: 0o600 });
}

export function initialize(env: Environment = process.env) {
  const paths = readPaths(env);
  newSecret(paths.keyFile, () => randomBytes(32).toString("hex"));
  newSecret(paths.proofTokenFile, randomToken);
  const fixturePrivateKey = join(paths.directory, "secrets", "fixture-private.pem");
  if (paths.mode === "fixture" && existsSync(paths.fixturePublicKeyFile) !== existsSync(fixturePrivateKey)) {
    throw new AppError("fixture_key_pair_incomplete");
  }
  if (paths.mode === "fixture" && !existsSync(paths.fixturePublicKeyFile)) {
    const pair = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
    newSecret(fixturePrivateKey, () => pair.privateKey);
    newSecret(paths.fixturePublicKeyFile, () => pair.publicKey);
  }
  const config = readConfig(env);
  const store = openStore(config);
  store.close();
  return { mode: config.mode, database: config.database, keyFile: config.keyFile, proofTokenFile: config.proofTokenFile };
}

const assetName = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/);
const manifestSchema = z.object({
  format: z.literal(1), schemaVersion: z.literal(SCHEMA_VERSION), mode: z.enum(["live", "fixture"]),
  createdAt: z.string(), keyFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  databaseHash: z.string().regex(/^[a-f0-9]{64}$/),
  assets: z.array(z.object({ name: assetName, bytes: z.number().int().nonnegative(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }))
});

function regularFile(path: string) {
  if (!lstatSync(path).isFile()) throw new AppError("backup_contains_non_regular_file");
}

function assertOutsideData(destination: string, data: string) {
  const difference = relative(resolve(data), resolve(destination));
  if (!difference || (!difference.startsWith(`..${sep}`) && difference !== ".." && !isAbsolute(difference))) {
    throw new AppError("backup_destination_inside_data");
  }
}

export async function backup(config: Config, destination: string) {
  const output = resolve(destination);
  assertOutsideData(output, config.directory);
  if (existsSync(output)) throw new AppError("backup_destination_already_exists");
  if (!existsSync(config.database)) throw new AppError("database_missing_run_init");
  const store = openStore(config);
  const repository = new Repository(store);
  const owner = `backup:${randomUUID()}`;
  try {
    repository.acquireLease(owner);
    mkdirSync(output, { recursive: true, mode: 0o700 });
    mkdirSync(join(output, "assets"));
    const database = join(output, "kekbot.sqlite");
    await store.sqlite.backup(database, { progress: () => { repository.acquireLease(owner); return 100; } });
    // A standalone WAL-mode snapshot needs writable sidecar storage to open.
    // Normalize only the new snapshot so read-only recovery media works.
    const snapshot = new Database(database);
    try { snapshot.pragma("journal_mode = DELETE"); }
    finally { snapshot.close(); }
    const assets = readdirSync(config.assets).sort().map(name => {
      if (!assetName.safeParse(name).success) throw new AppError("invalid_asset_filename");
      const source = join(config.assets, name);
      regularFile(source);
      const bytes = readFileSync(source);
      repository.acquireLease(owner);
      copyFileSync(source, join(output, "assets", name), constants.COPYFILE_EXCL);
      return { name, bytes: bytes.length, sha256: digest(bytes) };
    });
    const manifest = { format: 1, schemaVersion: SCHEMA_VERSION, mode: config.mode, createdAt: new Date().toISOString(), keyFingerprint: digest(config.key), databaseHash: digest(readFileSync(database)), assets };
    // The manifest is written last. Its absence identifies an incomplete backup.
    writeFileSync(join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    return { directory: output, assets: assets.length, schemaVersion: SCHEMA_VERSION };
  } finally { repository.releaseLease(owner); store.close(); }
}

export function restore(config: Config, source: string) {
  const input = resolve(source);
  if (existsSync(config.database)) throw new AppError("restore_requires_new_data_directory");
  if (existsSync(config.assets) && readdirSync(config.assets).length) throw new AppError("restore_requires_empty_assets_directory");
  const parsed = manifestSchema.safeParse(JSON.parse(readFileSync(join(input, "manifest.json"), "utf8")));
  if (!parsed.success) throw new AppError("unsupported_or_invalid_backup_manifest");
  const manifest = parsed.data;
  if (manifest.mode !== config.mode) throw new AppError("backup_mode_mismatch");
  if (manifest.keyFingerprint !== digest(config.key)) throw new AppError("restore_requires_original_encryption_key");
  const database = join(input, "kekbot.sqlite");
  regularFile(database);
  if (digest(readFileSync(database)) !== manifest.databaseHash) throw new AppError("backup_database_checksum_mismatch");
  const check = new Database(database, { readonly: true, fileMustExist: true });
  try {
    if (check.pragma("integrity_check", { simple: true }) !== "ok") throw new AppError("backup_database_integrity_failed");
    const fingerprint = check.prepare("SELECT value FROM settings WHERE key='key_fingerprint'").get() as { value: string };
    const version = check.prepare("SELECT value FROM settings WHERE key='schema_version'").get() as { value: string };
    const mode = check.prepare("SELECT value FROM settings WHERE key='mode'").get() as { value: string };
    if (fingerprint.value !== manifest.keyFingerprint || Number(version.value) !== SCHEMA_VERSION || mode.value !== config.mode) throw new AppError("backup_database_metadata_mismatch");
  } finally { check.close(); }
  const seen = new Set<string>();
  for (const asset of manifest.assets) {
    if (seen.has(asset.name)) throw new AppError("duplicate_backup_asset");
    seen.add(asset.name);
    const path = join(input, "assets", asset.name);
    regularFile(path);
    const bytes = readFileSync(path);
    if (bytes.length !== asset.bytes || digest(bytes) !== asset.sha256) throw new AppError("backup_asset_checksum_mismatch");
  }
  mkdirSync(config.directory, { recursive: true });
  mkdirSync(config.assets, { recursive: true });
  for (const asset of manifest.assets) copyFileSync(join(input, "assets", asset.name), join(config.assets, asset.name), constants.COPYFILE_EXCL);
  const staged = join(config.directory, "restore.sqlite");
  copyFileSync(database, staged, constants.COPYFILE_EXCL);
  const restored = new Database(staged);
  try { restored.prepare("DELETE FROM leases").run(); }
  finally { restored.close(); }
  renameSync(staged, config.database);
  return { database: config.database, assets: manifest.assets.length, schemaVersion: SCHEMA_VERSION };
}
