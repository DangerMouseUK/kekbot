import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describeError, hasErrorText, hostOnlyErrorCodes } from "../src/app/messages.ts";

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sources(join(directory, entry.name))
      : entry.name.endsWith(".ts")
        ? [join(directory, entry.name)]
        : [],
  );
}

// Every error code the server can throw, plus codes routes return directly.
const thrown = new Set(
  [...sources("src/server"), ...sources("src/app/api")].flatMap((file) => {
    const text = readFileSync(file, "utf8");
    return [
      ...[...text.matchAll(/(?:AppError|DeliveryError)\(\s*"([a-z0-9_]+)"/g)].map(
        (match) => match[1],
      ),
      ...[...text.matchAll(/error: "([a-z0-9_]+)"/g)].map((match) => match[1]),
    ];
  }),
);

describe("dashboard error messages", () => {
  it("finds the server's error codes", () => {
    expect(thrown.size).toBeGreaterThan(150);
  });

  it("has plain-English text for every code except deliberate host-only exclusions", () => {
    const missing = [...thrown]
      .filter((code) => !hasErrorText(code) && !hostOnlyErrorCodes.has(code))
      .sort();
    expect(missing).toEqual([]);
  });

  it("keeps host-only exclusions real so the list cannot hide dashboard codes", () => {
    const stale = [...hostOnlyErrorCodes].filter((code) => !thrown.has(code) || hasErrorText(code));
    expect(stale).toEqual([]);
  });

  it("never shows a raw code for a known error and names unknown ones in a sentence", () => {
    for (const code of thrown) {
      if (!hasErrorText(code)) continue;
      const { title } = describeError(code);
      expect(title, code).not.toContain("_");
      expect(title, code).toMatch(/[.!?]$/);
    }
    expect(describeError("brand_new_code").title).toBe("Brand new code.");
  });
});
