// One client build per process, so run.mjs captures its whole output, diagnostics included.
import path from 'node:path';
import {build} from 'vite';
import {mionVitePlugin} from '@mionjs/devtools/vite';

const [dir] = process.argv.slice(2);
if (!dir) {
  console.error('usage: node vite-build.mjs <client dir>');
  process.exit(2);
}
const root = path.resolve(dir);

await build({
  root,
  configFile: false,
  logLevel: 'warn',
  plugins: [mionVitePlugin({tsConfig: path.join(root, 'tsconfig.json')})],
  build: {
    outDir: path.join(root, 'dist-vite'),
    emptyOutDir: true,
    ssr: true,
    lib: {entry: path.join(root, 'src', 'main.ts'), formats: ['es'], fileName: 'main'},
    rollupOptions: {external: /^@mionjs\//},
    minify: false,
  },
});
