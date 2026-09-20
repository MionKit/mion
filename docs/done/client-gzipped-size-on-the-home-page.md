---
type: feature
spec: guidelines
status: done
created: 2026-09-19
---

# Show the client's gzipped size on the mion RPC home page

Shipped together with the mock-generation todo, in one PR. Planning this one surfaced that
the honest number was itself the problem: a client that only calls routes shipped mock
generation and the whole pattern table. Publishing a truthful number and making it small
were the same job, so both landed at once.

## What shipped

**A generator, `scripts/website/gen-client-size.mjs`**, copying the shape of
`gen-test-counts.mjs`: committed output, no timestamp, byte-identical regeneration, and a
fallback for a host that cannot measure.

It bundles `packages/client/.dist/esm/index.js` with esbuild, minified, with **nothing
external**, so `@mionjs/core` and what it pulls from `@mionjs/run-types` are inlined. The
client's own dist externalises every `@mionjs/*` (`packages/client/vite.config.ts:55`), so
its size alone describes nothing a consumer downloads. Each emitted chunk is gzipped
separately and summed, which is what a server does.

One gotcha is load-bearing and is recorded in the generator's own comment: esbuild honours
tsconfig `paths`, and the root `tsconfig.json:28` maps `@mionjs/*` onto `packages/*`.
Without `tsconfigRaw: '{}'` the generator silently measures the **source tree** instead of
the published dist, which is a different number because run-types' dist is hollowed at build
time.

**Output** is `container/website/app/data/client-size.json`, committed, imported at build
time by `container/website/app/components/content/ClientSize.vue`.

**Command:** `pnpm miondevx website client-size [--check]`, a new row in
`scripts/lib/devx-registry.mjs` beside `website test-counts`. `scripts/website/build.mjs`
runs it in stage 2, right after `ensureMionDists()`.

**The page** got a line in the existing "Fully Typed Client" card rather than a tile, with
the number rendered by the component as an inline span so the words that qualify it stay in
the content tree:

> The package is :client-size minified and gzipped. Your app ships less. Your bundler drops
> what you do not import.

## The freshness gate

`--check` runs in `.github/workflows/release-gate.yml`, right after `Build FE dists`, for
**both** the client size and the existing test counts. Not a per-PR lane: every test-adding
PR moves the count, so a gate there would fail honest PRs for a number the build regenerates
anyway. A release is where a stale number would actually reach a reader.

A second bug turned up in the existing generator and was fixed with it: `--check` fell back
to the committed value when it could not count, then compared that value against itself and
reported green. A `--check` on a host with no Go toolchain passed on a stale file. Both
generators now fail instead.

`docs/WEBSITE-DOCGEN.md` said the opposite ("deliberately not wired into CI") and was
rewritten, and gained a client-size section mirroring the test-counts one.

## Also fixed, because it is what the published client contains

`packages/client/tsconfig.build.json` excluded `*.spec.ts` but not `test/`, so
`.dist/esm/test/lib/laneConfig.js` and `laneServer.js` shipped inside the published browser
package, importing `vitest/config`, `vitest/node` and `node:child_process`. Adding `"test"`
to the exclude list drops them. The lane vitest configs import those files from source, not
from `.dist`, so the lanes are unaffected.

## The number

30.6 kB gzipped before the mock and pattern work, 24.1 kB after.

## Pinned by

`packages/devtools/test/repo-contracts.test.ts`: the committed file exists and is sane, the
component reads it rather than a literal, the page names the component, the page carries the
qualifying sentence, and no hand-typed kB figure sits beside it.
