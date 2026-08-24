# Move mion's publish e2e into the verdaccio container (merge master plan, step 5)

**Status:** done (2026-08-24)
**Created:** 2026-08-24

Step 5 of [../todos/merge-ts-runtypes-into-mion-master-plan.md](../todos/merge-ts-runtypes-into-mion-master-plan.md).
There is now ONE pre-publish gate: `pnpm rtx release e2e` packs both package families, serves
both from one throwaway verdaccio, and runs the runtypes bundler matrix and the mion consumer
lanes against it. The local-tarball `test-publish/` flow is gone.

## Why it mattered more after steps 2–4

`@mionjs/*` now depends on `@ts-runtypes/*` through `workspace:*`, so `pnpm pack` writes an
exact cross-family version into every published manifest:

```
mionjs-core-0.8.10.tgz        -> {"@ts-runtypes/core":"0.12.2"}
mionjs-devtools-0.8.10.tgz    -> {"@ts-runtypes/bin":"0.12.2","@ts-runtypes/devtools":"0.12.2"}
mionjs-platform-bun-0.8.10.tgz-> {"@mionjs/core":"0.8.10", ..., "@ts-runtypes/bin":"0.12.2"}
```

Nothing verified that. The old `test-publish/` installed `file:` tarballs behind pnpm overrides,
so it never resolved a registry at all, and the sibling `@ts-runtypes/*` came from whatever npm
happened to serve. One registry serving both scopes is what makes the pin real.

## What shipped

- **Registry serves both scopes locally.** `container/pre-publish-e2e/registry/verdaccio.yaml`
  and its host-npx twin `.github/verdaccio.yaml` gained a `'@mionjs/*'` block with the same
  posture as `'@ts-runtypes/*'`: no `proxy`, so a version already live on npm can neither 409
  the publish nor satisfy an install.
- **`e2e-serve.sh` publishes the mion tarballs** after the runtypes ones, in real graph order
  (`core` + `devtools`, then `router`/`client`/`drizzle`, then `platform-*`), and a new
  `require_found` helper aborts with a legible message when a family never reached `/tarballs`.
- **`pack.mjs` derives the publishable set** instead of hand-listing it: every non-private
  `packages/*/package.json` minus whatever `dist-binaries/publish-order.json` already stages.
  21 tarballs. A new public package joins the gate by existing.
- **The mion consumer lane** — `container/pre-publish-e2e/mion-consumer/`, its own install root
  beside `apps/` and `host-smoke/`. It carries the four `test-publish` specs: the JSON flow
  (including the `serverMapFrom` mapper executing server-side mid-flow), the binary round-trips,
  the packaged-tarball inspection over all eleven `@mionjs/*`, and the production build's
  inlined types + harvested mappers. `dom-storage` is gone: `packages/client/src/lib/storage.ts`
  already falls back to in-memory storage, so the fixture defines its own `MemoryStorage` and the
  real localStorage branch runs with no dependency added.
- **A bun consumer lane** — `container/pre-publish-e2e/mion-bun/`. `@mionjs/platform-bun` is
  packed and published on every release but nothing exercised it end to end: its own `bun:test`
  suite runs against workspace source, and `packaged-sources` only reads the tarball's file list.
  The lane installs the published packages, registers `@ts-runtypes/devtools/bun`, boots a real
  `Bun.serve` mion server and round-trips it over plain `fetch` and through `@mionjs/client`
  (JSON, a typed `RpcError`, and the binary serializer).
- **A mion lint transport check** in the consumer lane. CLAUDE.md records that
  `@mionjs/devtools` is consumed COMPILED — node never sees its `source` export condition — and
  nothing proved that `build/` output loads from a tarball. `lint/caveat.routes.ts` plus
  `lint/eslint.config.mjs` now assert `strong-typed-routes` reports both `missingReturnType` and
  `missingParamTypes` out of the installed package.
