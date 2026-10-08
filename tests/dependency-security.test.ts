import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ESLint } from "eslint";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);
const nextRequire = createRequire(createRequire(require.resolve("eslint-config-next")).resolve("@next/eslint-plugin-next"));
const plugin = nextRequire("./index.js");
const { getRootDirs } = nextRequire("./utils/get-root-dirs.js") as {
  getRootDirs(context: { cwd: string; settings: { next?: { rootDir?: unknown } } }): string[];
};
const loaderRequire = createRequire(createRequire(require.resolve("drizzle-kit/api")).resolve("@esbuild-kit/esm-loader"));
const corePath = loaderRequire.resolve("@esbuild-kit/core-utils");
const coreRequire = createRequire(corePath);
const esbuild = coreRequire("esbuild");
const globRequire = createRequire(nextRequire.resolve("fast-glob"));
const matchRequire = createRequire(globRequire.resolve("micromatch"));
const braces = matchRequire("braces");

function withDirectories(run: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), "kekbot-glob-security-"));
  try {
    for (const directory of ["apps/web/pages", "apps/admin", "apps/api", "apps/site1", "apps/site2", "apps/.hidden"])
      mkdirSync(join(root, directory), { recursive: true });
    writeFileSync(join(root, "apps/file.txt"), "fixture");
    run(root.replace(/\\/g, "/"));
  } finally { rmSync(root, { recursive: true, force: true }); }
}

it("retains Next root discovery for defaults, strings, arrays and directory glob forms", () => {
  withDirectories(root => {
    const discover = (rootDir?: unknown) => getRootDirs({ cwd: root, settings: { next: { rootDir } } }).sort();
    const expected = (...directories: string[]) => directories.map(directory => `${root}/${directory}`).sort();
    expect(discover()).toEqual([root]);
    expect(discover(`${root}/apps/web`)).toEqual(expected("apps/web"));
    expect(discover(`${root}/apps/*`)).toEqual(expected("apps/web", "apps/admin", "apps/api", "apps/site1", "apps/site2"));
    expect(discover(`${root}/apps/{web,admin}`)).toEqual(expected("apps/web", "apps/admin"));
    expect(discover(`${root}/apps/site{1..2}`)).toEqual(expected("apps/site1", "apps/site2"));
    expect(discover(`${root}/apps/!(api)`)).toEqual(expected("apps/web", "apps/admin", "apps/site1", "apps/site2", "apps/.hidden"));
    expect(discover(`${root}/apps/**`)).toEqual(expected("apps/web", "apps/web/pages", "apps/admin", "apps/api", "apps/site1", "apps/site2"));
    expect(discover(`${root}/apps/{web,admin}/**`)).toEqual(expected("apps/web/pages"));
    expect(discover([`${root}/apps/web`, `${root}/apps/admin`, null])).toEqual(expected("apps/web", "apps/admin"));
    expect(discover(`${root}/missing/*`)).toEqual([]);
    expect(discover(`${root}/apps/file.txt`)).toEqual([]);
    if (process.platform === "win32") expect(discover(`${root}/apps/{web,admin}`.replace(/\//g, "\\"))).toEqual(expected("apps/web", "apps/admin"));
  });
  expect(getRootDirs({ cwd: process.cwd(), settings: { next: { rootDir: "src/app" } } })).toEqual(["src/app"]);
});

it("bounds all string parser aliases before recursive brace or parenthesis walks", () => {
  const methods = [braces, braces.create, braces.parse, braces.compile, braces.expand, braces.stringify];
  const inputs = [
    "{".repeat(4900) + "a,b" + "}".repeat(4900),
    "(".repeat(4900) + "a" + ")".repeat(4900),
    "{(".repeat(2400) + "a,b" + ")}".repeat(2400),
    "{".repeat(4900) + "a"
  ];
  for (const input of inputs) for (const method of methods) {
    expect(() => method(input)).toThrow("Input nesting exceeds max depth (100)");
    expect(() => method(input, { maxDepth: Infinity })).toThrow(SyntaxError);
  }
  expect(() => braces(["{a,b}", inputs[0]], { expand: true })).toThrow(SyntaxError);
});

it("rejects malicious globs through the actual Next dependency chain without stack overflow", () => {
  withDirectories(root => {
    const pattern = `${root}/${"{".repeat(4900)}a,b${"}".repeat(4900)}`;
    expect(() => getRootDirs({ cwd: root, settings: { next: { rootDir: pattern } } })).toThrow(SyntaxError);
  });
});

it("preserves ordinary brace expansion, escaped literals, parser ASTs and the depth boundary", () => {
  expect(braces.expand("apps/{web,admin}/page{1..2}")).toEqual(["apps/web/page1", "apps/web/page2", "apps/admin/page1", "apps/admin/page2"]);
  const ast = braces.parse("apps/{web,admin}");
  expect(braces.expand(ast)).toEqual(["apps/web", "apps/admin"]);
  expect(braces.compile(ast)).toBe("apps/(web|admin)");
  expect(() => braces.compile("{".repeat(100) + "a,b" + "}".repeat(100))).not.toThrow();
  expect(() => braces.compile("{".repeat(101) + "a,b" + "}".repeat(101))).toThrow(SyntaxError);
  expect(() => braces.compile("\\{".repeat(2000))).not.toThrow();
  expect(() => braces.compile('"' + "{".repeat(2000) + '"')).not.toThrow();
});

it("still enforces Next's link rule with glob-selected project roots", async () => {
  const root = mkdtempSync(join(tmpdir(), "kekbot-next-rule-"));
  try {
    const pages = join(root, "apps/web/pages"); mkdirSync(pages, { recursive: true });
    writeFileSync(join(pages, "index.tsx"), "export default function Page() { return null; }");
    const lint = new ESLint({ overrideConfigFile: true, overrideConfig: [{
      files: ["**/*.jsx"], plugins: { "@next/next": plugin },
      languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
      settings: { next: { rootDir: `${root.replace(/\\/g, "/")}/apps/*` } },
      rules: { "@next/next/no-html-link-for-pages": "error" }
    }] });
    const [bad] = await lint.lintText('export default () => <a href="/">Home</a>', { filePath: "fixture.jsx" });
    expect(bad.messages.map(message => message.ruleId)).toContain("@next/next/no-html-link-for-pages");
    const [good] = await lint.lintText('export default () => <a href="https://example.com">External</a>', { filePath: "fixture.jsx" });
    expect(good.messages).toEqual([]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it("blocks cross-origin reads on the actual Drizzle loader esbuild while retaining local reads", async () => {
  expect(esbuild.version).toBe("0.25.12");
  const root = mkdtempSync(join(tmpdir(), "kekbot-esbuild-security-"));
  const context = await esbuild.context({});
  try {
    writeFileSync(join(root, "fixture.js"), "export const fixture = true;");
    const server = await context.serve({ host: "127.0.0.1", port: 0, servedir: root });
    const url = `http://127.0.0.1:${server.port}/fixture.js`;
    const local = await fetch(url); expect(local.status).toBe(200);
    expect(await local.text()).toContain("fixture = true");
    for (const origin of ["https://untrusted.example", "null"]) {
      const response = await fetch(url, { headers: { Origin: origin } });
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    }
    const core = loaderRequire("@esbuild-kit/core-utils");
    const input = "export const answer: number = 42";
    expect(core.transformSync(input, join(root, "fixture.ts")).code).toContain("42");
    expect((await core.transform(input, join(root, "fixture.mts"))).code).toContain("42");
  } finally { await context.dispose(); rmSync(root, { recursive: true, force: true }); }
});
