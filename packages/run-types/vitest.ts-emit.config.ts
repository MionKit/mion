import {configDefaults, defineConfig} from 'vitest/config';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import runtypesPlugin from '@mionjs/devtools/runtypes/vite';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const PACKAGE_ROOT = resolve(HERE);
const REPO_ROOT = resolve(HERE, '../..');

// The feature suite again, with every cache module written as typed `.ts` (emitMode 'ts') and compiled by Vite, so
// a typed factory that diverges from what the `runtypes` project runs fails the same assertion. Its own genDir:
// the two projects run side by side and each prunes the other's modules.
export default defineConfig({
  resolve: {conditions: ['source']},
  ssr: {resolve: {conditions: ['source']}},
  plugins: [
    runtypesPlugin({
      binary: resolve(REPO_ROOT, 'mion-bin/mion'),
      cwd: PACKAGE_ROOT,
      tsconfig: 'tsconfig.json',
      genDir: '.mion-ts',
      emitMode: 'ts',
    }),
  ],
  test: {
    name: 'runtypes-ts',
    globals: true,
    environment: 'node',
    include: ['test/features/**/*.test.ts'],
    exclude: [...configDefaults.exclude],
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: ['./test/support/setup.ts'],
    globalSetup: ['../../scripts/lib/vitest-clean-gendir.ts'],
  },
});
