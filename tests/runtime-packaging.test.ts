import { expect, it } from "vitest";
import { runtimePackages } from "../scripts/runtime-notices.mjs";
import { writeRuntimeNotices } from "../scripts/runtime-notices.mjs";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const database = ["musl", "libgcc", "libstdc++"].map(name => `P:${name}\nV:${name === "musl" ? "1.2.6-r2" : "15.2.0-r5"}\nL:${name === "musl" ? "MIT" : "GPL-2.0-or-later AND LGPL-2.1-or-later"}\no:${name === "musl" ? "musl" : "gcc"}\nc:${"a".repeat(40)}\nF:lib\nR:library.so`).join("\n\n");
it("retains the actual OS versions, license metadata and build provenance", () => {
  expect(runtimePackages(database)).toMatchObject([{ name: "libgcc", version: "15.2.0-r5", origin: "gcc" }, { name: "libstdc++", packageLicense: "GPL-2.0-or-later AND LGPL-2.1-or-later" }, { name: "musl", version: "1.2.6-r2" }]);
});
it("requires new review when the runtime closure, source version or provenance changes", () => {
  for (const invalid of ["", database.replace("P:musl", "P:busybox"), database.replace("1.2.6-r2", "1.3.0-r0"), database.replace("1.2.6-r2", "15.2.0-r5"), database.replace("L:MIT", "L:GPL-3.0-only"), database.replace("o:gcc", "o:unreviewed"), database.replace("c:" + "a".repeat(40), "c:unavailable"), database + "\n\nP:apk-tools\nV:3.0.0-r0"]) expect(() => runtimePackages(invalid)).toThrow("unreviewed_runtime_packages");
});
it("packages reviewed legal texts with the actual inventory and rejects modified notices", () => {
  const root = mkdtempSync(join(tmpdir(), "kekbot-runtime-legal-"));
  try {
    mkdirSync(join(root, "lib/apk/db"), { recursive: true }); writeFileSync(join(root, "lib/apk/db/installed"), database);
    const legal = join(root, "legal"), nodeLicense = join(root, "NODE-LICENSE");
    cpSync("licenses/runtime", legal, { recursive: true }); writeFileSync(nodeLicense, "synthetic upstream Node legal text");
    writeRuntimeNotices(root, nodeLicense, legal);
    const shipped = join(root, "app/THIRD_PARTY_LICENSES/runtime");
    expect(JSON.parse(readFileSync(join(shipped, "index.json"), "utf8")).packages).toEqual(runtimePackages(database));
    expect(readFileSync(join(shipped, "NODE-LICENSE"), "utf8")).toBe("synthetic upstream Node legal text");
    writeFileSync(join(legal, "GCC-RUNTIME-EXCEPTION"), "modified");
    expect(() => writeRuntimeNotices(root, nodeLicense, legal)).toThrow("modified_upstream_runtime_notice");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
