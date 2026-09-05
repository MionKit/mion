import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

export default defineConfig({
  plugins: [
    mionVitePlugin({
      runTypes: {
        tsConfig: resolve(__dirname, 'tsconfig.build.json'),
      },
      // consume the client build's harvested inputFrom mappers and batches (the plugin generates
      // .mion/server-mappers.generated.js and imports it from the module calling initMionRouter)
      batches: {consume: resolve(__dirname, '../client/.mion/batches.json')},
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
