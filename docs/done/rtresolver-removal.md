# `rtResolver` deleted — mion reads the @ts-runtypes cache directly

**Status:** done — branch `refactor/runtypes-glue-umbrella`
**Created:** 2026-07-27 (as `docs/todos/runtypes-glue-1-rtresolver-unwrap.md`)
**Parent:** [runtypes-glue-0-umbrella.md](../todos/runtypes-glue-0-umbrella.md) — phase 2 of 3

Surfaced by PR #128 review comment
[r3634568676](https://github.com/MionKit/mion/pull/128#discussion_r3634568676): *"wrapper seems to me
like a proxy, and the goal of this pr is to remove proxy and unwrap things, and use ts-runtypes
directly."*

## Outcome

`packages/core/src/runtypes/rtResolver.ts` is gone. All 14 `resolveJIT(h)` call sites now call
`getRTUtils().getRT(h)`. `resolveJIT` / `resolveCompiledPureFn` are dropped from
`packages/core/index.ts`.

**BREAKING** for external consumers of `@mionjs/core` 0.8.x — defensible pre-1.0, and in-repo
breakage was the stated bar.

## Why the wrapper had nothing left to buy

The spec assumed `resolveJIT` compensated for fields that are optional upstream. Measured field by
field, it did not:

| Field | Wrapper did | Reality |
|---|---|---|
| `fn` / `createRTFn` | `?? ` fallbacks | Already guaranteed: `getRT()` runs `materializeRTFn` and returns `InitializedTypeFn`. Nothing in mion ever *calls* `createRTFn`. |
| `isNoop` | `!!entry.isNoop` | Every consumer is a truthiness test. A pure no-op. |
| `fnID` | overwrote it with `familyTag` | **Destructive.** It erased upstream's real `fnID`, which for the 7 JSON composites genuinely differs (`jeMU` carries fnID `pj`). Nothing reads `.fnID` off a `JitCompiledFunctions` slot — the spec's justification for keeping the wrapper did not exist. |
| `args` / `defaultParamValues` | `normalizeArgs` | The `vλl` defaulting was redundant (every upstream family emits it). The **string filter** was the load-bearing half, and for a reason the spec never mentions — see below. |
| `code` | `?? ''` | Papered over the one case that matters. See emit mode. |

The wrapper also returned a **shallow copy** of a live cache object, so upstream's own in-place
memoizations (`entryCode`, lazy `createRTFn`/`fn`) wrote to the original and never to the copy mion
cached long-term.

## The unsoundness this fixes

`getRtEntry` declared its return as `CompiledTypeFn | undefined`, weaker than the `InitializedTypeFn`
upstream actually returns. That discarded guarantee left **14 unguarded `.fn(...)` call sites**
across `router/src/dispatch.ts`, `router/src/routes/serializer.routes.ts` and
`client/src/lib/{validation,serializer}.ts` type-unsound, with nothing to catch it (no typecheck in
CI, no build since May).

Deleting the wrapper and typing the `JitCompiledFunctions` slots as the new `MionTypeFn` closed
**21 pre-existing type errors** — every one a `TS2722 Cannot invoke an object which is possibly
'undefined'` or its `TS18048` twin.

`MionTypeFn` is a narrowing of upstream's own types, not a mirror:
`InitializedTypeFn<Fn> & Required<Pick<CompiledFnData, 'code'>>`.

## Emit mode: mion supports 'code' | 'both' only

The `code` guarantee above needs enforcing, so `mionVitePlugin` now **throws at config time** on
`emitMode: 'functions'`. That mode ships a live `createRTFn` and omits `code` by design — fine
in-process, fatal for mion, whose whole client story is serializing compiled fns as strings and
rebuilding them in the browser. Previously `?? ''` turned that into `code: ''`, which is
indistinguishable from absent to upstream's `materializeRTFn` (`if (!createRTFn && !code) return;`),
so a `functions` build shipped clients that threw `fn is not a function` on first validate.

A type alone would not have been enough — vite configs are hand-written JS.

## Three real fidelity bugs fixed

The wire round trip was losing data. Not in `args`/`defaultParamValues` (nothing reads those), but:

1. **Pure-fn `paramNames` were discarded on restore.** `addSerializedJitCaches` hardcoded
   `new Function('utl', code)`. `paramNames` are the *author's* factory parameter names, recorded
   verbatim at build time, and they were already on the wire — so a factory written
   `(rtu) => ...` restored with its body referencing an undeclared `rtu` and **ReferenceError'd on
   first call**. Now uses upstream's `buildPureFnFactoryFromCode(paramNames, code)`.
2. **`alwaysThrowMessage` never shipped.** Such entries have no code, only a throwing factory built
   from the build-time diagnostic. Without the message the client had neither code nor factory, so
   `materializeRTFn` bailed and the caller got a bare `TypeError` instead of
   `[code] headline (at file:line:col)`. Now serialized and rebuilt via `utl.alwaysThrowFactory`.
3. **`familyTag` never shipped**, because the wrapper had overwritten `fnID` with it and the restore
   lane put `fnID` back into `familyTag`. Both now travel as themselves.

## Built-in pure fns no longer ride the wire

Serializing a format route pulled in `rt::newRunTypeErr` and friends. Those live in `@ts-runtypes`'
package-owned namespaces (`rt`, `rtFormats`), whose bodies are **hollowed** in the dist build — so
there was never anything to send, and the client already has them (it loads `@ts-runtypes/core`
through `@mionjs/core`). The restore lane was already skipping them on `hasPureFnByKey`. They are now
skipped at serialization instead of shipped as `code: undefined`.

A genuinely unserializable non-builtin entry (runtime-registered, no body) now **throws** at
serialization rather than shipping a payload that breaks on first use.

## Correction to the wire-fidelity requirement

The ask was to send the exact same compiled data so the client can restore faithfully. Verified: for
`args`/`defaultParamValues` that is **not achievable and not useful**.

- Nothing reads them. Upstream restores through `code` alone (`buildFactoryFromCode` takes only
  `utl`); no mion client code touches them.
- They are pure functions of `familyTag` — `familyMeta` is upstream's only writer, so they carry zero
  per-entry information.
- Shipping verbatim **breaks the wire**: `defaultParamValues.vλl` is `undefined` for every family, the
  route is serialized by a stringifier compiled from `CompiledFnData` with no undefined-guard on a
  required property, and the output would be the literal text `"vλl":undefined` — invalid JSON,
  every entry, total outage.

So `args` ships verbatim (already all-strings) and `defaultParamValues` goes through a documented
`toWireArgs` in the serializer, where it belongs — a wire-shape concern, not a lookup concern. The
root cause is an upstream type lie, filed as
[upstream-compiledfnargs-type-lie.md](../todos/upstream-compiledfnargs-type-lie.md).

The fidelity that *was* broken is the three bugs above, and those are fixed.

## Also removed

- `normalizeArgs` (dead export), `wrapRtEntry`, `getRtEntry`.
- `toJitCompiledFn` → moved into `mionAdapter.ts` as `fabricateEntry` (its only consumer), renamed
  off the retired "jit" vocabulary.
- `resolveCompiledPureFn` → moved into `mionAdapter.ts`, the server-side serializer half of the same
  wire concern `addSerializedJitCaches` restores. Its raw-cache read keeps a fuller comment: the
  runtime-built key would emit **CTA003** through `getCompiledPureFn`, and upstream has no
  `getCompiledPureFnByKey` returning the full entry.
- `JitFnArgs`, `PureFunctionsCache`, `PersistedPureFunctionsCache`, `PersistedPureFunction` — dead
  types, and the two caches were nested where upstream's is flat, documenting a layout that does not
  exist.
- mion's `PureFunctionData` / `CompiledPureFunction` mirrors, which declared `code` and
  `createPureFn` **required** where upstream has both optional. Now re-exports of upstream, plus a
  deliberate `SerializablePureFunction` narrowing for the wire.
- The dead `structuredClone` calls in the serializer (`normalizeArgs` had already allocated).

## Tests

`rtResolver.spec.ts` deleted, its two miss-path assertions re-homed onto `mionAdapter.spec.ts`.
Added: pure-fn restore under non-`utl` parameter names; `alwaysThrow` surfacing its real message;
`familyTag`/`fnID` round-trip; `emitMode: 'functions'` throwing at config time.

## Corrections to the original spec

| Spec claim | Reality |
|---|---|
| caller-map line numbers | Stale by +15 (`mionAdapter`) and +1 (`remoteMethods`) — later commits shifted them. |
| "`normalizeArgs` … guarantees a `vλl` key" | The `vλl` half is redundant; the **string filter** is what matters, and the spec never says why (upstream emits non-strings). It also missed that `client.routes.spec.ts` is the test that pins this. |
| "mion treats `code` as required, upstream types it `code?`" | mion's `CompiledTypeFn` **is** upstream's — a bare re-export. `code?` in both. |
| "`fnID` — set from the caller's family key" | It is set **from `familyTag`**, overwriting upstream's real `fnID`. |
| "`fnID` is optional upstream" | Required, and always set. |
| step 3(a): keep `resolveJIT` if the `fnID` remap is needed | `JitCompiledFunctions` keys off object property names; no consumer reads `.fnID` off a slot. The justification did not exist. |
| Tests section lists 3 spec files | `packages/router/src/routes/client.routes.spec.ts` is the real gate on wire shape and was omitted. |
| framing: "the wrapper compensates for optionality" | It compensated at *runtime* only. At the type level mion was already unsound in 21 places. |

## Verification

0 new typecheck errors in `core` / `router` / `client` / `drizze`; **21 fixed** in the examples
source-resolution check (60 → 39). Full suite **725 tests / 46 files green** (719 at baseline, +6
new). Lint 0 errors.
