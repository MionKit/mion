import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

export default defineConfig({
  plugins: [
    mionVitePlugin({
      runTypes: {
        tsConfig: resolve(__dirname, 'tsconfig.build.json'),
      },
      // Nothing to configure for batches: the client's build writes `.mion/rpc/batches.generated.js`
      // into this root and the plugin imports it from the module calling createMionRouter.
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
