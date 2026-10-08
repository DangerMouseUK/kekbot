import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Configuration-only validation: never create containers, issue certificates or
// print expanded environment values. Private files remain in runner temp storage.
const root = resolve(import.meta.dirname, "..");
const directory = mkdtempSync(join(tmpdir(), "kekbot-doc-compose-"));
const environmentFile = join(directory, "runtime.env");
writeFileSync(environmentFile, readFileSync(join(root, ".env.example")), { mode: 0o600 });
for (const guide of ["DOCKER_DESKTOP", "CONFIGURATION"]) {
  const markdown = readFileSync(join(root, "docs", `${guide}.md`), "utf8");
  const yaml = markdown.match(/```yaml\r?\n([\s\S]*?)\r?\n```/)?.[1];
  if (!yaml) throw new Error(`Missing Compose example in ${guide}`);
  const override = join(directory, `${guide}.yaml`);
  writeFileSync(override, yaml, { mode: 0o600 });
  const env = { ...process.env, KEKBOT_ENV_FILE: environmentFile, KEKBOT_HOST_DATA_DIR: join(directory, "data") };
  const configuration = JSON.parse(execFileSync("docker", ["compose", "-p", "kekbot-doc-check", "-f", join(root, "compose.yaml"), "-f", override, "config", "--format", "json"], { cwd: root, env, encoding: "utf8", windowsHide: true }));
  const service = configuration.services.kekbot;
  if (guide === "DOCKER_DESKTOP" && (service.platform !== "linux/amd64" || !service.volumes.some(volume => volume.target === "/data" && volume.type === "volume"))) throw new Error("Desktop guide must select amd64 and a named data volume");
  if (guide === "CONFIGURATION" && !service.volumes.some(volume => volume.target === "/run/secrets/kekbot-key" && volume.read_only)) throw new Error("Key example must mount the key read-only");
}
process.stdout.write("Validated both handbook Compose overrides without starting services.\n");
