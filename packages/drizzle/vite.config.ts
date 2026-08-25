import {defineConfig} from 'vite';
import {resolve} from 'path';
import dts from 'vite-plugin-dts';
import {collectBuildEntries, BUILD_EXCLUDE_GLOBS} from '@mionjs/devtools/vite-plugin';

// Build entry points: index.ts + all shippable src files (shared rule in @mionjs/devtools)
const entry = collectBuildEntries(__dirname);

export default defineConfig({
  esbuild: {
    legalComments: 'none',
  },
  plugins: [
    // NO mionVitePlugin here: drizzle only DEFINES the marker parameter
    // (`id?: InjectRunTypeId<T>` on toDrizzleXTable) — the injection happens at the
    // consumer's own call sites, under the consumer's build. With no call sites in the
    // shipped code the transform changes nothing and only leaves a __runtypes genDir
    // behind. Tests still run the plugin via vitest.config.ts, where the spec/stub
    // call sites need it.
    dts({
      outDir: '.dist/esm',
      include: ['index.ts', 'src/**/*.ts'],
      exclude: [...BUILD_EXCLUDE_GLOBS],
      pathsToAliases: false,
      tsconfigPath: resolve(__dirname, 'tsconfig.build.json'),
    }),
  ],
  build: {
    lib: {
      entry,
      formats: ['es'],
    },
    outDir: '.dist/esm',
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    rollupOptions: {
      output: {
        format: 'es',
        dir: '.dist/esm',
        entryFileNames: '[name].js',
        preserveModules: true,
        preserveModulesRoot: '.',
      },
      external: ['@mionjs/core', /^[^./]/],
    },
  },
});
