import {defineConfig} from 'vite';
import {resolve} from 'path';
import dts from 'vite-plugin-dts';
import {collectBuildEntries} from '@mionjs/devtools/vite';

// Build entries come from tsconfig.build.json — its include/exclude decide what ships
// (the same file drives vite-plugin-dts and, where present, the runtypes plugin).
const entry = collectBuildEntries(__dirname);

export default defineConfig({
  esbuild: {
    legalComments: 'none',
  },
  plugins: [
    // NO mionVitePlugin here: the recorder core never calls the marker API
    // itself — injection happens at the consumer's own call sites, under the
    // consumer's build.
    dts({
      outDir: '.dist/esm',
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
      external: [/^[^./]/],
    },
  },
});
