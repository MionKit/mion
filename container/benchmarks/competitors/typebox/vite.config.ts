import {defineConfig} from 'vite';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// Plain SSR build — no plugin. TypeBox is a runtime library, so main.ts bundles to
// dist/run.mjs and runs under Node directly.
export default defineConfig({
  build: {
    ssr: path.join(here, 'main.ts'),
    outDir: 'dist',
    target: 'node22',
    minify: false,
    emptyOutDir: true,
    rollupOptions: {
      output: {entryFileNames: 'run.mjs', format: 'esm'},
    },
  },
});
