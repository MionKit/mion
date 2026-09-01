// Runs INSIDE bun (build-all.mjs runs under node, where Bun.build does not
// exist, so it spawns this). Mirrors the esbuild app's config: bundle the shared
// minimal subset, keep @mionjs/run-types external, emit dist/entry.js.
import runtypes from '@mionjs/devtools/runtypes/bun';

const appDir = import.meta.dir;
const result = await Bun.build({
  entrypoints: [`${appDir}/src/entry.ts`],
  outdir: `${appDir}/dist`,
  target: 'bun',
  format: 'esm',
  external: ['@mionjs/run-types', '@mionjs/run-types/*'],
  plugins: [
    runtypes({
      ...(process.env.MION_E2E_BINARY ? {binary: process.env.MION_E2E_BINARY} : {}),
      cwd: appDir,
      tsconfig: 'tsconfig.json',
      genDir: `${appDir}/.rt`,
    }) as never,
  ],
});
if (!result.success) {
  console.error(result.logs.join('\n'));
  process.exit(1);
}
