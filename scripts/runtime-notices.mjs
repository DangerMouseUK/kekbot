import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

// apk creates this database while installing into the empty runtime root. Keep
// its package versions/licenses untouched; copy only allowlisted legal metadata.
export function runtimePackages(database) {
  const packages = database.trim().split(/\n\n+/).map(block => {
    const fields = Object.fromEntries(block.split("\n").filter(line => /^[PVLoc]:/.test(line)).map(line => [line[0], line.slice(2)]));
    return { name: fields.P, version: fields.V, packageLicense: fields.L, origin: fields.o, buildCommit: fields.c };
  });
  if (packages.map(pkg => pkg.name).sort().join() !== "libgcc,libstdc++,musl" || packages.some(pkg => !/^[a-f0-9]{40}$/.test(pkg.buildCommit ?? "") || !(pkg.name === "musl" ? /^1\.2\.6-r\d+$/ : /^15\.2\.0-r\d+$/).test(pkg.version ?? "") || pkg.origin !== (pkg.name === "musl" ? "musl" : "gcc") || pkg.packageLicense !== (pkg.name === "musl" ? "MIT" : "GPL-2.0-or-later AND LGPL-2.1-or-later"))) throw new Error("unreviewed_runtime_packages");
  return packages.sort((a, b) => a.name.localeCompare(b.name));
}
export function writeRuntimeNotices(root, nodeLicense, legal) {
  if (process.version !== "v24.21.0") throw new Error("unreviewed_node_runtime");
  for (const [name, hash] of Object.entries({ "musl-COPYRIGHT": "b870108ec5e7790e9f9919064f1b9421d62d5f9b0e6c230c6adf7ea2da62e97b", "GCC-COPYING3": "8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903", "GCC-RUNTIME-EXCEPTION": "9d6b43ce4d8de0c878bf16b54d8e7a10d9bd42b75178153e3af6a815bdc90f74" })) if (createHash("sha256").update(readFileSync(join(legal, name))).digest("hex") !== hash) throw new Error("modified_upstream_runtime_notice");
  const packages = runtimePackages(readFileSync(join(root, "lib/apk/db/installed"), "utf8"));
  const destination = join(root, "app/THIRD_PARTY_LICENSES/runtime");
  mkdirSync(destination, { recursive: true });
  cpSync(legal, destination, { recursive: true });
  cpSync(nodeLicense, join(destination, "NODE-LICENSE"));
  writeFileSync(join(destination, "index.json"), JSON.stringify({ node: process.version, packages }, null, 2) + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) writeRuntimeNotices(...process.argv.slice(2));
