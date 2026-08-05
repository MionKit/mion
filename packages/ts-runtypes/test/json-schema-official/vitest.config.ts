import {defineConfig} from 'vitest/config';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import runtypesPlugin from '@ts-runtypes/devtools/vite';

// The official JSON-Schema-Test-Suite conformance lane — its own project (the
// marker project excludes test/json-schema-official/**) so the fast unit lanes
// never pay for the ~hundreds of heavy FromJsonSchema call sites in the
// GENERATED modules here (produced by scripts/core/gen-json-schema-suite.mjs
// via `pnpm run check:builds`; gitignored). Same plugin shape as the marker
// project, but over tsconfig.suite-official.json (src + this dir only).
//
// failOnError: false is load-bearing: suite documents the resolver marks with
// Error-severity diagnostics must not refuse the lane's boot — their entries
// become throwing validators the harness records as build-rejected results.

const HERE = fileURLToPath(new URL('.', import.meta.url));
const PACKAGE_ROOT = resolve(HERE, '../..');
const REPO_ROOT = resolve(HERE, '../../../..');

export default defineConfig({
  resolve: {conditions: ['source']},
  ssr: {resolve: {conditions: ['source']}},
  plugins: [
    runtypesPlugin({
      binary: resolve(REPO_ROOT, 'bin/ts-runtypes'),
      cwd: PACKAGE_ROOT,
      tsconfig: 'tsconfig.suite-official.json',
      failOnError: false,
    }),
  ],
  test: {
    name: 'json-schema-official',
    environment: 'node',
    include: ['*.test.ts'],
    // The driver runs every generated group in one file; give it and the
    // project boot (the resolver walks all generated call sites) headroom.
    testTimeout: 60000,
    hookTimeout: 120000,
  },
});
