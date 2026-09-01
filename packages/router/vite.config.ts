import {defineConfig} from 'vite';
import {resolve} from 'path';
import dts from 'vite-plugin-dts';
import {mionVitePlugin, cjsPackageJsonPlugin, collectBuildEntries} from '@mionjs/devtools/vite';

// Build entries come from tsconfig.build.json — its include/exclude decide what ships
// (the same file drives vite-plugin-dts and, where present, the runtypes plugin).
const entry = collectBuildEntries(__dirname);

export default defineConfig({
  esbuild: {
    legalComments: 'none',
  },
  plugins: [
    cjsPackageJsonPlugin('.dist/cjs'),
    mionVitePlugin({
      runTypes: {
        tsConfig: resolve(__dirname, 'tsconfig.build.json'),
      },
    }),
    dts({
      outDir: ['.dist/cjs', '.dist/esm'],
      pathsToAliases: false,
      tsconfigPath: resolve(__dirname, 'tsconfig.build.json'),
    }),
  ],
  resolve: {conditions: ['source']},
  ssr: {resolve: {conditions: ['source']}},
  build: {
    lib: {
      entry,
      formats: ['es', 'cjs'],
    },
    outDir: '.dist',
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    rollupOptions: {
      output: [
        {
          format: 'es',
          dir: '.dist/esm',
          entryFileNames: '[name].js',
          preserveModules: true,
          preserveModulesRoot: '.',
        },
        {
          format: 'cjs',
          dir: '.dist/cjs',
          entryFileNames: '[name].cjs',
          preserveModules: true,
          preserveModulesRoot: '.',
        },
      ],
      external: ['@mionjs/core', /^[^./]/],
    },
  },
});
