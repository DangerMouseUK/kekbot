import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { basename } from "node:path";

// Check tracked files too: git add --force must not bypass publication policy.
const files = [...new Set(execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
  encoding: "utf8", windowsHide: true
}).split("\0").filter(Boolean))];
const privateDirectory = /(?:^|\/)(?:data|backups|secrets|proof-captures|\.ssh|\.config|\.next|node_modules|test-results|playwright-report|output|coverage|__pycache__|\.codex|\.vscode|\.idea|\.playwright-cli)(?:\/|$)/i;
const privateName = /^(?:kick-client-(?:id|secret)|kick-creator\.json|kick-live-evidence\.json|restore-evidence\.json|live-recovery-paths\.json|workload-driver\.json|workload-report\.json|KekBot-Test-Setup\.md)$/i;
const privateExtension = /\.(?:env|key|pem|token|p12|pfx|db|capture|enc|pub|pyc|tsbuildinfo|log|zip|tar|tar\.gz|tgz|7z)$|\.sqlite[^/]*$/i;
const privateKey = /-----BEGIN (?:OPENSSH|RSA|EC|DSA|ENCRYPTED|PGP)? ?PRIVATE KEY(?: BLOCK)?-----/;
const personalPath = /\b[a-z]:[\\/]Users[\\/]|(?:^|[\s"'])\/(?:Users|home)\/[a-z0-9_.-]+\//im;
const problems = [];
for (const file of files) {
  const name = basename(file);
  if (privateDirectory.test(file) || privateName.test(name) || privateExtension.test(name) ||
      (/^\.env/i.test(name) && name !== ".env.example")) {
    problems.push(`${file}: private artifact cannot be published`);
    continue;
  }
  const entry = lstatSync(file, { throwIfNoEntry: false });
  if (entry?.isSymbolicLink()) {
    problems.push(`${file}: symbolic links require an explicit publication policy`);
    continue;
  }
  // Unstaged deletions remain in the index. Inspect their indexed content until
  // the deletion is staged, rather than failing an otherwise valid local check.
  const content = entry ? readFileSync(file, "utf8") : execFileSync("git", ["show", `:${file}`], { encoding: "utf8", windowsHide: true });
  if (privateKey.test(content) || personalPath.test(content)) problems.push(`${file}: private key or personal path detected`);
  if (name === ".env.example") {
    for (const line of content.split(/\r?\n/)) {
      if (/^(?:KICK_CLIENT_ID|KICK_CLIENT_SECRET|KICK_BROADCASTER_USER_ID|KEKBOT_PUBLIC_URL)\s*=\s*\S/.test(line)) {
        problems.push(`${file}: provider-specific example values must be empty`);
        break;
      }
    }
  }
}
if (problems.length) {
  process.stderr.write(`${problems.join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(`Publication policy passed for ${files.length} files; provider examples are empty.\n`);
