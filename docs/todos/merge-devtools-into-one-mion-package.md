---
type: feature
spec: full-plan
status: open
created: 2026-09-01
---

# Fold the two devtools packages into one `@mionjs/devtools`

Phase 4 of
[rename-ts-runtypes-namespace-to-mion.md](rename-ts-runtypes-namespace-to-mion.md).
Phases 1, 2, 3 and 5 are applied; this is the last one, and the only behavioural one.

## What exists today

Two packages, and only one of them is thin.

| | `@ts-runtypes/devtools` | `@mionjs/devtools` |
|---|---|---|
| version | 0.12.2 | 0.8.10 |
| src / test files | 37 / 79 | 27 / 14 |
| export subpaths | 13 | 3 |
| bundlers | vite, rollup, rolldown, webpack, rspack, esbuild, bun, next/turbopack | vite |
| lint | `runtypes/*`, oxlint jsPlugin + ESLint v9 | `@mionjs/*`, ESLint only |
| build | `tsc --build` to `dist/`, ESM | `vite build` + `vite-plugin-dts` to `build/`, ESM + CJS |
| root export `.` | the unplugin instance | the ESLint plugin |

`@mionjs/devtools` is a wrapper: it calls `tsRuntypes(options)`, then adds mion's own
pieces around it.

```ts
// packages/devtools/src/vite-plugin/mionVitePlugin.ts:335
const plugins = tsRuntypes(rtPluginOptions);
```

`@mionjs/devtools` is NOT the only mion consumer of a bundler adapter. `platform-bun`
imports the bun one directly:

```ts
// packages/platform-bun/loader/runtypes-loader.ts:9
import runtypesBunPlugin from '@ts-runtypes/devtools/bun';
```

So "mion only needs vite" is already false in the tree.

## Next apps ALREADY get the TS to TS rewrite

Worth stating plainly, because the standing assumption is that they do not, and that
assumption is what left the Next starter without a front end transform.

