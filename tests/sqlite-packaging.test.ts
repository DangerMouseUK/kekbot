import { expect, it } from "vitest";
import { sqliteTarget, trimSqlitePrebuilds } from "../scripts/sqlite-packaging.mjs";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

it("selects the native binding without confusing Linux musl and glibc", () => {
  expect(sqliteTarget("linux", "x64", undefined)).toBe("linuxmusl-x64");
  expect(sqliteTarget("linux", "x64", "2.41")).toBe("linux-x64");
  expect(sqliteTarget("win32", "x64", undefined)).toBe("win32-x64");
});
it("trims both traced and CLI copies and refuses a distribution without its native binding", () => {
  const root = mkdtempSync(join(tmpdir(), "kekbot-native-packaging-"));
  try {
    const copies = ["node_modules/better-sqlite3", "node_modules/.pnpm/sqlite/node_modules/better-sqlite3"];
    for (const copy of copies) {
      const directory = join(root, copy); mkdirSync(join(directory, "prebuilds"), { recursive: true });
      writeFileSync(join(directory, "package.json"), JSON.stringify({ name: "better-sqlite3" }));
      for (const target of ["linux-x64", "linux-arm64", "linuxmusl-x64", "win32-x64"]) writeFileSync(join(directory, "prebuilds", `${target}.node`), "synthetic native binding");
    }
    trimSqlitePrebuilds(root, "linuxmusl-x64");
    for (const copy of copies) expect(readdirSync(join(root, copy, "prebuilds"))).toEqual(["linuxmusl-x64.node"]);
    expect(() => trimSqlitePrebuilds(root, "win32-x64")).toThrow("sqlite_runtime_binding_missing");
    expect(existsSync(join(root, copies[0], "prebuilds/linuxmusl-x64.node"))).toBe(true);
    expect(() => trimSqlitePrebuilds(root, "../outside")).toThrow("unsupported_sqlite_distribution_target");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
