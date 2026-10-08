import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// Exact local remediation, not a version-wide advisory exclusion. Remove when upstream fixes it.
export const bracesRemediation = {
  advisory: "GHSA-vfj7-8cjw-p6xm",
  path: ".>eslint-config-next>@next/eslint-plugin-next>fast-glob>micromatch>braces",
  patch: "patches/braces@3.0.3.patch",
  patchHash: "8ac03bd098d216f245a065e9aebe92c2b0422f95c75abecf6511315d5d692345",
  parserHash: "7945f0e256d6f287edc56c38fa1197eeb65f47c17fa974f96401fcc24232eb2e"
};
const hash = text => createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");
export function verifyBracesRemediation(read = path => readFileSync(path, "utf8")) {
  try {
    const pkg = JSON.parse(read("package.json"));
    if (pkg.pnpm?.patchedDependencies?.["braces@3.0.3"] !== bracesRemediation.patch) return false;
    if (hash(read(bracesRemediation.patch)) !== bracesRemediation.patchHash) return false;
    const lock = read("pnpm-lock.yaml");
    if (!lock.includes(`hash: ${bracesRemediation.patchHash}`) || !lock.includes(`path: ${bracesRemediation.patch}`)) return false;
    let require = createRequire(import.meta.url);
    for (const name of ["eslint-config-next", "@next/eslint-plugin-next", "fast-glob", "micromatch"]) require = createRequire(require.resolve(name));
    const root = dirname(require.resolve("braces"));
    return JSON.parse(read(join(root, "package.json"))).version === "3.0.3" && hash(read(join(root, "lib/parse.js"))) === bracesRemediation.parserHash;
  } catch { return false; }
}
