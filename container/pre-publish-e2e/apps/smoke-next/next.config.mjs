// smoke-next — the Next.js / Turbopack adapter.
//
// Turbopack is Next 16's default bundler and exposes no plugin API, so this is
// the only app in the matrix NOT driven by a bundler plugin: RunTypes gets in
// through `withRunTypes`, which starts one broker here in the config process and
// registers a loader in `turbopack.rules` for the worker processes Turbopack
// runs loaders in.
//
// The page prerenders the shared selfCheck() at build time, so a passing build
// proves the rewrite survived Turbopack AND the transformed code actually ran.
//
// This app is the ONLY `next build` coverage in the repo: `next` is ~202MB and is not a
// workspace dependency, so an equivalent vitest test would be permanently skipped. The
// unit-testable half of the adapter lives in
// packages/devtools/test/next-broker.test.ts; the rules are in
// packages/devtools/src/runtypes/next/CLAUDE.md.
import path from 'node:path';
import {withRunTypes} from '@mionjs/devtools/runtypes/next';

// Turbopack refuses to compile anything outside its workspace root, so the root
// is the e2e package (which holds node_modules) rather than this app dir — the
// app imports apps/shared and resolves @mionjs/* from a level above. Any
// monorepo hits this; pointing root at the app dir fails on both counts.
const E2E_ROOT = path.resolve(import.meta.dirname, '../..');

export default await withRunTypes(
  {
    // The apps share one tsconfig base and are typechecked by the repo, not here.
    typescript: {ignoreBuildErrors: true},
    eslint: {ignoreDuringBuilds: true},
    turbopack: {root: E2E_ROOT},
  },
  {
    ...(process.env.MION_E2E_BINARY ? {binary: process.env.MION_E2E_BINARY} : {}),
    cwd: import.meta.dirname,
    tsconfig: 'tsconfig.json',
    genDir: '.rt',
  }
);
