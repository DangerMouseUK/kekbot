import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

// Run only after SHA256SUMS verification. Exercise the exported artifact rather
// than relying solely on the image that produced it. No provider network access.
const run = args => execFileSync("docker", args, { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }).trim();
const volume = `kekbot-release-roundtrip-${process.pid}-${Date.now()}`;
let created = false;
try {
  if (process.platform !== "linux") throw new Error("release_roundtrip_requires_linux_docker");
  const root = resolve("output/release"), packages = readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory());
  if (packages.length !== 1) throw new Error("release_roundtrip_requires_one_candidate");
  const directory = join(root, packages[0].name), metadata = JSON.parse(readFileSync(join(directory, "release.json"), "utf8"));
  const imageId = metadata.image?.imageId;
  if (metadata.format !== "kekbot-release" || !/^sha256:[a-f0-9]{64}$/.test(imageId ?? "")) throw new Error("release_roundtrip_invalid_image_identity");
  const archives = readdirSync(directory).filter(name => name.endsWith("-linux-amd64-image.tar.gz"));
  if (archives.length !== 1) throw new Error("release_roundtrip_image_archive_missing");
  run(["load", "--input", join(directory, archives[0])]);
  if (JSON.parse(run(["image", "inspect", imageId]))[0].Id !== imageId) throw new Error("release_roundtrip_loaded_image_mismatch");
  run(["volume", "create", volume]); created = true;
  const options = ["run", "--rm", "--network", "none", "--read-only", "--tmpfs", "/tmp:rw,nosuid,size=16m", "--env", "KEKBOT_MODE=fixture", "--env", "KICK_BROADCASTER_USER_ID=123", "--volume", `${volume}:/data`, imageId, "node", "src/cli.ts"];
  run([...options, "init"]);
  run([...options, "fixture-seed"]);
  run([...options, "doctor"]);
  process.stdout.write("Exported image archive loaded with its recorded identity; fresh non-root/read-only fixture installation and diagnostics passed without network access.\n");
} catch { process.stderr.write("release_archive_roundtrip_failed; no runtime configuration or credential values printed.\n"); process.exitCode = 1; }
finally { if (created) run(["volume", "rm", volume]); }
