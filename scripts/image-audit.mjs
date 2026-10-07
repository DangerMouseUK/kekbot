import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const run = (command, args) => execFileSync(command, args, { encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024 }).trim();
export function auditImage(image, scanner, { sourceRef, version }) {
  if (process.platform !== "linux" || !scanner || !/^[a-zA-Z0-9./:_-]+$/.test(image)) throw new Error("image_audit_requires_linux_docker_and_gitleaks");
  const inspection = JSON.parse(run("docker", ["image", "inspect", image]))[0];
  const labels = inspection.Config.Labels;
  if (inspection.Os !== "linux" || inspection.Architecture !== "amd64" || !["node", "1000", "1000:1000"].includes(inspection.Config.User) || labels?.["org.opencontainers.image.revision"] !== sourceRef || labels?.["org.opencontainers.image.version"] !== version || labels?.["org.opencontainers.image.licenses"] !== "MIT" || labels?.["org.opencontainers.image.source"] !== "https://github.com/DangerMouseUK/kekbot") throw new Error("release_image_identity_or_platform_mismatch");
  const allowedEnv = new Set(["PATH", "NODE_VERSION", "YARN_VERSION", "NODE_ENV", "NEXT_TELEMETRY_DISABLED", "NEXT_MANUAL_SIG_HANDLE", "KEKBOT_RUN_JOBS", "KEKBOT_DATA_DIR", "HOSTNAME", "PORT"]);
  if (inspection.Config.Env.some(value => !allowedEnv.has(value.split("=")[0]))) throw new Error("unexpected_release_image_environment");
  const temporary = mkdtempSync(join(tmpdir(), "kekbot-image-audit-"));
  function scan(path) {
    const result = spawnSync(scanner, ["dir", "--redact", "--no-banner", path], { encoding: "utf8", windowsHide: true });
    if (result.status !== 0) { process.stderr.write(result.stderr ?? ""); throw new Error("release_image_secret_scan_failed"); }
  }
  function inspectFiles(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (/^\.env(?:\.|$)|^(?:data|secrets|proof-captures|backups|\.ssh)$|\.(?:sqlite.*|db|key|pem|token|capture|enc|p12|pfx)$|^KekBot-Test-Setup\.md$/i.test(entry.name)) throw new Error("private_file_in_release_image_layer");
      if (entry.isDirectory()) inspectFiles(join(directory, entry.name));
    }
  }
  try {
    const archive = join(temporary, "image.tar"); run("docker", ["save", "--output", archive, image]);
    run("tar", ["--extract", "--file", archive, "--directory", temporary, "--no-same-owner", "--no-same-permissions"]);
    const manifest = JSON.parse(readFileSync(join(temporary, "manifest.json"), "utf8"));
    if (manifest.length !== 1) throw new Error("release_archive_must_contain_one_image");
    const safeMember = member => { if (!/^[a-zA-Z0-9_./-]+$/.test(member) || member.split("/").includes("..") || member.startsWith("/")) throw new Error("unsafe_image_archive_member"); return join(temporary, member); };
    const config = safeMember(manifest[0].Config);
    // Image config is scanned as well as each application layer, including files
    // removed by subsequent layers. OS/base notices are retained in the image.
    const configFolder = join(temporary, "config"); mkdirSync(configFolder); cpSync(config, join(configFolder, "config.json")); scan(configFolder);
    let applicationLayers = 0;
    for (const [index, layer] of manifest[0].Layers.entries()) {
      const path = safeMember(layer);
      const members = run("tar", ["--list", "--file", path]).split("\n").map(member => member.replace(/^\.\//, ""));
      if (members.some(member => member.startsWith("/") || member.split("/").includes(".."))) throw new Error("unsafe_image_layer_member");
      if (!members.some(member => member === "app/" || member.startsWith("app/"))) continue;
      const target = join(temporary, `layer-${index}`); mkdirSync(target);
      run("tar", ["--extract", "--file", path, "--directory", target, "--no-same-owner", "--no-same-permissions"]);
      const app = join(target, "app");
      if (existsSync(app) && lstatSync(app).isDirectory()) { inspectFiles(app); scan(app); applicationLayers++; }
      rmSync(target, { recursive: true, force: true });
    }
    if (!applicationLayers) throw new Error("release_image_application_layers_missing");
    process.stdout.write(`Audited ${applicationLayers} application layers and image metadata; private runtime files absent; redacted Gitleaks passed.\n`);
    return { imageId: inspection.Id, platform: "linux/amd64", applicationLayers };
  } finally {
    if (!resolve(temporary).startsWith(resolve(tmpdir(), "kekbot-image-audit-"))) throw new Error("unexpected_image_audit_cleanup_path");
    rmSync(temporary, { recursive: true, force: true });
  }
}
