import {defineConfig} from 'vitest/config';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import runtypesPlugin from '@ts-runtypes/devtools/vite';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const PACKAGE_ROOT = resolve(HERE, '../..');
const REPO_ROOT = resolve(HERE, '../../../..');

// Isolated project for the mock-format-registry regression (see the test
// file's header). It runs OUTSIDE the main marker project so no sibling test
// file's value import of ts-runtypes/formats can populate the registry for
// this process — the import-graph isolation IS the repro. The plugin gets a
// minimal tsconfig whose program is just this directory, so the second
// resolver instance boots against a tiny program instead of re-compiling the
// whole test tree.
export default defineConfig({
  resolve: {conditions: ['source']},
  ssr: {resolve: {conditions: ['source']}},
  plugins: [
    runtypesPlugin({
      binary: resolve(REPO_ROOT, 'bin/ts-runtypes'),
      cwd: PACKAGE_ROOT,
      tsconfig: 'test/mock-format-isolation/tsconfig.json',
      // The program pulls in the marker package's src, whose own generic
      // helper call sites carry CTA-diagnostic markers (same reason the main
      // marker project opts out of the strict default).
      failOnError: false,
    }),
  ],
  test: {
    name: 'mock-format-isolation',
    globals: true,
    environment: 'node',
    include: ['*.test.ts'],
    testTimeout: 30000,
  },
});
