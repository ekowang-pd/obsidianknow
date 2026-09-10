import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(root, path), "utf8")) as Record<string, unknown>;
}

describe("release contract", () => {
  it("locks platform binaries for clean installs on every supported build host", () => {
    const lock = readJson("package-lock.json") as {
      packages: Record<string, { version?: string; optionalDependencies?: Record<string, string> }>;
    };
    for (const [path, dependency] of Object.entries(lock.packages)) {
      if (!path.endsWith("/rollup") && !path.endsWith("/esbuild")) continue;
      const prefix = path.slice(0, path.lastIndexOf("node_modules/") + "node_modules/".length);
      for (const [name, version] of Object.entries(dependency.optionalDependencies ?? {})) {
        if (!name.startsWith("@rollup/") && !name.startsWith("@esbuild/")) continue;
        const binary = lock.packages[`${prefix}${name}`] ?? lock.packages[`node_modules/${name}`];
        expect(binary?.version, `${path} requires ${name} on other build hosts`).toBe(version);
      }
    }
  });
  it("keeps release metadata and verification scripts aligned", () => {
    const manifest = readJson("manifest.json");
    const versions = readJson("versions.json");
    const packageJson = readJson("package.json");
    const scripts = packageJson.scripts as Record<string, string>;

    expect(manifest.id).toBe("deer-notes");
    expect(manifest.name).toMatch(/^[\x20-\x7E]+$/);
    expect(manifest.author).toEqual(expect.any(String));
    expect((manifest.author as string).trim().length).toBeGreaterThan(0);
    expect(manifest.isDesktopOnly).toBe(false);
    expect(manifest.description).toEqual(expect.any(String));
    expect((manifest.description as string).length).toBeLessThanOrEqual(250);
    expect(manifest.description).not.toMatch(/obsidian/i);
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
    expect(scripts["test:single-thread"]).toContain("--pool=threads");
    expect(scripts["test:single-thread"]).toContain("--poolOptions.threads.singleThread=true");
  });
});
