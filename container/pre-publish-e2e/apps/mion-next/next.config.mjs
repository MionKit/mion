// mion-next — a Next.js app that HOSTS the mion API, not just consumes it.
//
// smoke-next next door covers the type transform under Turbopack. This app covers the
// framework half: `app/api/[...mion]/route.ts` re-exports the App Router handlers
// @mionjs/platform-vercel builds from the routes, so one Next build produces both the
// front end and the API, from one program.
//
// Container-only, like smoke-next: `next` is ~202MB and not a workspace dependency, so a
// vitest equivalent would be permanently skipped. See
// packages/devtools/src/runtypes/next/CLAUDE.md.
import path from 'node:path';
import {withMion} from '@mionjs/devtools/next';

// Turbopack refuses to compile anything outside its workspace root, and node_modules sits
// at the e2e package root rather than in this app dir.
const E2E_ROOT = path.resolve(import.meta.dirname, '../..');

// Built TWICE by build-all.mjs: unset is the fetched lane, the only place the basePath-on-both-ends
// trap shows; set is the bundled lane, whose point is that the fetching code is GONE from the output.
// genDir stays out of dist/: it is a build INPUT, and a bundler emptying its output dir would delete it.
// Both names differ from the first build's so neither build reads the other's.
const bundleApi = process.env.MION_E2E_BUNDLE_API;

export default await withMion(
  {
    // The apps share one tsconfig base and are typechecked by the repo, not here.
    typescript: {ignoreBuildErrors: true},
    eslint: {ignoreDuringBuilds: true},
    turbopack: {root: E2E_ROOT},
    ...(bundleApi ? {distDir: `dist/next-${bundleApi}`} : {}),
  },
  {
    runTypes: {
      ...(process.env.MION_E2E_BINARY ? {binary: process.env.MION_E2E_BINARY} : {}),
      tsConfig: 'tsconfig.json',
      genDir: bundleApi ? `.rt-${bundleApi}` : '.rt',
    },
    ...(bundleApi ? {bundleApi} : {}),
    cwd: import.meta.dirname,
  }
);
