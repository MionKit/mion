# Unify the workspace and toolchain after the join (merge master plan, step 3)

**Status:** open
**Created:** 2026-08-24

Step 3 of [merge-ts-runtypes-into-mion-master-plan.md](merge-ts-runtypes-into-mion-master-plan.md).
Requires [join-ts-runtypes-history.md](join-ts-runtypes-history.md) landed. Goal: one toolchain —
the temporary `:mion` seams from the join disappear, mion consumes the runtypes packages from the
workspace instead of npm, and lerna/nx are gone.

## Tasks

- **Switch `@mionjs/*` → `workspace:*`** for every `@ts-runtypes/{core,devtools,bin}` dependency
  (core, router, client, drizzle, devtools, platform-bun, examples). Drop `@ts-runtypes/*` from
  `minimumReleaseAgeExclude`. Regenerate the lockfile. This is the moment the 0.12.2 npm pin
  disappears; `@mionjs/devtools`' wrapper now builds against sibling source/dists — decide whether
  its committed `build/` output stays committed (eslint consumers need compiled JS) or becomes a
  build artifact like the runtypes dists, and document the choice.
- **Delete lerna + nx:** `lerna.json`, `nx.json`, `packages/client/project.json`, the lerna-driven
  `:mion` scripts. Re-wire `lint` / `build` / `clean` / `fresh-start` so the canonical
  ts-run-types scripts (and `rtx`) cover the mion packages too. Keep mion's `test:ci` batching
  (documented OOM guard: resolver processes are ~200 MB each) and `test:bun` as named lanes of the
  unified test script set.
- **Format/lint unification:** extend the `pnpm run format` scope (oxfmt for TS, prettier for
  package markdown, gofmt for Go) over the mion packages — settings are identical to mion's
  prettier config, so the one-time reformat diff should be small; commit it separately. Keep
  mion's eslint flat config (its own plugin rules like `strong-typed-routes` are mion-specific)
  wired into the root `lint` alongside oxlint; fold the duplicated `runtypes/*` rule wiring so the
  rules are configured once.
- **Root configs:** finish what the join deferred — single vitest project list with no
  duplication, tsconfig references complete for every package (mion's list was missing drizzle,
  platform-cloudflare and platform-vercel even before the merge), engines/node checks in one
  place.
- **Rename `packages/drizze` → `packages/drizzle`** (dir has been misspelled vs the
  `@mionjs/drizzle` package name since its creation) and update the vitest project name, tsconfig
  reference, and any path references.
- **Env registry:** any env var the mion side reads gets added to the `REGISTRY` in
  `scripts/lib/env.mjs` per the ts-run-types contract (`pnpm run check:env` enforces it).
- Update CLAUDE.md's temporary addendum to match the unified reality (the full doc merge stays in
  step 7).

## Known hazard from step 2: the vite 8 edge bundles change runtypes runtime behavior

Found during the join's green bar (2026-08-24). Building test-server's edge/cloudflare bundles
with vite 8 (rolldown) instead of vite 7 (rollup) makes
`vercelHandler.edge.spec.ts` / `cloudflareHandler.workers.spec.ts`
"should get an error when sending invalid parameters" fail: the bundle's
`paramsJitFns.restoreFromJson` ends up a noop, so a bad param that used to throw a
deserialize error (`serialization-error`, matching the node lane) instead falls through to
validation (`validation-error`, `typeErrors: [{expected: 'objectLiteral'}]`) — a node-vs-edge
parity break. The bundles inline the PUBLISHED `@ts-runtypes/core@0.12.2` source, and the
rolldown build evaluates six extra modules the rollup build tree-shakes away
(`formats/*`, `typeFormats.generated.ts`, `builderCore.ts` — registry side effects), which is
where the behavior diverges.

Step 2 pinned `vite: 7.3.2` as a `devDependencies` entry of `packages/test-server` (a
deliberate exception to the root-level-devDeps rule) so the bundle builder stays on rollup.
When this step bumps everything to vite 8 and switches to `workspace:*`, the bundle will inline
the WORKSPACE runtypes source — re-run those two specs, find why the inlined registry modules
flip `restoreFromJson` to noop (likely a `sideEffects` / registration-order issue in
`@ts-runtypes/core`), fix it at the root, and drop the pin.

## Done criteria

- One clean clone bootstrapped by the ts-runtypes-setup skill runs `pnpm install`,
  `pnpm run check:builds`, full `pnpm test`, `go -C ts-go-runtypes test ./internal/...`,
  `pnpm run lint`, `pnpm run check-format` — no `:mion` scripts left, no lerna/nx anywhere.
- `pnpm why @ts-runtypes/core` resolves to the workspace link, not the registry.
- `scripts/pre-publish-test.sh` still passes (it dies in step 5, but must not be broken before
  its replacement exists).
