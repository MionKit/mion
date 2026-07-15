# `JIT_FUNCTION_IDS` prefixes are pinned per ts-runtypes binary version

**Status:** todo — ROOT fix is upstream in ts-runtypes (see below); mion's pin is a workaround.
**Created:** 2026-07-15

## Root cause lives in ts-runtypes (filed upstream)

The churn below is caused by ts-runtypes folding `constants.Version` into the fn-hash salt
**redundantly** — the typeID already carries the version, so the composite cache key
`<fnHash>_<typeId>` is already version-invalidated by its typeID half; folding it into the
fnHash too is what makes the per-family PREFIX move on every release. The fix belongs upstream:
drop `constants.Version` from `fnHashSalt` so family prefixes are version-STABLE (the typeID
keeps carrying the version). Filed as ts-runtypes
`docs/todos/fnhash-version-independent-family-prefixes.md`.

Once that ships, mion's `JIT_FUNCTION_IDS` needs ONE final refresh to the version-independent
hashes and then never churns again — or mion drops the pin entirely per the "Fix plan" below
(discover the key from the injected tuple + ship `family → prefix` with the deps). Until the
upstream release lands, the pin below stays as the workaround.

## Problem

`packages/core/src/constants.ts` `JIT_FUNCTION_IDS` hardcodes the per-family fn-hash prefixes
(`val→uSW, verr→c2G, pj→IM8, rj→C8G, sj→xPn, huk→IOY, uke→Wia, tb→gY2, fb→pVn` for 0.9.2).
The ts-runtypes binary version is folded into every typeID and fn-hash, so **every version
bump re-hashes all families** and these constants must be refreshed by hand. This has already
happened twice (0.9.0→0.9.1→0.9.2). The `mionAdapter.spec` pins them so a stale set fails
loudly, but it is manual maintenance and a bump lands red until refreshed.

## Where the prefixes are load-bearing

- `getJitFnHashes(jitHash)` (`routerUtils.ts`) builds `<prefix>_<typeId>` keys.
- `serializeMethodDeps` (server, `router/lib/remoteMethods.ts`) iterates families via
  `getJitFnHashes` to serialize the method's fn entries into the flat `deps` map.
- `getJitFunctionsFromHash` (client restore, `routerUtils.ts`) rebuilds `JitCompiledFunctions`
  from a `jitHash` by constructing `<prefix>_<typeId>` and looking each up.

The value-level transforms themselves already resolve version-agnostically via the public
`getRTFunction<'pj'>/<'rj'>/…` in `mionAdapter.buildJitFnsFromMarker`; only the full cache
ENTRY re-lookup (code/isNoop/deps, for the client-metadata lane) still goes through the pinned
prefixes.

## Fix plan

Make the prefixes DISCOVERED instead of pinned, so a ts-runtypes bump needs no constant edit:

- **Server:** in `buildJitFnsFromMarker`, read the real cache key straight from the injected
  entry tuple (slot 3 = the `<fnHash>_<typeId>` key; ts-runtypes exposes `entryTupleKey(tuple)`
  internally but does NOT root-export it — either read slot 3 behind a tiny guarded helper, or
  request a public `entryTupleKey`/`isEntryTuple` export from `@ts-runtypes/core`). Use that key
  for the entry lookup + as the `JitCompiledFn.jitFnHash`, dropping `getJitFnHashes` on the
  server side.
- **Client:** either ship the per-family keys (or a `family→prefix` map) alongside the
  serialized `deps` in `SerializableMethodsData`, or derive `family→prefix` on the client from
  each shipped dep's `fnID` + `rtFnHash` (`rtFnHash.slice(0, FN_HASH_LEN)`), so
  `getJitFunctionsFromHash` no longer needs hardcoded prefixes. (Note: mion's `fnID` labels
  and the ts-runtypes family tags are not currently consistent across both wrap paths — unify
  them first, or ship the keys explicitly.)

Once discovered/shipped, delete `JIT_FUNCTION_IDS` and the adapter-spec pin.

## Acceptance

- A ts-runtypes version bump (which re-hashes families) requires NO edit to mion constants; the
  full suite stays green across the bump with no prefix refresh.
