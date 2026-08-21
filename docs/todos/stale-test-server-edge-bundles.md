# The committed `packages/test-server/build/*` bundles are stale, and a fresh build of them fails

**Status:** todo — PRE-EXISTING, not caused by the branch that found it (verified below). The
platform-cloudflare and platform-vercel edge suites currently pass only because the committed bundle
is old.
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

## Fix plan

1. Reproduce and read the real error out of the workerd runtime (the spec only surfaces the response
   body). `packages/test-server/vite.edge.config.ts` / `vite.cloudflare.config.ts` build
   `src/test-server-edge.ts` as a single IIFE with `resolve.alias` pointing at workspace source.
2. Most likely candidates, in order: the generated `__runtypes/` cache modules not being pulled into
   the IIFE (aliased/externalized away), the alias map bypassing the plugin's transform for
   `@mionjs/*` sources, or a fn-key mismatch between the aliased source copy and the generated cache.
3. Once fixed, **regenerate and commit the artifacts**, and add a guard so they cannot silently rot
   again — either rebuild them as part of the specs' setup, or assert in CI that a rebuild produces
   no diff.
4. Consider whether committing these bundles is right at all: `.gitignore:79` documents the committed
   `build/` exception for `devtools` only ("eslint needs compiled JS"). test-server's may be tracked
   by accident, in which case generating them in a pretest step is the better answer.
