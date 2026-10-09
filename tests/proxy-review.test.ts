import { expect, it } from "vitest";
import { assessGoBinary, jsonSequence, reconcileProxy } from "../scripts/proxy-review.mjs";

const config = { scanner_name: "govulncheck", scanner_version: "v1.8.0", scan_mode: "binary", scan_level: "symbol", db: "https://vuln.go.dev" };
const SBOM = { go_version: "go1.27.2", modules: [{ path: "github.com/caddyserver/caddy/v2", version: "v2.11.6" }, { path: "golang.org/x/net", version: "v0.60.0" }, { path: "golang.org/x/crypto", version: "v0.57.0" }] };
const finding = { osv: "GO-2026-5932", trace: [{ module: "golang.org/x/crypto", version: "v0.57.0" }] };
const scan = (result = finding) => ({ status: 0, stdout: [{ config }, { SBOM }, { finding: result }].map(row => JSON.stringify(row, null, 2)).join("\n") });
const symbols = { status: 0, stdout: "000 T main.main\n001 T github.com/caddyserver/caddy/v2.Start\n" };
const imageDigest = `sha256:${"a".repeat(64)}`;
it("reads concatenated scanner messages and rejects incomplete or invalid output", () => {
  expect(jsonSequence(' {"text":"escaped \\\" }"}\n{"next":[1,2]} ')).toHaveLength(2);
  for (const text of ["", "{}garbage", "{} {", '{"a":}', "[]"]) expect(() => jsonSequence(text)).toThrow();
});
it("requires real symbols and exact patched toolchain/modules before treating OpenPGP as uncompiled", () => {
  expect(assessGoBinary(scan(), symbols)).toMatchObject({ passed: true, moduleOnly: ["GO-2026-5932"] });
  for (const invalid of [{ ...symbols, status: 1 }, { status: 0, stdout: "no symbols" }, { ...symbols, stdout: symbols.stdout + "002 T golang.org/x/crypto/openpgp.ReadMessage\n" }]) expect(assessGoBinary(scan(), invalid).passed).toBe(false);
  for (const [before, after] of [["go1.27.2", "go1.26.8"], ["v0.60.0", "v0.59.0"], ["v1.8.0", "v1.7.0"], ["binary", "source"]]) expect(assessGoBinary({ ...scan(), stdout: scan().stdout.replace(before, after) }, symbols).passed).toBe(false);
});
it("refuses package/symbol findings, any additional advisory and missing or malformed evidence", () => {
  const imported = { ...finding, trace: [{ ...finding.trace[0], package: "golang.org/x/crypto/openpgp" }] };
  expect(assessGoBinary(scan(imported), symbols).passed).toBe(false);
  expect(assessGoBinary(scan({ ...finding, osv: "GO-2026-1234" }), symbols).passed).toBe(false);
  for (const invalid of [{ ...scan(), status: 1 }, { status: 0, stdout: "{}" }, { status: 0, stdout: scan().stdout + '{"error":"private error"}' }, { status: 0, stdout: scan().stdout.slice(0, -1) }]) expect(assessGoBinary(invalid, symbols).passed).toBe(false);
});
it("preserves the raw scan and binds the one not-affected decision to the scanned image and binary", () => {
  const image = { available: true, passed: false, imageDigest, counts: { UNKNOWN: 1 }, findings: [{ id: "GO-2026-5932", package: "golang.org/x/crypto", installed: "v0.57.0" }], omittedFindings: 0 };
  const binary = { ...assessGoBinary(scan(), symbols), imageDigest, binarySha256: "b".repeat(64) };
  expect(reconcileProxy(image, binary)).toMatchObject({ passed: true, counts: { UNKNOWN: 1 }, notAffected: [{ id: "GO-2026-5932", binarySha256: binary.binarySha256 }] });
  expect(reconcileProxy(image, { ...binary, imageDigest: `sha256:${"c".repeat(64)}` }).passed).toBe(false);
  expect(reconcileProxy(image, { ...binary, passed: false }).passed).toBe(false);
  expect(reconcileProxy({ ...image, omittedFindings: 1 }, binary).passed).toBe(false);
  expect(reconcileProxy({ ...image, counts: { UNKNOWN: 2 } }, binary).passed).toBe(false);
  expect(reconcileProxy({ ...image, findings: [{ ...image.findings[0], installed: "v0.58.0" }] }, binary).passed).toBe(false);
});
