# platform-bun: needs a ts-runtypes injection lane (still on the deepkit pipeline)

**Status:** in progress — R2 of [migration-review-findings.md](../done/migration-review-findings.md). Deepkit
loader replaced with a ts-runtypes lane (`unplugin.bun` + runtime shims) that now RUNS end-to-end under
`bun test`, but on-demand cross-package injection is not yet complete (see findings). README warning stays.
**Created:** 2026-07-20

## Problem

`@mionjs/platform-bun` was never migrated: `loader/runtypes-loader.ts` imported `@deepkit/type-compiler`
and was wired through `bun-preload.ts` + `bunfig.toml`. Under ts-runtypes that transform injects metadata
nothing consumes — route registration throws `MissingRtFnsError`. Bun's tests are `bun:test`, invisible to
the vitest CI, so the green suite never exercised it.

## Findings (this pass — the transparent `bun test` preload lane)

`@ts-runtypes/devtools` has no `./bun` export, but it DOES export `./unplugin` (the raw unplugin@3
`UnpluginInstance`), and `unplugin.bun(options)` produces a `BunPlugin`. The resolver binary is present
(`@ts-runtypes/binary-<platform>-<arch>` via `@ts-runtypes/bin` `getExePath()`), bun 1.3.11 is installed.
`loader/runtypes-loader.ts` was rewritten to wrap `unplugin.bun({tsconfig, transformMode:'go', ...})`.

Getting it to RUN under Bun's **runtime** `Bun.plugin()` preload (as opposed to the `Bun.build()` bundler)
required shimming two gaps — unplugin's Bun context is written for the bundler API:

1. **`build.onStart` is missing** in the runtime plugin context (the resolver's `buildStart` hook — which
   spawns the resolver process — is registered via `build.onStart`). Shim: capture the callback and drive
   it manually after `setup`.
2. **`onLoad` returning `undefined`** (resolver left a file untransformed) is rejected by Bun's runtime
   loader ("Expected module mock to return an object"), whereas the bundler treats it as default-load.
   Shim: wrap `onLoad` to fall back to the file's original source.

With both shims the pipeline runs: the resolver spawns and files transform. **Remaining blocker:** the
resolver does not inject the type ids for `@mionjs/router`'s INTERNAL routes (`mion@methodsMetadata`,
error/client routes) — a minimal `initRouter()` still throws `MissingRtFnsError: … no type id injected for
'mion@methodsMetadata#params'`. Those `route()`/`middleFn()` call sites live in `@mionjs/router`'s source,
OUTSIDE platform-bun's tsconfig `include: ["."]`. Under vite the resolver transforms whatever is in the
module graph (cross-package source included, via the `source` condition); under the on-demand Bun `onLoad`
the resolver resolves types across the whole program but only INJECTS files inside its own `include`, so
imported cross-package route definitions are read but never rewritten.

## Fix plan (remaining)

1. **Make the resolver transform cross-package source on demand** (the real blocker). Options: widen the
   scanned program (a synthetic tsconfig whose `include` covers the resolved `@mionjs/router`/`@mionjs/core`
   source, or the resolver's `allowUncheckedPatterns`/scan-root knobs), or drive the resolver's whole-program
   SCAN at buildStart so per-file `onLoad` transforms hit a warm call-site index. Needs @ts-runtypes/devtools
   guidance — file an upstream issue for a first-party **Bun.plugin-compatible** adapter (the `unplugin.bun`
   context targets `Bun.build`, not the runtime preload; the two shims above should live upstream).
2. **Fallback lane if the runtime preload can't be completed:** drive `Bun.build()` (which HAS `onStart`)
   or the `ts-runtypes --compile` CLI batch (emits transformed `.js` + cache modules to `genDir`) as an
   ahead-of-time step, then run `bun test`/the app on the emitted output. Worse DX (explicit build) but
   sidesteps every runtime-plugin gap and is the cheapest way to get CI coverage.
3. Wire `bunHttp.test.ts` + `bunHttp.binary.test.ts` into CI (a dedicated `bun test` workflow step, since
   they can't join the vitest projects) once (1) or (2) lands.
4. Remove the README "temporarily unsupported" warning once route registration works under bun.

## Shipped in this pass

- `loader/runtypes-loader.ts` rewritten off `@deepkit/type-compiler` to the `unplugin.bun` lane + the two
  runtime shims; `@deepkit/*` devDeps removed; `reflection` tsconfig flag removed; `isMionCompileMode` skip
  + the `MION_COMPILE` test removed from `bunHttp` (the AOT contract is gone). README warning updated to
  point here. The lane runs but does not yet register routes (blocker above), so bun stays out of CI.
