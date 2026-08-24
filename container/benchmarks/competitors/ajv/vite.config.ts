import {defineConfig} from 'vite';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    ssr: path.join(here, 'main.ts'),
    outDir: 'dist',
    target: 'node22',
    minify: false,
    emptyOutDir: true,
    rollupOptions: {output: {entryFileNames: 'run.mjs', format: 'esm'}},
  },
});
