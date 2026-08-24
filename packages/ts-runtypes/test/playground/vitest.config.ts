import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';

// The playground engine test suite (relocated from the dissolved
// runtypes-playground package). It exercises the relocated engine at
// container/website/app/playground via the Node WASM resolver — no UI, no
// Monaco, no ts-runtypes-devtools transform (unlike the sibling marker project).
//
// `resolve.conditions: ['source']` resolves the engine's `import 'ts-runtypes'`
// to the marker package's src (its `source` export condition), so the tests run
// against in-tree code — the convergence suites specifically depend on the REAL
// types, not a built dist. Node environment: the resolver runs via a Node loader
// (no DOM). This lives under packages/ts-runtypes/test/ but is a SEPARATE project
// (the marker project excludes test/playground/**) so it skips that project's
// plugin + setup files.
// The engine lives under container/website (NOT a workspace package), so a bare
// `ts-runtypes` import can't resolve via node_modules from there. Alias it to the
// marker package's src — mirroring the old playground vite.config and what the
// Nuxt site config does (pointing at the in-container repo-context mount). An
// exact-match regex leaves every other specifier untouched.
const rtAlias = [
  {find: /^@ts-runtypes\/core\/formats$/, replacement: fileURLToPath(new URL('../../src/formats/index.ts', import.meta.url))},
  {find: /^@ts-runtypes\/core$/, replacement: fileURLToPath(new URL('../../src/index.ts', import.meta.url))},
];

export default defineConfig({
  resolve: {conditions: ['source'], alias: rtAlias},
  ssr: {resolve: {conditions: ['source']}},
  test: {
    name: 'playground',
    include: ['*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
