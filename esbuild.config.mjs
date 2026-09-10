import esbuild from "esbuild";

const production = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian"],
  format: "cjs",
  logLevel: "warning",
  outfile: "main.js",
  platform: "node",
  sourcemap: production ? false : "inline",
  target: "es2018"
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