Turbopack has no plugin API and does not run webpack plugins
([unjs/unplugin#302](https://github.com/unjs/unplugin/issues/302)), so this lane is not an
unplugin adapter. It is a **broker plus a loader**: `next.config` is plain Node and runs
before any bundler worker exists, so it starts a broker holding the one resolver, and a
webpack-style loader registered through `turbopack.rules` hands each file over a unix
socket.

The loader sends source and gets rewritten source plus a source map back:

```ts
// packages/ts-runtypes-devtools/src/next/loader.ts
const request: BrokerRequest = {id, file, code: source};
...
callback(null, reply.code, reply.map);
```

and the broker runs the SAME transform hook every other host runs, off the same
`unplugin.raw` instance:

```ts
// packages/ts-runtypes-devtools/src/next/broker.ts:352
const result = (await built.transform?.call(context, request.code, request.file))
```

Rules cover `*.ts, *.tsx, *.mts, *.cts` with `condition: {not: 'foreign'}`, which keeps the
loader off `node_modules`. `next --webpack` falls back to the ordinary unplugin webpack
plugin, chosen by `isTurbopack()`.

So this is not a reduced lane. It is the same rewrite delivered over a socket instead of
through a plugin API.

Coverage: `container/pre-publish-e2e/apps/smoke-next/`, driven by `buildNext` in
`build-all.mjs`, asserted in `test/build-outputs.test.mjs`. It prerenders a page and
re-checks the injected id after a type edit, so a stale rewrite fails the build.
Deliberately no vitest `next build` test: `next` is ~202 MB and is not a workspace
dependency, so such a test would be permanently skipped. See
[packages/ts-runtypes-devtools/src/next/CLAUDE.md](../../packages/ts-runtypes-devtools/src/next/CLAUDE.md),
which records seven invariants that read like cleanups and are not.

**The CLI road exists too.** `mion compile` is a tsc-style command that emits rewritten
`.js` with composed source maps pointing at the original `.ts` lines
(`packages/ts-runtypes-devtools/test/compile-cli.test.ts`). It stays the fallback for a
host with neither a plugin API nor a loader hook. It is not needed for Next, and it costs
the dev loop: no HMR, no incremental re-transform on a type edit, and a second build
artifact to keep in sync.

**So the mion Next starter needs no new bundler integration.** It needs a mion-flavoured
wrapper, and the Next adapter was already written to be composed rather than nested:

```ts
// packages/ts-runtypes-devtools/src/next/index.ts:9
// The pieces are exported individually, not just as one sealed wrapper, because
// downstream tools (mion's devtools) build their own Next integration on top of
// this one and need to compose the parts rather than nest wrappers.
```

`startBroker`, `socketPathFor`, `ownsBroker`, `runTypesTurbopackRules` and `isTurbopack`
are all exported, and `NextOptions extends PluginOptions`.

### What of mion's vite preset ports to Next

`serverMapFrom` has two halves that run in DIFFERENT builds, and only one of them is a
Next concern.

| mion piece | ports? | why |
|---|---|---|
| `emitMode: 'functions'` rejection | yes | plain config check, bundler agnostic |
| `serverMapFrom` **harvest** (client build) | yes | `onPureFnReport` is a universal hook fired inside `buildStart` (`unplugin.ts:932`), and the broker calls `built.buildStart?.call(context)` (`broker.ts:198`). The callback lives in the `next.config` process, so it is a real function. `rtHotUpdate` re-fires it with phase `'update'` on edits. In a Next app, Next IS the client build, so this half runs under Turbopack |
| `serverMapFrom` **consume** (server build) | not a Next concern | this half IS a TS to TS transform: it appends `import './.mion/server-mappers.generated.js'` into the module that imports `@mionjs/router` and names `initMionRouter` (`mionVitePlugin.ts:498`). That module is the mion API server, built by vite in its own process. Next never sees it |
| Vue SFC transform | no | not a Next concern |
| middleware mode / managed server | no | Next runs its own dev server |
| module-graph invalidation | no, and not needed | the broker's `typeDeps` + stamp already cover it, including ambient types |

So `withMion` on the Next side is the harvest half plus the shared option mapping. The
consume half stays where it is, on the vite plugin that builds the API server.

## Decisions taken

1. **One package**, not two. Kills the 0.12.2 / 0.8.10 skew and lets the mion preset
   construct the plugin directly instead of fishing it back out (`findRtPlugin`,
   `mionVitePlugin.ts:402`, gets deleted).
2. **mion gets the short subpath.** `/vite` and `/next` are the mion presets; the
   unopinionated adapters live under `/runtypes/*`.
3. **The lint entry is ESM only.** The top-level `await prewarmSession()`
   (`eslint/index.ts:35`) cannot compile to CJS and is load bearing: the resolver launcher
   must fork while the host is still small, because oxlint reserves tens of GB of address
   space once linting starts and `fork()` then fails with ENOMEM on Linux. The worker
   thread that does the spawn boots asynchronously, so only the await guarantees the
   ordering. The CJS half exists purely because `vite.eslint.config.ts` emits
   `formats: ['es','cjs']`.
4. **The launcher becomes `@mionjs/bin`**, keeping both jobs: the `getExePath()` library
   entry the transform and the lint worker call, and a bin entry for humans. Its `bin`
   field becomes `mion`. The Go binary already IS the CLI (`mion enrich`, `convert`,
   `drizzle-migrate`, `compile`); future refactor commands are new Go subcommands and
   change nothing on the npm side.

## Issues the merge raises

### 1. The root export `.` means two different things

Unplugin instance in one, ESLint plugin in the other. **Root becomes the unplugin instance
plus the shared option types**; lint lives only at `./eslint` and its `./oxlint` alias. The
break is one import line, and the repo's own `eslint.config.js` already uses the subpath:

```diff
-import mionESLintPlugin from '@mionjs/devtools';
+import mionESLintPlugin from '@mionjs/devtools/eslint';
```

### 2. Two rule namespaces in one plugin object

`runtypes/*` (registered through oxlint `jsPlugins`) and `@mionjs/*` (registered through
the flat-config `plugins` key). Ship one module with both rule sets and a
`configs.recommended` that registers it under both names. Verify under BOTH hosts: only
oxlint exercises `runtypes/*` today and only ESLint exercises `@mionjs/*`.

`.oxlintrc.json` names a build artefact by path and breaks on both the directory rename
and the build-dir change:

```json
"jsPlugins": ["./packages/ts-runtypes-devtools/dist/eslint/index.js"]
```

### 3. Two build systems, and mion's is the one that goes

`tsc --build` emits all thirteen entries plus their `.d.ts` in one pass and is what the 79
rt tests and every consumer typecheck already read. mion's `vite build` +
`vite-plugin-dts` pair exists mainly to produce the CJS half that decision 3 retires.

Keep `tsc --build` to `dist/`, retire both `vite.*.config.ts`. Follow-on edits:
`packages/devtools/CLAUDE.md` (the "consumed COMPILED" rule now points at `dist/`),
`scripts/core/build.mjs`, `.gitignore`, the package `clean` script, the `exports` map.

### 4. Two dependencies ship to consumers and are never imported

```
"dependencies": {
  "@rollup/pluginutils": "5.3.0",   // no import anywhere in src
  "vite-plugin-dts": "4.5.4",       // build-only, used by vite.*.config.ts
```

`vite-node` is genuinely runtime (`resolveViteNodeCli`, `mionVitePlugin.ts:632`). The other
two go. Fixed in this task, per the findings rule.

### 5. Peer dependency skew

`vite` is `>=5.0.0` optional in rt and `>=6.0.0` optional in mion; `typescript` is optional
in rt and required in mion. Merged: `vite >=5.0.0` optional (a webpack-only or Next-only
consumer must not be told to install vite), `typescript` optional. `unplugin` stays a real
dependency.

### 6. Version lines collide, and merge-6 owns the fix

0.12.2 against 0.8.10. The merged package must carry one version, and it can only be the
higher one. **Land [merge-6-unify-release-train-and-ci.md](merge-6-unify-release-train-and-ci.md)
first, or land the two together.** `publish-tarballs.mjs` still filters to `ts-runtypes-*`
precisely because the mion packages are not on the lockstep yet, so folding devtools before
that leaves it in neither version line.

### 7. Vitest projects and the batch gate

`@ts-runtypes/devtools` is one of the two heaviest projects in the repo (79 files, and it
spawns the resolver binary), so it holds a batch of its own; `devtools` sits inside
`mion-drizzle`. One directory should be one project, so the merged ~93-file project moves
into the `runtypes-devtools` batch and `mion-drizzle` loses a member.
`pnpm run check:test-batches` fails the whole run until `scripts/core/test-batches.mjs` is
updated, so this is not skippable.

### 8. A dev-only dependency cycle appears

`packages/run-types` devDepends on devtools, and the merged devtools devDepends on
`@mionjs/run-types`. pnpm resolves a dev cycle fine, but build ORDER matters:
`check:builds` must still build devtools' `dist` before run-types' tests read it. Verify on
a clean tree, not an incremental one.

### 9. Everything that names the package by string

Same edit repeated; representative paths, not an exhaustive list:

- 8 e2e smoke apps under `container/pre-publish-e2e/apps/`, plus `build-all.mjs` and
  `test/build-outputs.test.mjs`
- `packages/platform-bun/loader/runtypes-loader.ts`, `bun-preload.ts`
- `packages/examples/src/introduction/quick-start-*.ts`, `guide/setup-vite-config.ts`,
  `packages/examples/tsconfig.runtypes.json`
- `packages/run-types/vitest.config.ts`, `vitest.converted.config.ts`,
  `test/mock-format-isolation/vitest.config.ts`, `packages/core/vitest.config.ts`
- 8 scripts under `scripts/release/`, plus `scripts/lib/env.mjs`, `scripts/core/build.mjs`,
  `scripts/core/smoke.mjs`, both `scripts/website/bench-data/` scripts
- `PUBLISHED_PACKAGE_DIRS` in `test/repo-contracts.test.ts:44`
- `RUNTYPES_LOADER` in `src/next/index.ts:25`, which crosses a process boundary into the
  Turbopack worker, so it fails at build time and not at typecheck

### 10. The documented CLI does not exist

Found while investigating, and it belongs here because this task decides the launcher's
name and `bin` field. The site documents:

```bash
npx mion convert --to type src/models/
```

The only declared bins in the repo are `mion-skills` (on `@mionjs/run-types`) and
`ts-runtypes-bin` (on `@ts-runtypes/bin`). There is no `mion` bin, so every documented
`npx mion ...` line is wrong today. Decision 4 fixes it.

## The shape to build

### Exports map

```
@mionjs/devtools                      -> unplugin instance + shared option types
@mionjs/devtools/vite                 -> mionVitePlugin
@mionjs/devtools/next                 -> withMion                        (NEW)
@mionjs/devtools/eslint               -> merged lint plugin (ESM only)
@mionjs/devtools/oxlint               -> same module
@mionjs/devtools/unplugin
@mionjs/devtools/runtypes/vite        -> plain runtypes adapters
@mionjs/devtools/runtypes/rollup
@mionjs/devtools/runtypes/rolldown
@mionjs/devtools/runtypes/webpack
@mionjs/devtools/runtypes/rspack
@mionjs/devtools/runtypes/esbuild
@mionjs/devtools/runtypes/bun
@mionjs/devtools/runtypes/next        -> withRunTypes + composable pieces
@mionjs/devtools/runtypes/next/loader -> `default` condition, NOT `import`
```

`runtypes/next/loader` MUST keep the `default` export condition. Turbopack resolves a
loader specifier with CJS `require` conditions, so an `import`-only entry dies with
`Package subpath is not defined by "exports"`.

`platform-bun` moves to `@mionjs/devtools/runtypes/bun` and keeps wrapping it itself. No
mion bun preset: what it wraps is Bun-host specific, not mion specific.

### Directories

```
packages/devtools/
  src/
    core/        # from ts-runtypes-devtools/src, bundler agnostic
      unplugin.ts resolver-client.ts protocol.ts edit-buffer.ts apply-edits.ts
      scan-batcher.ts type-deps.ts module-mode.ts diagnosticCatalog.ts
      envCompat.ts typescript-floor.ts plugin-option-keys.ts go-generated/
    runtypes/    # the unopinionated adapter entries (~10 lines each)
      vite.ts rollup.ts rolldown.ts webpack.ts rspack.ts esbuild.ts bun.ts
      next/      # broker.ts loader.ts wire.ts index.ts CLAUDE.md
    mion/        # was packages/devtools/src/vite-plugin
      vite.ts    # mionVitePlugin
      next.ts    # withMion (NEW)
      options.ts # shared option mapping + emitMode guard, used by BOTH presets
      sfcTransform.ts middlewareMode.ts buildEntries.ts serverMappers.ts
    lint/
      index.ts   # both rule sets
      rules/     # mion's 5 rules
      diagnosticRouting.ts prefilter.ts session.ts session-protocol.ts
      lint-worker.ts spawn-shim.ts
  test/          # rt's 79 files; mion's specs stay beside their sources
```

`src/runtypes/next/CLAUDE.md` moves with the directory unchanged. Its invariants are about
the broker and the loader, not about the package name.

`packages/ts-runtypes-bin/` becomes `packages/bin/` as `@mionjs/bin`;
`packages/ts-runtypes-go-be-sidecar/` (private, never published) is renamed with it.

### `withMion`, sketched

```ts
export async function withMion(nextConfig = {}, options: MionNextOptions = {}) {
  const rt = toRunTypesOptions(options);            // shared with the vite preset
  if (options.serverMappers?.emit) rt.onPureFnReport = harvestMappers(options);
  return withRunTypes(nextConfig, rt);              // composed, not nested
}
```

`toRunTypesOptions` is lifted out of `mionVitePlugin` into `src/mion/options.ts` and
carries the `emitMode: 'functions'` guard, so the two presets cannot drift.

### Which bundlers to keep: all of them

Every lane is roughly ten lines over one shared core and every lane already has an e2e app.
Dropping one is a support regression with no maintenance saving. The mion PRESETS start at
vite and next; the rest stay available unopinionated.

## Commit order

Each commit builds, lints and tests on its own.

1. **Move the code.** `git mv` the rt sources under `packages/devtools/src/`, both builds
   still working side by side, no export changes. Proves the directory shape. Update
   `scripts/core/test-batches.mjs` here.
2. **One build, one exports map.** Retire both `vite.*.config.ts`, switch to `tsc --build`
   to `dist/`, write the exports map, drop the CJS lint entry, fix the peer ranges, drop
   the two unused dependencies, update `.oxlintrc.json`.
3. **Merge the lint plugin.** One module, both rule sets, verified under oxlint AND ESLint.
4. **Add `withMion`** plus `src/mion/options.ts`, an `apps/smoke-next-mion` e2e app, and
   broker tests in the vitest suite.
5. **Rename the launcher** to `@mionjs/bin` with `bin: {"mion": ...}`, rename the
   per-platform packages to `@mionjs/binary-<os>-<arch>`, rename the sidecar, fix every
   string in issue 9, delete `migration/`.
6. **Docs.** A Next page on the mion site, `06.devtools/03.vite-config.md` updated, the
   runtypes site's bundler matrix repointed, `02.guide/13.source-conversion.md` and
   `01.introduction/02.built-on-typescript-go.md` corrected for the `mion` bin, and the 5
   example files under `packages/examples/src/` updated (they compile under the root
   typecheck, so drift fails CI).

## Gates

- `pnpm install`, `pnpm run lint`, `pnpm run check-format`, `pnpm run check:env`,
  `pnpm run check:builds`, `pnpm run check:test-batches`
- `pnpm test` (or `pnpm run test:ci` if it OOMs), `pnpm run test:bun`
- `go -C ts-go-runtypes test ./internal/...`
- Lint plugin under BOTH hosts: `pnpm exec oxlint` and `pnpm exec eslint`, each proving its
  own rule family still fires
- `pnpm rtx container push e2e`, then `pnpm rtx release e2e`. This is the phase gate: the
  only thing that proves all eight bundler lanes plus `next build` still resolve the
  renamed subpaths through verdaccio, and the only real Turbopack coverage
- Manual: a scratch Next app doing `export default await withMion({})`, run `next dev`,
  edit an AMBIENT type (declared in a `.d.ts`, so there is no import edge) and confirm the
  page re-transforms with no `Can't resolve` error. That is the case the broker's stamp
  exists for, and `next build` will NOT catch a regression in it
- **The one genuinely unproven bit: the `serverMapFrom` harvest under Turbopack.** The code
  path says it works (universal `buildStart` hook, broker calls it), but no test exercises
  it. `apps/smoke-next-mion` must call `serverMapFrom` in a client component and assert the
  manifest lands in `.mion/`, in both `next build` and `next dev`. If it does not, that is
  the finding to fix in this task rather than defer

## Done when

- One `packages/devtools/`, one published `@mionjs/devtools`.
- `packages/ts-runtypes-devtools/`, `packages/ts-runtypes-bin/` and
  `packages/ts-runtypes-go-be-sidecar/` are gone.
- A Next app sets mion up with `export default await withMion({...})`, e2e proven.
- `npx mion convert` runs, matching what the docs already claim.
- No `@ts-runtypes` string survives outside `docs/done/`.
- `migration/` deleted.
