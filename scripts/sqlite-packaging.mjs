import { existsSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export function sqliteTarget(platform, arch, glibcVersion) {
  return `${platform === "linux" && !glibcVersion ? "linuxmusl" : platform}-${arch}`;
}
// Next tracing and the maintenance CLI can each copy this package. Trim both
// copies, including foreign-architecture prebuilds from the upstream npm tarball.
export function trimSqlitePrebuilds(standalone, target) {
  const root = realpathSync(standalone); let packages = 0;
  if (!/^(?:linuxmusl|linux|darwin|win32)-(?:x64|arm64)$/.test(target)) throw new Error("unsupported_sqlite_distribution_target");
  function visit(directory) {
    if (existsSync(join(directory, "package.json")) && JSON.parse(readFileSync(join(directory, "package.json"), "utf8")).name === "better-sqlite3") {
      packages++;
      const prebuilds = join(directory, "prebuilds");
      if (!existsSync(join(prebuilds, `${target}.node`)) && !existsSync(join(directory, "build/Release/better_sqlite3.node"))) throw new Error("sqlite_runtime_binding_missing");
      if (existsSync(prebuilds)) for (const name of readdirSync(prebuilds)) if (name.endsWith(".node") && name !== `${target}.node`) {
        const path = realpathSync(join(prebuilds, name)), within = relative(root, path);
        if (within.startsWith("..") || resolve(root, within) !== path) throw new Error("sqlite_distribution_path_escape");
        rmSync(path);
      }
    }
    for (const entry of readdirSync(directory, { withFileTypes: true })) if (entry.isDirectory()) visit(join(directory, entry.name));
  }
  visit(root); if (!packages) throw new Error("sqlite_distribution_package_missing");
}
