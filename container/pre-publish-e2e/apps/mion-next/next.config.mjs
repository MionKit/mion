// App Router handlers produce the API and front end in one build; smoke-next covers the type transform.
// Next is not a workspace dependency, so Vitest cannot run this coverage; see packages/devtools/src/runtypes/next/AGENTS.md.
import path from 'node:path';
import {withMion} from '@mionjs/devtools/next';

// Turbopack refuses to compile anything outside its workspace root, and node_modules sits
// at the e2e package root rather than in this app dir.
const E2E_ROOT = path.resolve(import.meta.dirname, '../..');

// Built TWICE by build-all.mjs: unset is the fetched lane, the only one showing the basePath trap.
// 'bundle' proves the fetching code stays out of what the page loads.
// genDir stays out of dist/: it is a build INPUT, and a bundler emptying its output dir would delete it.
// The bundled build's names differ from the fetched build's, so neither build reads the other's.
const clientRoutes = process.env.MION_E2E_CLIENT_ROUTES;

export default await withMion(
  {
    // The apps share one tsconfig base and are typechecked by the repo, not here.
    typescript: {ignoreBuildErrors: true},
    eslint: {ignoreDuringBuilds: true},
    turbopack: {root: E2E_ROOT},
    ...(clientRoutes ? {distDir: `dist/next-${clientRoutes}`} : {}),
  },
  {
    tsConfig: 'tsconfig.json',
    client: {routes: clientRoutes === 'bundle' ? 'bundle' : 'fetch'},
    runTypes: {
      ...(process.env.MION_E2E_BINARY ? {binary: process.env.MION_E2E_BINARY} : {}),
      genDir: clientRoutes ? `.rt-${clientRoutes}` : '.rt',
    },
    cwd: import.meta.dirname,
  }
);
