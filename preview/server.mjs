import esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const context = await esbuild.context({
  entryPoints: ['preview/app.ts'], bundle: true, format: 'esm', platform: 'browser',
  target: 'es2022', sourcemap: true, outdir: 'preview/public/generated',
  alias: { obsidian: './preview/obsidian.ts' }, logLevel: 'info',
});
if (process.argv.includes('--build')) {
  await context.rebuild(); await context.dispose();
} else {
  await context.watch();
  const server = await context.serve({ host: '127.0.0.1', port: 5173, servedir: 'preview/public' });
  console.log(`Deer Notes browser preview: http://127.0.0.1:${server.port}`);
}
