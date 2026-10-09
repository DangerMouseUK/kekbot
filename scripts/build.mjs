import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, realpathSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { writeNotices } from "./license-notices.mjs";

const result = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
  stdio: "inherit",
  env: { ...process.env, KEKBOT_RUN_JOBS: "0", NEXT_TELEMETRY_DISABLED: "1" }
});
if (result.status !== 0) process.exit(result.status ?? 1);
mkdirSync(".next/standalone/.next", { recursive: true });
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
cpSync("drizzle", ".next/standalone/drizzle", { recursive: true });
cpSync("src/server", ".next/standalone/src/server", { recursive: true });
cpSync("src/cli.ts", ".next/standalone/src/cli.ts");
// Next bundles some libraries into server chunks; the host CLI also needs their
// ordinary Node entrypoints. Package them explicitly rather than relying on an
// ancestor checkout's node_modules or including runtime data in file tracing.
for (const name of ["drizzle-orm", "zod"]) {
  cpSync(realpathSync(join("node_modules", name)), join(".next/standalone/node_modules", name), { recursive: true, dereference: true });
}
const sqliteSource = realpathSync("node_modules/better-sqlite3");
const sqliteTarget = ".next/standalone/node_modules/better-sqlite3";
mkdirSync(sqliteTarget, { recursive: true });
for (const part of ["package.json", "LICENSE", "lib", "prebuilds", "build/Release"]) {
  const source = join(sqliteSource, part);
  if (existsSync(source)) cpSync(source, join(sqliteTarget, part), { recursive: true, dereference: true });
}
if (existsSync("public")) cpSync("public", ".next/standalone/public", { recursive: true });
// Fail rather than silently shipping native binaries omitted from the review.
function verifyNoImageOptimizer(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) verifyNoImageOptimizer(path);
    if (entry.isFile() && entry.name === "package.json") {
      const pkg = JSON.parse(readFileSync(path, "utf8"));
      if (pkg.name === "sharp" || pkg.name?.startsWith("@img/")) throw new Error("unused_image_optimizer_in_standalone");
    }
  }
}
verifyNoImageOptimizer(".next/standalone");
writeNotices();
