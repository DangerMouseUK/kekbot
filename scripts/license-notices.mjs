import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve, relative } from "node:path";

// Copy legal notices from the actual target-platform production dependency graph.
// Do not put local package paths or package-author contact metadata in the index.
export function writeNotices() {
  const root = resolve("."), destination = resolve("output/licenses"), visited = new Set(), inventory = [];
  mkdirSync(destination, { recursive: true });
  function visit(directory, isRoot = false) {
    directory = realpathSync(directory);
    if (visited.has(directory)) return;
    visited.add(directory);
    const pkg = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
    if (!isRoot) {
      const target = join(destination, `${pkg.name.replaceAll("/", "_")}@${pkg.version}`), notices = [];
      function copyNotices(folder, depth = 0) {
        for (const entry of readdirSync(folder, { withFileTypes: true })) {
          const path = join(folder, entry.name);
          if (entry.isFile() && /^(?:licen[sc]e|notice|copying|copyright|third[-_]party[-_]licen[sc]es?)(?:[._-].*)?$/i.test(entry.name)) {
            const name = relative(directory, path); mkdirSync(target, { recursive: true });
            cpSync(path, join(target, name), { recursive: true }); notices.push(name.replaceAll("\\", "/"));
          } else if (entry.isDirectory() && depth < 6 && !["node_modules", ".git", "test", "tests", "__tests__"].includes(entry.name)) copyNotices(path, depth + 1);
        }
      }
      copyNotices(directory);
      inventory.push({ name: pkg.name, version: pkg.version, license: pkg.license ?? "See bundled notices", notices });
    }
    const require = createRequire(join(directory, "package.json"));
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies })) {
      const location = require.resolve.paths(name)?.map(parent => join(parent, name)).find(path => existsSync(join(path, "package.json")));
      if (location) visit(location);
      else if (name in (pkg.dependencies ?? {}) && !(name in (pkg.optionalDependencies ?? {}))) throw new Error(`Missing production dependency: ${name}`);
    }
  }
  visit(root, true);
  inventory.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
  writeFileSync(join(destination, "index.json"), JSON.stringify(inventory, null, 2) + "\n");
  return inventory.length;
}
