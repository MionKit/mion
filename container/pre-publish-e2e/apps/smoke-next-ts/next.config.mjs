// smoke-next with the tsconfig asking for emitMode ts: Turbopack builds the typed .ts cache modules.
// Rules: packages/devtools/src/runtypes/next/AGENTS.md.
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
    // No genDir on purpose: tsconfig.json sets it, and build-outputs.test.mjs checks Next honours it.
    tsconfig: 'tsconfig.json',
  }
);
