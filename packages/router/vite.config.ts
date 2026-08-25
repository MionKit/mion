import {defineConfig} from 'vite';
import {resolve} from 'path';
import dts from 'vite-plugin-dts';
import {mionVitePlugin, cjsPackageJsonPlugin, collectBuildEntries, BUILD_EXCLUDE_GLOBS} from '@mionjs/devtools/vite-plugin';

// Build entry points: index.ts + all shippable src files (shared rule in @mionjs/devtools)
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
      include: ['index.ts', 'src/**/*.ts'],
      exclude: [...BUILD_EXCLUDE_GLOBS],
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
