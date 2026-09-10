import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(root, path), "utf8")) as Record<string, unknown>;
}

describe("release contract", () => {
  it("keeps release metadata and verification scripts aligned", () => {
    const manifest = readJson("manifest.json");
    const versions = readJson("versions.json");
    const packageJson = readJson("package.json");
    const scripts = packageJson.scripts as Record<string, string>;

    expect(manifest.id).toBe("deer-notes");
    expect(manifest.isDesktopOnly).toBe(false);
    expect(manifest.description).toEqual(expect.any(String));
    expect((manifest.description as string).length).toBeLessThanOrEqual(250);
    expect((manifest.description as string).endsWith(".")).toBe(true);
    expect(versions[manifest.version as string]).toBe(manifest.minAppVersion);
    expect(packageJson.version).toBe(manifest.version);
    expect(packageJson.license).toBe("MIT");
    expect(scripts).toMatchObject({
      build: expect.any(String),
      test: expect.any(String),
      "test:single-thread": expect.any(String),
      typecheck: expect.any(String),
      "release:check": expect.any(String)
    });
  });
});
