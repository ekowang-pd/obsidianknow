import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const manifest = readJson("manifest.json");
const packageJson = readJson("package.json");
const versions = readJson("versions.json");
const assets = ["main.js", "manifest.json", "styles.css"];

for (const asset of assets) {
  if (!existsSync(resolve(root, asset))) throw new Error(`Missing release asset: ${asset}`);
}

if (packageJson.version !== manifest.version) {
  throw new Error(`package.json version ${packageJson.version} does not match manifest version ${manifest.version}`);
}

if (versions[manifest.version] !== manifest.minAppVersion) {
  throw new Error(`versions.json does not map ${manifest.version} to ${manifest.minAppVersion}`);
}

console.log(`Release check passed for ${manifest.id} ${manifest.version}: ${assets.join(", ")}`);
