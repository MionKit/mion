import {defineConfig} from 'vite';
import {resolve} from 'path';
import {readdirSync, statSync} from 'fs';
import dts from 'vite-plugin-dts';

// Get all TypeScript files from a directory (excluding spec/test files)
function getSourceFiles(dir: string, base = ''): Record<string, string> {
  const entries: Record<string, string> = {};
  const files = readdirSync(dir);

  for (const file of files) {
    const fullPath = resolve(dir, file);
    const relativePath = base ? `${base}/${file}` : file;

    if (statSync(fullPath).isDirectory()) {
      Object.assign(entries, getSourceFiles(fullPath, relativePath));
    } else if (file.endsWith('.ts') && !file.endsWith('.spec.ts') && !file.endsWith('.test.ts')) {
      const name = relativePath.replace(/\.ts$/, '');
      entries[name] = fullPath;
    }
  }

  return entries;
}

// Build entry points from src/vite-plugin directory
const srcEntries = getSourceFiles(resolve(__dirname, 'src/vite-plugin'));
const entry: Record<string, string> = {
  index: resolve(__dirname, 'src/vite-plugin/index.ts'),
  ...Object.fromEntries(Object.entries(srcEntries).map(([name, path]) => [`src/vite-plugin/${name}`, path])),
};

export default defineConfig({
  esbuild: {
    legalComments: 'none',
  },
  plugins: [
    dts({
      outDir: ['build/vite-plugin/esm'],
      include: ['src/vite-plugin/**/*.ts', 'src/pureFns/**/*.ts'],
      exclude: ['**/*.spec.ts', '**/*.test.ts'],
      pathsToAliases: false,
    }),
  ],
  build: {
    lib: {
      entry,
      formats: ['es'],
    },
    outDir: 'build/vite-plugin',
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    ssr: true, // Build for Node.js environment
    rollupOptions: {
      // ESM only: the plugin's own dependency @ts-runtypes/devtools exports './vite'
      // with no `require` condition, so a CJS build of this package cannot load at all.
      output: [
        {
          format: 'es',
          dir: 'build/vite-plugin/esm',
          entryFileNames: '[name].js',
          preserveModules: true,
          preserveModulesRoot: '.',
        },
      ],
      // `@ts-runtypes/*` are declared runtime dependencies, so they must stay external.
      // They are named explicitly because `ssr: true` only auto-externalizes real
      // node_modules packages: once they became workspace links vite treated them as
      // local source and inlined a second copy of the resolver client into this build.
      external: ['@rollup/pluginutils', 'typescript', 'vite', 'fs', 'path', /^node:/, /^@ts-runtypes\//, /^@mionjs\/run-types/],
    },
  },
});
