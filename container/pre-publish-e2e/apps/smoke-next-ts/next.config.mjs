// smoke-next with the tsconfig asking for emitMode ts: Turbopack builds the typed .ts cache modules.
// Rules: packages/devtools/src/runtypes/next/AGENTS.md.
import path from 'node:path';
import {withRunTypes} from '@mionjs/devtools/runtypes/next';

// Turbopack compiles nothing outside its root: the app imports apps/shared and resolves @mionjs/* from the e2e package.
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
