import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

export default defineConfig({
  plugins: [
    mionVitePlugin({
      runTypes: {
        tsConfig: resolve(__dirname, 'tsconfig.build.json'),
      },
      // No `client` pointer: @mionjs/client's own program pulls this entry in through the `source`
      // export condition, so THAT build generates the batch table and injects it. One program.
    }),
  ],
  resolve: {conditions: ['source']},
  ssr: {resolve: {conditions: ['source']}},
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'index.ts'),
        'src/test-server-json': resolve(__dirname, 'src/test-server.ts'),
      },
      formats: ['es'],
    },
    outDir: '.dist/esm',
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    rollupOptions: {
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        preserveModules: true,
        preserveModulesRoot: '.',
      },
      external: ['@mionjs/core', '@mionjs/router', '@mionjs/platform-node', /^[^./]/],
    },
  },
});