- **A second baked toolchain root.** `_deps-mion/` installs at `/e2e-mion` in the image. It
  cannot share `/e2e`: that root pins `vite` to `rolldown-vite@7.3.1` and TypeScript 5.9.3 for
  the bundler matrix, while a mion consumer runs plain vite 8 + TypeScript 6 (what the workspace
  itself pins), and one hoisted `node_modules` cannot be both. `image.mjs` hashes the new dir, so
  a bump there invalidates the image like any other baked manifest. The image grew 2.78 → 2.93 GB.
- **`e2e.mjs` drives both lanes** through the same registry container, after the matrix. New
  `--no-mion` flag; the receipt's `covered` gained a `mion` half.
- **Deleted:** `test-publish/` (workspace, lockfile, specs), `scripts/pack-packages.sh`,
  `scripts/pack-and-install.sh`, `scripts/pre-publish-test.sh`, the `pre-publish-test` root
  script, and the `test-publish/**` ignore entries in `eslint.config.js`, `.oxlintrc.json` and
  `.oxfmtrc.json`.

## Where the original spec was wrong

Written from repo analysis before steps 2–4 landed, so several assumptions had gone stale:

1. **Two version trains, not one.** `@mionjs/*` is on 0.8.10 while `version.json` (and
   `@ts-runtypes/*`) is on 0.12.2. `e2e.mjs` reads one version from `version.json`, so the mion
   lane needed its own: `readMionVersion()` reads it from the packages themselves and refuses a
   split, which keeps working before AND after step 6 unifies them with no edit.
2. **Packing mion into `tarballs/` silently widens the release.** `publish-tarballs.mjs`
   publishes every `.tgz` it finds and `publish.yml` runs it, so without a guard the next release
   would stage `@mionjs/*` 0.8.10 to real npm — and `publish.yml`'s preflight only checks
   `@ts-runtypes/core`, so a version already live would 409 mid-sequence. `publish-tarballs.mjs`
   and `manual-publish.mjs` now filter to `ts-runtypes-*`, with the comment naming step 6 as the
   place the filter comes out.
3. **`build-all.mjs` was the wrong host.** It builds apps to `dist/` and asserts with `node:test`;
   the mion flow is vitest + a live server + a `vite build` + a build-output assertion, on a
   toolchain that clashes with the matrix's. Hence the separate lane and deps root above, rather
   than the spec's `apps/mion-server`.
4. **The publish-order sketch was close but not exact.** `@mionjs/devtools` does not depend on
   `@mionjs/core` at all (only on `@ts-runtypes/{bin,devtools}`), and `client`/`drizzle` depend
   on `core` but not `router`.
5. **No workflow edit was needed.** `release-gate.yml` already calls `pnpm rtx release e2e`, so
   the mion lanes ride in for free — the master plan lists that under step 6, but it is done.

## Observation, not fixed here

`packages/platform-bun/loader/runtypes-loader.ts` is not shipped: `loader/` is absent from the
package's `files`, from `exports`, and from its vite build entries. So the published
`@mionjs/platform-bun` gives a bun consumer no loader, and a consumer must wire
`@ts-runtypes/devtools/bun` directly — which is what the new bun lane does, pinning the contract
that actually reaches consumers. The package still carries `@ts-runtypes/devtools` and
`@ts-runtypes/bin` as `dependencies` with nothing shipped that imports them. Left alone
deliberately: the website's bun page never documents a mion loader either, so this reads as
undocumented-by-design rather than a regression, and trimming published dependencies is a
consumer-visible change that belongs with a release, not with a test-harness move.

## Done criteria (met)

- `pnpm rtx release e2e` (container backend) publishes both families to verdaccio and the full
  matrix — runtypes apps AND both mion consumer lanes — passes locally.
- The `host-npx` backend still works; its receipt now records that it ran neither the matrix nor
  the mion lanes rather than implying it did. The `npm` (post-publish) backend skips the mion
  lanes with a printed reason: the live `@mionjs/*` predate the `workspace:*` rewiring, so they
  would verify the previous release. Step 6 turns them on.
- `test-publish/` and the three shell scripts are gone; nothing references them.
