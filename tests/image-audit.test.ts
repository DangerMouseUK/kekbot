import { afterEach, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { frameworkGeneratedFinding } from "../scripts/image-audit.mjs";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
it("excepts only exact generated Next metadata fields and refuses enabled actions or application secrets", () => {
  const root = mkdtempSync(join(tmpdir(), "kekbot-image-audit-test-")); roots.push(root);
  const preview = join(root, ".next/prerender-manifest.json"), actions = join(root, ".next/server/server-reference-manifest.json");
  mkdirSync(dirname(actions), { recursive: true });
  const previewValue = { version: 4, preview: { previewModeId: randomBytes(16).toString("hex"), previewModeSigningKey: randomBytes(32).toString("hex"), previewModeEncryptionKey: randomBytes(32).toString("hex") } };
  writeFileSync(preview, JSON.stringify(previewValue, null, 2));
  const generated = { RuleID: "generic-api-key", File: preview, StartLine: 5, EndLine: 5 };
  expect(frameworkGeneratedFinding(generated, root)).toBe(true);
  expect(frameworkGeneratedFinding({ ...generated, RuleID: "kick-secret" }, root)).toBe(false);
  expect(frameworkGeneratedFinding({ ...generated, StartLine: 4, EndLine: 4 }, root)).toBe(false);
  const actionValue = { node: {}, edge: {}, encryptionKey: randomBytes(32).toString("base64") };
  writeFileSync(actions, JSON.stringify(actionValue, null, 2));
  const actionFinding = { ...generated, File: actions, StartLine: 4, EndLine: 4 };
  expect(frameworkGeneratedFinding(actionFinding, root)).toBe(true);
  writeFileSync(actions, JSON.stringify({ ...actionValue, node: { actualAction: {} } }, null, 2));
  expect(frameworkGeneratedFinding(actionFinding, root)).toBe(false);
  const privateFile = join(root, "application.json"); writeFileSync(privateFile, JSON.stringify({ encryptionKey: randomBytes(32).toString("base64") }, null, 2));
  expect(frameworkGeneratedFinding({ ...actionFinding, File: privateFile }, root)).toBe(false);
  writeFileSync(preview, JSON.stringify({ ...previewValue, providerSecret: randomBytes(32).toString("hex") }, null, 2));
  expect(frameworkGeneratedFinding({ ...generated, StartLine: 8, EndLine: 8 }, root)).toBe(false);
});

it("excepts Next's separate preview-props manifest only as an exact copy of the prerender preview keys", () => {
  const root = mkdtempSync(join(tmpdir(), "kekbot-image-audit-test-")); roots.push(root);
  const manifest = join(root, ".next/prerender-manifest.json"), props = join(root, ".next/server/preview-props.json");
  mkdirSync(dirname(props), { recursive: true });
  const preview = { previewModeId: randomBytes(16).toString("hex"), previewModeSigningKey: randomBytes(32).toString("hex"), previewModeEncryptionKey: randomBytes(32).toString("hex") };
  const finding = { RuleID: "generic-api-key", File: props, StartLine: 3, EndLine: 3 };
  writeFileSync(props, JSON.stringify(preview, null, 2));
  expect(frameworkGeneratedFinding(finding, root)).toBe(false); // no prerender manifest to match
  writeFileSync(manifest, JSON.stringify({ version: 4, preview }, null, 2));
  expect(frameworkGeneratedFinding(finding, root)).toBe(true);
  expect(frameworkGeneratedFinding({ ...finding, StartLine: 4, EndLine: 4 }, root)).toBe(true);
  expect(frameworkGeneratedFinding({ ...finding, StartLine: 2, EndLine: 2 }, root)).toBe(false);
  expect(frameworkGeneratedFinding({ ...finding, RuleID: "kick-secret" }, root)).toBe(false);
  writeFileSync(props, JSON.stringify({ ...preview, previewModeSigningKey: randomBytes(32).toString("hex") }, null, 2));
  expect(frameworkGeneratedFinding(finding, root)).toBe(false); // differs from the generated manifest
  writeFileSync(props, JSON.stringify({ ...preview, providerSecret: randomBytes(32).toString("hex") }, null, 2));
  expect(frameworkGeneratedFinding(finding, root)).toBe(false); // extra key
  const elsewhere = join(root, ".next/server/app/preview-props.json"); mkdirSync(dirname(elsewhere), { recursive: true });
  writeFileSync(elsewhere, JSON.stringify(preview, null, 2));
  expect(frameworkGeneratedFinding({ ...finding, File: elsewhere }, root)).toBe(false);
});
