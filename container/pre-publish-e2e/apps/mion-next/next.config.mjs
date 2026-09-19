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

// Built TWICE by build-all.mjs. Unset, this is the fetched lane: the client asks the server for
// each route's metadata, which is the only place the basePath-on-both-ends trap can be caught.
// Set, it is the bundled lane, whose whole point is that the code doing that asking is GONE from
// the output; Turbopack reaches it through a resolveAlias rather than a plugin, so a real build is
// the only proof. Build OUTPUT goes under dist/ like every other app's; the genDir does NOT, because
// it is an INPUT the transform rewrites call sites to import from, and a bundler that empties its
// output dir would delete it. Both are kept apart from the first build's so neither reads the other's.
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
