# `JIT_FUNCTION_IDS` prefixes are now DERIVED (not pinned) via `getFnHash`

**Status:** done (shipped in the @ts-runtypes 0.9.3 upgrade, PR #123)
**Created:** 2026-07-15

## What shipped

`packages/core/src/constants.ts` `JIT_FUNCTION_IDS` no longer hardcodes the per-family fn-hash
prefixes. It now DERIVES them from `@ts-runtypes/core`'s public `getFnHash`:

```ts
import {getFnHash} from '@ts-runtypes/core';
export const JIT_FUNCTION_IDS = {
    isType: getFnHash('val'),
    typeErrors: getFnHash('verr'),
    prepareForJson: getFnHash('pj'),
    restoreFromJson: getFnHash('rj'),
    stringifyJson: getFnHash('sj'),
    hasUnknownKeys: getFnHash('huk'),
    unknownKeyErrors: getFnHash('uke'),
    toBinary: getFnHash('tb'),
    fromBinary: getFnHash('fb'),
} as const;
```

All the load-bearing consumers (`getJitFnHashes` / `getJitFunctionsFromHash` in `routerUtils.ts`,
`serializeMethodDeps` in `router/lib/remoteMethods.ts`) are unchanged — the map keeps the same
shape, only its values are now derived. No more manual refresh on a ts-runtypes bump.

## Root cause + the upstream fix

The churn was caused upstream: ts-runtypes folded `constants.Version` into the fn-hash salt
**redundantly** — the typeID already carries the version, so the composite cache key
`<fnHash>_<typeId>` was already version-invalidated by its typeID half; folding it into the
fnHash too is what made the per-family PREFIX move on every release (0.9.0→0.9.1→0.9.2 each
re-hashed all families and forced a hand-refresh of the constants).

Filed upstream as `docs/todos/fnhash-version-independent-family-prefixes.md` and **implemented in
ts-runtypes 0.9.3** (commit `988e221d`, "version-independent fn cache-key prefixes + getFnHash
derivation"):

- `operations.fnHashSalt` dropped `constants.Version` (now `"op|" + canonicalKey`), so per-family
  fnHash prefixes are STABLE across releases. The composite key still invalidates across versions
  through its `<typeId>` half (and the version-folded typeID disk directory). Disk cache format
  bumped 13→14.
- New public `getFnHash(fnKey, options?)` on `@ts-runtypes/core` derives the version-independent
  fnHash for a family (+ compile-time options) WITHOUT the injected function tuple, table-backed
  from the Go `operations.FnHashFor` source of truth (zero JS↔Go drift, wired into the codegen
  drift gate). Handles the option axes a flat map can't (validate `NL`/`NA`/`NLA`, JSON strategies).

Because the prefixes are now derived from the same table the emitter uses, they can never go
stale: a future version bump re-hashes typeIds but `getFnHash` tracks the fnHash half automatically.

## Verification

- Bumped `@ts-runtypes/{core,devtools,bin}` 0.9.2 → 0.9.3; every prefix changed once
  (`val` `uSW`→`nPZ`, `pj` `IM8`→`tt1`, …) — proof the old hardcoded map would have gone stale,
  and that `getFnHash` picks up the new stable values with no edit.
- Full mion suite green across all four CI batches (1123 tests), lint 0 errors, format clean.
- The `mionAdapter.spec` "resolves full jit entries" test now verifies the derived
  `<fnHash>_<typeId>` keys resolve to real emitted 0.9.3 cache entries (a derivation-consistency
  check that can't go stale on a bump), instead of pinning literal prefixes.

## Follow-ups folded in

The original "discover the key from the injected tuple / ship `family→prefix` with the deps" plan
is now moot for the version-churn problem — `getFnHash` solves it more cleanly (a pure, stable,
public derivation) without an `entryTupleKey` export or client-side `family→prefix` shipping.
