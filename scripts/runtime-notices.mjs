import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// apk creates this database while installing into the empty runtime root. Keep
// its package versions/licenses untouched; copy only allowlisted legal metadata.
export function runtimePackages(database) {
  const packages = database.trim().split(/\n\n+/).map(block => {
    const fields = Object.fromEntries(block.split("\n").filter(line => /^[PVLoc]:/.test(line)).map(line => [line[0], line.slice(2)]));
    return { name: fields.P, version: fields.V, packageLicense: fields.L, origin: fields.o, buildCommit: fields.c };
  });
  if (packages.map(pkg => pkg.name).sort().join() !== "libgcc,libstdc++,musl" || packages.some(pkg => !/^[a-f0-9]{40}$/.test(pkg.buildCommit ?? "") || !/^(?:1\.2\.6|15\.2\.0)-r\d+$/.test(pkg.version ?? ""))) throw new Error("unreviewed_runtime_packages");
  return packages.sort((a, b) => a.name.localeCompare(b.name));
}
export function writeRuntimeNotices(root, nodeLicense, legal) {
  const packages = runtimePackages(readFileSync(join(root, "lib/apk/db/installed"), "utf8"));
  const destination = join(root, "app/THIRD_PARTY_LICENSES/runtime");
  mkdirSync(destination, { recursive: true });
  cpSync(legal, destination, { recursive: true });
  cpSync(nodeLicense, join(destination, "NODE-LICENSE"));
  writeFileSync(join(destination, "index.json"), JSON.stringify({ node: process.version, packages }, null, 2) + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) writeRuntimeNotices(...process.argv.slice(2));
