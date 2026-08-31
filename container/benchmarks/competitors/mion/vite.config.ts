import {defineConfig} from 'vite';
import runtypes from '@ts-runtypes/devtools/vite';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const binary = process.env.RT_BINARY ?? path.join(here, 'bin', 'ts-runtypes');

// The runtypes plugin spawns the Go binary, rewrites each literal
// `createValidateFn<T>()` call site in cases.ts, and emits the per-entry virtual
// modules — so unlike the other competitors this build IS the plugin.
export default defineConfig({
  plugins: [runtypes({binary, cwd: here, tsconfig: 'tsconfig.json'})],
  build: {
    ssr: path.join(here, 'main.ts'),
    outDir: 'dist',
    target: 'node22',
    minify: false,
    emptyOutDir: true,
    rollupOptions: {output: {entryFileNames: 'run.mjs', format: 'esm'}},
  },
});
