import {defineConfig} from 'vitest/config';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import runtypesPlugin from '@mionjs/devtools/runtypes/vite';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const PACKAGE_ROOT = resolve(HERE, '../..');
const REPO_ROOT = resolve(HERE, '../../../..');

// Isolated project for the mock-format-registry regression (see the test
// file's header). It runs OUTSIDE the main marker project so no sibling test
// file's value import of @mionjs/run-types/formats can populate the registry for
// this process — the import-graph isolation IS the repro. The plugin gets a
// minimal tsconfig whose program is just this directory, so the second
// resolver instance boots against a tiny program instead of re-compiling the
// whole test tree.
export default defineConfig({
  resolve: {conditions: ['source']},
  ssr: {resolve: {conditions: ['source']}},
  plugins: [
    runtypesPlugin({
      binary: resolve(REPO_ROOT, 'mion-bin/mion'),
      cwd: PACKAGE_ROOT,
      tsconfig: 'test/mock-format-isolation/tsconfig.json',
      // Own genDir, NOT the package-root default (`<cwd>/.mion`): that dir is
      // the main marker project's genDir, which runs concurrently with a different
      // emitMode ('both' vs this project's default 'code') — sharing it is
      // last-writer-wins. Keeping it here also lets the shared teardown below
      // (which cleans `<project root>/.mion`) remove it after the run.
      genDir: resolve(HERE, '.mion'),
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
    // teardown-only: removes this project's .mion genDir after the run
    globalSetup: ['../../../../scripts/lib/vitest-clean-gendir.ts'],
    testTimeout: 30000,
  },
});
