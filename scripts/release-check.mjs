import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const manifest = readJson("manifest.json");
const packageJson = readJson("package.json");
const versions = readJson("versions.json");
const assets = ["main.js", "manifest.json", "styles.css"];

for (const asset of assets) {
  if (!existsSync(resolve(root, asset))) throw new Error(`Missing release asset: ${asset}`);
  if (!statSync(resolve(root, asset)).size) throw new Error(`Empty release asset: ${asset}`);
}

if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error("Manifest version must be numeric semver");
if (!/^\d+\.\d+\.\d+$/.test(manifest.minAppVersion)) throw new Error("Invalid minimum app version");
if (manifest.id !== "deer-notes") throw new Error("Do not change the published plugin id");
if (!manifest.description || manifest.description.length > 250 || !manifest.description.endsWith(".") || /obsidian/i.test(manifest.description)) {
  throw new Error("Description must be at most 250 characters, end with a period, and omit Obsidian");
}
if (!existsSync(resolve(root, "LICENSE"))) throw new Error("Missing LICENSE");
const lock = readJson("package-lock.json");
if (lock.version !== manifest.version || lock.packages?.[""]?.version !== manifest.version) throw new Error("Lockfile version mismatch");

if (packageJson.version !== manifest.version) {
  throw new Error(`package.json version ${packageJson.version} does not match manifest version ${manifest.version}`);
}

if (versions[manifest.version] !== manifest.minAppVersion) {
  throw new Error(`versions.json does not map ${manifest.version} to ${manifest.minAppVersion}`);
}

console.log(`Release check passed for ${manifest.id} ${manifest.version}: ${assets.join(", ")}`);
