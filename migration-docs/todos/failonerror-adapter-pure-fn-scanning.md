# mion defaults `failOnError: false` because the run-types adapter trips the pure-fn scanner

**Status:** todo
**Created:** 2026-07-15

## Problem

@ts-runtypes 0.9.2 defaults its `failOnError` plugin option to `true` (Error-severity
diagnostics halt the build). mion overrides it to **`false`** in `mionVitePlugin`, because
`@mionjs/run-types`' adapter deliberately wraps the ts-runtypes pure-fn REGISTRY APIs with
**runtime-computed keys**, which the scanner flags as CTA003 / PFN001. Since every consumer
package scans that adapter source (it is imported transitively), a strict default halts every
build. The trade-off: mion loses the strict-build safety net that would catch a genuinely
non-serializable route/serializer type at build time (diagnostics still surface as warnings +
through the lint lane).

## Evidence

`packages/run-types/src/mionPureFns.ts` and `packages/run-types/src/mionAdapter.ts` call these
comptime-scanned APIs with non-literal (runtime) keys:

- `registerPureFnFactory(mionPureFnId(name), factory)` → CTA003 (id is a function call) + PFN001
  (factory is not an inline function) — `mionPureFns.ts:37`
- `getRTUtils().getPureFn(mionPureFnId(name))` → CTA003 — `mionPureFns.ts:42`
- `getRTUtils().getCompiledPureFn(mionPureFnId(name))` → CTA003 — `mionPureFns.ts:47`
- `getRTUtils().getCompiledPureFn(\`${namespace}::${name}\`)` → CTA003 — `mionAdapter.ts:151`
- the `${namespace}::${name}` template in `addSerializedJitCaches` — `mionAdapter.ts:181`

Root cause: ts-runtypes types its pure-fn registry lookups (`getPureFn` / `getCompiledPureFn` /
`hasPureFn` / `registerPureFnFactory`) with `CompTimeArgs<string>` keys, and the scanner enforces
those as call-site literals. mion's `mionjs`-namespace RUNTIME lane inherently uses computed keys
(it is the documented name-only convenience lane where "comptime extraction can't see it").

These are benign for mion (the runtime lane never needed build extraction), so today they are
downgraded to warnings via `failOnError: false`.

## Fix plan (pick one)

1. **mion-side:** route the runtime pure-fn lookups through a locally-typed indirection whose
   methods take plain `string` keys (cast `getRTUtils()` to a small `{getPureFn(k: string): …}`
   interface), and use `getRTUtils().addPureFn` (runtime registration) instead of the
   comptime `registerPureFnFactory`. If the scanner keys off the resolved callee type, this
   stops it recognising them as marker call sites — then re-enable `failOnError: true` (per
   package, or as the default).
2. **upstream (ts-runtypes):** exempt the runtime pure-fn registry LOOKUPS (`getPureFn` /
   `getCompiledPureFn` / `hasPureFn`) from comptime-literal enforcement — they are runtime
   accessors, not injection sites. Only `registerPureFnFactory`'s extraction path needs literals.

## Acceptance

- `mionVitePlugin` can default `failOnError: true` (strict) without the run-types adapter
  halting consumer builds; mion's own route/serializer type errors still fail the build.
