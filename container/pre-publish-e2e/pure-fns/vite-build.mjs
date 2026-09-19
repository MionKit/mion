// One Vite build through the published Vite adapter, in a process of its own so run.mjs
// captures its whole output and a failed build cannot take the driver down with it.
// `node vite-build.mjs lib <dir>` bundles src/index.ts into dist/ (a library);
// `node vite-build.mjs app <dir>` bundles src/main.ts into dist-vite/ for node.
import path from 'node:path';
import {build} from 'vite';
import runtypes from '@mionjs/devtools/runtypes/vite';

const [mode, dir] = process.argv.slice(2);
if (!['lib', 'app'].includes(mode) || !dir) {
  console.error('usage: node vite-build.mjs lib|app <dir>');
  process.exit(2);
}
const root = path.resolve(dir);
const lib = mode === 'lib';
// Every installed package stays external: the library's tarball, not this bundle, is what a consumer runs.
const EXTERNAL = /^@(mionjs|acme)\//;

await build({
  root,
  configFile: false,
  logLevel: 'warn',
  plugins: [
    runtypes({
      ...(process.env.MION_E2E_BINARY ? {binary: process.env.MION_E2E_BINARY} : {}),
      cwd: root,
      tsconfig: 'tsconfig.json',
      genDir: path.join(root, '.mion'),
    }),
  ],
  build: {
    outDir: path.join(root, lib ? 'dist' : 'dist-vite'),
    emptyOutDir: true,
    ssr: !lib,
    lib: {entry: path.join(root, 'src', lib ? 'index.ts' : 'main.ts'), formats: ['es'], fileName: lib ? 'index' : 'main'},
    rollupOptions: {external: EXTERNAL},
    minify: false,
  },
  ssr: {external: ['@mionjs/run-types', '@acme/text', '@acme/dates', '@acme/plain']},
});
