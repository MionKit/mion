# The committed `packages/test-server/build/*` bundles are stale, and a fresh build of them fails

**Status:** todo — PRE-EXISTING, not caused by the branch that found it (verified below). **Blocks
back-to-back runs of the release gate**: `scripts/pre-publish-test.sh` runs tests (step 2) before
build (step 4), so a first run from a clean tree passes — but that run leaves regenerated, broken
artifacts behind, and the next run fails at step 2. Observed, not theorised.
**Created:** 2026-08-21

## Problem

`packages/test-server/build/test-server-edge.js` and `test-server-cloudflare.js` are committed build
artifacts. `packages/platform-cloudflare/src/cloudflareHandler.workers.spec.ts` and
`packages/platform-vercel/src/vercelHandler.edge.spec.ts` load those files and run them in
workerd/edge runtimes.

They have not been regenerated since the ts-runtypes migration. **Regenerating them breaks 7 tests**:

```
$ pnpm --filter @mionjs/test-server run build     # rewrites build/test-server-{edge,cloudflare}.js
$ pnpm exec vitest run --project platform-cloudflare
  SyntaxError: Unexpected token 'E', "Error: Mis"... is not valid JSON
```

The response body is a `MissingRtFnsError` — the route's compiled runtypes fns are not found at
runtime. The bundle is not empty of them (`grep -c getPureFn` → 28), so this is a _partial_ injection
or a registry-lookup failure inside the IIFE bundle, not a total no-op.

## Not caused by the current branch

Verified by stashing all uncommitted work and rebuilding at `1269691` (the CJS/ESM commit, which
contains the plugin-option purge and the vite-plugin changes but not the virtual-module retirement):
the same 7 tests fail. `git checkout -- packages/test-server/build/` restores the stale artifacts and
they pass again. So the breakage is a property of building these two configs with the current engine,
and predates this work.

## Why it matters

- These two suites are testing a frozen pre-migration bundle, so they no longer guard the edge and
  workers adapters against current code. Whatever regressed is invisible to CI.
- It is on the release path: `scripts/pre-publish-test.sh` step 4 runs `pnpm run build`, which
  regenerates these files. The gate happens to run tests (step 2) _before_ build (step 4), so a
  single clean run passes — but any developer who builds and then tests sees 7 failures, and a
  reordering of the gate would turn it red.

## What the failure actually is

The route call sites in the entry file are **not injected**. In the freshly built bundle:

```
const changeUserName = route((ctx, user) => {        // no marker arguments
```

while `@mionjs/router`'s own internal routes, bundled into the same file, are:

```
route(mionGetRemoteMethodsDataById, {serializer: "stringifyJson"}, [__rt_nPZ_l9TXj7P, …])
```

So the ts-runtypes runtime and 21 generated fns are present in the bundle; what is missing is the
injection at `src/test-server-edge.ts`'s own `route()` calls. That is precisely what
`MissingRtFnsError` reports (`packages/router/src/lib/reflection.ts:29`).

The committed artifact predates all of this: `grep -c rtFns` gives **0** on the committed
`test-server-edge.js` and 31 on a fresh build. The two suites have been validating a pre-migration
bundle.

## Ruled out (each tested directly)

- **The `const x: Route = route(…)` annotation.** `packages/platform-gcloud/src/googleCF.spec.ts:39-47`
  uses the identical pattern and injects fine.
- **`resolve.alias` vs the `source` condition.** Replacing the alias map with
  `resolve.conditions: ['source']` (what `packages/test-server/vite.config.ts` uses) changes nothing.
- **The `iife` output format.** Building the same entry as `es` changes nothing.
- **A stale generated cache.** `rm -rf packages/test-server/__runtypes` then rebuilding changes nothing.
- **The tsconfig scan scope.** `include: ["."]` covers the file, and the NODE lib build
  (`vite.config.ts`) of the same package, with the same tsconfig, injects correctly —
  `.dist/esm/src/test-server-json.js` has fully injected call sites.

So the differentiator is something about the edge/cloudflare build configs beyond format and
resolution, and the plugin emits no diagnostic at all — it transforms 284 modules silently and skips
these call sites. Next step is likely an upstream question for `@ts-runtypes/devtools`: what makes it
decline to inject a `route()` call site, silently, in one vite config but not another over the same
tsconfig program. A `failOnError`-style diagnostic for "tracked callee found, not injected" would have
made this a one-minute diagnosis instead of an afternoon.

## Fix plan

1. Answer the question above, fix the cause.
2. **Regenerate and commit the artifacts**, and add a guard so they cannot silently rot again — either
   rebuild them in the specs' setup, or assert in CI that a rebuild produces no diff.
3. Consider whether committing these bundles is right at all: `.gitignore:79` documents the committed
   `build/` exception for `devtools` only ("eslint needs compiled JS"). test-server's may be tracked by
   accident, in which case generating them in a pretest step is the better answer.
4. Until it is fixed, `git checkout -- packages/test-server/build/` after running `pnpm run build`, or
   the next test run is red.
