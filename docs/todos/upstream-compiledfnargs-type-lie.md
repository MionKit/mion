# Upstream: `CompiledFnArgs` cannot describe its own values

**Status:** todo — file against `ts-run-types`, not fixable in mion
**Type:** upstream bug report
**Created:** 2026-07-27
**Found while:** deleting `rtResolver.ts` ([../done/rtresolver-removal.md](../done/rtresolver-removal.md))

## The bug

`@ts-runtypes/core` 0.11.0, `packages/ts-runtypes/src/runtypes/types.ts:142-147`:

```ts
export type CompiledFnArgs = {
  vλl: string;
  [key: string]: string;
};
```

`CompiledFnData` types **both** `args` and `defaultParamValues` as `CompiledFnArgs`. `args` genuinely
is all-strings. **`defaultParamValues` is not, for any family.** `entryTuple.ts:462-468`:

```ts
const valueDefaults  = () => ({vλl: undefined}) as unknown as CompiledFnArgs;
const errorDefaults  = () => ({vλl: undefined, pλth: [], εrr: []}) as unknown as CompiledFnArgs;
```

…plus `{vλl: undefined, θpts: {}}` (huk), `{vλl: undefined, sεr: undefined}` (tb),
`{vλl: undefined, dεs: undefined}` (fb). Every one goes through an `as unknown as CompiledFnArgs`
cast — the author knew the value violates the type.

`familyMeta` (`entryTuple.ts:481-525`) is the only writer of either field anywhere in the package, so
this is not an edge case: **100% of entries have a `defaultParamValues` that the declared type
rejects.**

## Why it matters to a consumer

`CompiledFnData` is publicly exported (`index.ts:27`) and documented as the closure-free **wire**
form. Upstream never builds a validator, encoder or decoder over it, so nothing internally notices.
A consumer that does — mion ships these to the browser — hits two walls:

1. **Validation.** `createValidateFn<CompiledFnData>()` emits `typeof v === 'string'` for the
   required `vλl` with no undefined-guard, and applies the index-signature check to every own
   enumerable key. `undefined`, `[]` and `{}` all fail.
2. **Serialization, which is worse.** The JSON stringifier compiled from `CompiledFnData` has no
   undefined-guard on a non-optional property either, so it emits the literal text
   `"vλl":undefined` — **syntactically invalid JSON**. The receiver's `JSON.parse` throws. Not a
   degradation: a total outage of any route that ships these.

So a consumer cannot forward the values it is handed, and has to launder them.

## What mion does meanwhile

`toWireArgs` in `packages/router/src/lib/remoteMethods.ts` drops non-string entries from
`defaultParamValues` before serialization. The loss is inert — nothing on either side ever reads
these fields (upstream restores through `code` alone, via `buildFactoryFromCode`), and they are pure
functions of `familyTag`, so they carry no per-entry information. But it is a workaround for a type
that should not have needed one, and it will silently keep working even if upstream later starts
putting meaningful data there.

## Suggested fixes (upstream)

1. **Split the type.** Keep `args: CompiledFnArgs` and give defaults their own:
   `defaultParamValues: {vλl?: unknown; [key: string]: unknown}`. Honest, minimal, unblocks
   consumers.
2. **Drop both from `CompiledFnData` entirely.** They are derivable from `familyTag` via
   `familyMeta`; exposing that table as a lookup would let consumers reconstruct them bit-identically
   with zero wire bytes, and removes the question at the root. Larger change, better end state.

## Done when

- Filed in the `ts-run-types` repo with the repro above.
- When it ships: delete `toWireArgs` and let the real values through (or stop sending the fields).
