import { expect, it } from "vitest";
import { runtimePackages } from "../scripts/runtime-notices.mjs";

const database = ["musl", "libgcc", "libstdc++"].map(name => `P:${name}\nV:${name === "musl" ? "1.2.6-r2" : "15.2.0-r5"}\nL:${name === "musl" ? "MIT" : "GPL-2.0-or-later AND LGPL-2.1-or-later"}\no:${name === "musl" ? "musl" : "gcc"}\nc:${"a".repeat(40)}\nF:lib\nR:library.so`).join("\n\n");
it("retains the actual OS versions, license metadata and build provenance", () => {
  expect(runtimePackages(database)).toMatchObject([{ name: "libgcc", version: "15.2.0-r5", origin: "gcc" }, { name: "libstdc++", packageLicense: "GPL-2.0-or-later AND LGPL-2.1-or-later" }, { name: "musl", version: "1.2.6-r2" }]);
});
it("requires new review when the runtime closure, source version or provenance changes", () => {
  for (const invalid of ["", database.replace("P:musl", "P:busybox"), database.replace("1.2.6-r2", "1.3.0-r0"), database.replace("c:" + "a".repeat(40), "c:unavailable"), database + "\n\nP:apk-tools\nV:3.0.0-r0"]) expect(() => runtimePackages(invalid)).toThrow("unreviewed_runtime_packages");
});
