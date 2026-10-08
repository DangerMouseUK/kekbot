import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { checkMarkdownLinks } from "./markdown-links.mjs";
import { checkConfigurationReference } from "./documentation-contracts.mjs";
import { configSchemas } from "../src/server/domain/catalog.ts";

const root = resolve(import.meta.dirname, "..");
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8", windowsHide: true })
  .split("\0").filter(file => file.endsWith(".md"));
const problems = [];
for (const file of files) {
  const markdown = readFileSync(resolve(root, file), "utf8");
  // Inline local links and Markdown fragments are checked; external URLs are not fetched.
  problems.push(...checkMarkdownLinks(root, file, markdown));
}
const primary = readFileSync(resolve(root, "docs/PRD.md"), "utf8").replace(/\r\n/g, "\n");
const selfHosted = readFileSync(resolve(root, "docs/PRD-self-hosted.md"), "utf8").replace(/\r\n/g, "\n");
if (primary !== selfHosted) problems.push("The two PRDs differ; update both together.");
if (/KeckBot/.test(primary)) problems.push("The PRD contains the old project name.");
const examples = {};
for (const file of readdirSync(resolve(root, "docs/examples")).filter(file => file.endsWith(".json"))) {
  try { examples[file.slice(0, -5)] = JSON.parse(readFileSync(resolve(root, "docs/examples", file), "utf8")); }
  catch { problems.push(`Invalid JSON in documentation example: ${file}`); }
}
problems.push(...checkConfigurationReference(configSchemas, readFileSync(resolve(root, "docs/CONFIGURATION_FIELDS.md"), "utf8").replace(/\r\n/g, "\n"), examples));
if (problems.length) {
  process.stderr.write(`${problems.join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(`Checked local links/anchors in ${files.length} Markdown files, matching PRDs, all configuration fields and ${Object.keys(examples).length} schema examples.\n`);
