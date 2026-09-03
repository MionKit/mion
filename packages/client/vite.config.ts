import {defineConfig} from 'vite';
import {resolve} from 'path';
import dts from 'vite-plugin-dts';
import {cjsPackageJsonPlugin, collectBuildEntries} from '@mionjs/devtools/vite';

// Build entries come from tsconfig.build.json — its include/exclude decide what ships
// (the same file drives vite-plugin-dts and, where present, the runtypes plugin).
const entry = collectBuildEntries(__dirname);

export default defineConfig({
  esbuild: {
    legalComments: 'none',
    minifyIdentifiers: false,
    minifyWhitespace: true,
    minifySyntax: true,
  },
  plugins: [
    cjsPackageJsonPlugin('.dist/cjs'),
    // NO mionVitePlugin here: the shipped client has no reflection call sites (its compiled
    // fns arrive serialized from the server), so the runtypes transform changes nothing in
    // .dist and only leaves a .mion genDir behind. Tests still run the plugin via
    // vitest.config.ts, which is where the spec files' typed flows need it.
    dts({
      outDir: ['.dist/cjs', '.dist/esm'],
      pathsToAliases: false,
      tsconfigPath: resolve(__dirname, 'tsconfig.build.json'),
    }),
  ],
  build: {
    lib: {
      entry,
      formats: ['es', 'cjs'],
    },
    outDir: '.dist',
    emptyOutDir: true,
    sourcemap: true,
    minify: 'esbuild',
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
      external: (id: string) => /^[^./]/.test(id),
    },
  },
});
