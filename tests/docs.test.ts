import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkMarkdownLinks, markdownAnchors } from "../scripts/markdown-links.mjs";
import { checkConfigurationReference } from "../scripts/documentation-contracts.mjs";
import { configSchemas } from "../src/server/domain/catalog.ts";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    if (!resolve(directory).startsWith(resolve(tmpdir(), "kekbot-docs-test-"))) throw new Error("unexpected_cleanup_path");
    rmSync(directory, { recursive: true, force: true });
  }
});
function guide() {
  const root = mkdtempSync(join(tmpdir(), "kekbot-docs-test-")); directories.push(root);
  mkdirSync(join(root, "docs"));
  writeFileSync(join(root, "docs", "guide.md"), '# Setup\n## 1. Install\n## Restart\n## Restart\n<a id="accepted"></a>\n');
  return (markdown: string) => checkMarkdownLinks(root, "docs/guide.md", markdown);
}

describe("documentation navigation", () => {
  it("accepts relative headings, duplicate heading slugs and explicit evidence anchors", () => {
    expect(guide()('[first](guide.md#1-install) [again](#restart-1) [evidence](guide.md#accepted)')).toEqual([]);
  });
  it("reports broken headings and missing files instead of accepting file existence alone", () => {
    const problems = guide()('[step](guide.md#missing) [file](absent.md)');
    expect(problems).toHaveLength(2); expect(problems[0]).toContain("missing Markdown anchor");
    expect(problems[1]).toContain("missing or out-of-repository");
  });
  it("ignores commands/example links inside fenced code and does not invent their headings", () => {
    expect(guide()('~~~sh\n[example](missing.md)\n# Not a heading\n~~~')).toEqual([]);
    expect(markdownAnchors('```sh\n# Not a heading\n```\n## Real heading')).toEqual(new Set(["real-heading"]));
  });
  it("rejects escaped repository paths and malformed URL encoding", () => {
    const problems = guide()('[outside](../../outside.md) [bad](%ZZ.md)');
    expect(problems).toHaveLength(2); expect(problems[1]).toContain("malformed local link");
  });
  it("supports encoded filenames and leaves external links to editorial review", () => {
    const root = mkdtempSync(join(tmpdir(), "kekbot-docs-test-")); directories.push(root);
    writeFileSync(join(root, "a guide.md"), "# Overview");
    expect(checkMarkdownLinks(root, "README.md", '[guide](a%20guide.md#overview) [web](https://kekbot.example/guide#step)')).toEqual([]);
  });
});

describe("documentation configuration contracts", () => {
  const schemas = { command: configSchemas.command };
  const reference = `\n## command\n${Object.keys(schemas.command.shape).map(field => `| \`${field}\` | documented |`).join("\n")}\n`;
  const example = { command: { name: "Example", trigger: "!example", responses: ["Hello, {user}!"] } };
  it("accepts a complete field reference and a strict real-schema example", () => {
    expect(checkConfigurationReference(schemas, reference, example)).toEqual([]);
  });
  it("rejects missing/stale reference fields and missing or invalid examples", () => {
    expect(checkConfigurationReference(schemas, reference.replace("`trigger`", "`removedField`"), {})).toEqual(expect.arrayContaining([
      "Field reference missing command.trigger", "Field reference contains unknown command.removedField", "Missing configuration example: command"
    ]));
    const problems = checkConfigurationReference(schemas, reference, { command: { ...example.command, unexpected: "private-input-marker" }, unsupported: {} });
    expect(problems.some(problem => problem.startsWith("Invalid configuration example: command"))).toBe(true);
    expect(problems).toContain("Unknown configuration example: unsupported");
    expect(problems.join("\n")).not.toContain("private-input-marker");
  });
});
