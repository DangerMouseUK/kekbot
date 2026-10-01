import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8", windowsHide: true })
  .split("\0").filter(file => file.endsWith(".md"));
const problems = [];
for (const file of files) {
  const markdown = readFileSync(resolve(root, file), "utf8");
  // This repository uses inline links. External URLs and anchors are not fetched.
  for (const link of markdown.matchAll(/!?\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const target = link[1].replace(/^<|>$/g, "");
    if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(target)) continue;
    const path = resolve(root, dirname(file), decodeURIComponent(target.split(/[?#]/)[0]));
    const fromRoot = relative(root, path);
    if (isAbsolute(fromRoot) || fromRoot === ".." || fromRoot.startsWith("../") || fromRoot.startsWith("..\\") || !existsSync(path)) {
      problems.push(`${file}: missing or out-of-repository link ${target}`);
    }
  }
}
const primary = readFileSync(resolve(root, "docs/PRD.md"), "utf8").replace(/\r\n/g, "\n");
const selfHosted = readFileSync(resolve(root, "docs/PRD-self-hosted.md"), "utf8").replace(/\r\n/g, "\n");
if (primary !== selfHosted) problems.push("The two PRDs differ; update both together.");
if (/KeckBot/.test(primary)) problems.push("The PRD contains the old project name.");
if (problems.length) {
  process.stderr.write(`${problems.join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(`Checked local links in ${files.length} Markdown files and matching PRDs.\n`);
