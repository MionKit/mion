import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

// The production server bundle a consumer would deploy: the batch module and the mapper
// modules it imports are INLINED at build time, so nothing is read from disk at boot.
// src/tests/build-output.spec.ts asserts over what this emits.
export default defineConfig({
  plugins: [
    mionVitePlugin({
      runTypes: {
        tsConfig: resolve(__dirname, 'tsconfig.json'),
      },
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    lib: {
      entry: resolve(__dirname, 'src/server/server.ts'),
      formats: ['es'],
    },
    rollupOptions: {
      output: {
        format: 'es',
        entryFileNames: '[name].js',
      },
      external: [/^@mionjs\//, /^[^./]/],
    },
  },
});
