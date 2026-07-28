# `CompiledFnArgs` cannot describe `defaultParamValues`

**Status:** todo
**Type:** bug — public type is wrong about its own runtime values
**Created:** 2026-07-28
**Found by:** `@mionjs/core`, which serializes `CompiledFnData` to the browser
([MionKit/mion#129](https://github.com/MionKit/mion/pull/129))

## The bug

`packages/ts-runtypes/src/runtypes/types.ts:143-148`:

```ts
export type CompiledFnArgs = {
  vλl: string;
  [key: string]: string;
};
```

`CompiledFnData` types **both** slots as `CompiledFnArgs` (`types.ts:159-160`):

```ts
readonly args: CompiledFnArgs;
readonly defaultParamValues: CompiledFnArgs;
```

`args` genuinely is all-strings. **`defaultParamValues` is not — for any family.** `familyMeta`
(`entryTuple.ts:481-525`) is the only writer of either field anywhere in the package, and it launders
the values through five explicit casts:

```ts
entryTuple.ts:463   const valueDefaults = () => ({vλl: undefined}) as unknown as CompiledFnArgs;
entryTuple.ts:465   const errorDefaults = () => ({vλl: undefined, pλth: [], εrr: []}) as unknown as CompiledFnArgs;
entryTuple.ts:495   huk: defaultParamValues: () => ({vλl: undefined, θpts: {}}) as unknown as CompiledFnArgs,
entryTuple.ts:504   tb:  defaultParamValues: () => ({vλl: undefined, sεr: undefined}) as unknown as CompiledFnArgs,
entryTuple.ts:510   fb:  defaultParamValues: () => ({vλl: undefined, dεs: undefined}) as unknown as CompiledFnArgs,
```

The `as unknown as` is the tell — the value is known not to satisfy the type. Every family routes
through one of these, so **100% of entries carry a `defaultParamValues` the declared type rejects**,
starting with `vλl: undefined` where the type says `vλl: string` and does not allow `undefined`.

## Why it has gone unnoticed

Nothing inside the package builds a validator, encoder or decoder over `CompiledFnData`. Grepping
`packages/ts-runtypes/src` for it returns only the declaration, a doc comment in `index.ts`, and one
indexed access (`entryTuple.ts:220`). The values are written and read back as opaque bookkeeping, so
the inaccuracy never surfaces internally.

It surfaces immediately for a consumer, because `CompiledFnData` is **public API** (`index.ts:27`) and
documented as the closure-free **wire** form — which is an invitation to build exactly the codecs the
package itself never builds.

## Two walls a consumer hits

**1. Validation.** `createValidateFn<CompiledFnData>()` emits `typeof v === 'string'` for the required
`vλl` with no undefined-guard, and applies the index-signature check to every own enumerable key.
`undefined`, `[]` and `{}` all fail. So a consumer cannot validate the object the library just handed
it.

**2. Serialization, which is worse — the emitted JSON is syntactically invalid.**

`json_stringify.go:526-527`, the non-optional / non-enumerability-guarded branch, has no undefined
check by construction:

```go
if rt.Optional {
    return RTCode{Code: "(" + accessor + " === undefined ? '' : " + propPrefix + "+" + childRT.Code + "+" + sepCode + ")", …}
}
return RTCode{Code: propPrefix + "+" + childRT.Code + "+" + sepCode, …}   // ← required prop: no guard
```

`vλl` is required, so it takes the second branch. Its `KindString` leaf emits `JSON.stringify(v)`
(`json_stringify.go:89-92`), and `JSON.stringify(undefined)` returns the **value** `undefined`, which
string-concatenation renders as the text `undefined`:

```
'"vλl":' + JSON.stringify(undefined) + ','   →   '"vλl":undefined,'

JSON.parse('{"vλl":undefined}')
  SyntaxError: Unexpected token 'u', "{"vλl":undefined}" is not valid JSON
```

(Verified by running it, not reasoned.) So a consumer that stringifies a `CompiledFnData` with the
library's own compiled stringifier produces a payload the receiver cannot parse — on every entry, not
an edge case. That is a total failure of the wire path, not a degradation.

The file header at `json_stringify.go:471` already states the intent — *"carry a `"name":undefined`
slot (invalid JSON)"* is called out as the thing to avoid. The emitter is right; the **type** is what
lies, so the emitter is never told to guard.

## Suggested fixes

1. **Split the type** — minimal, unblocks consumers:
   ```ts
   readonly args: CompiledFnArgs;                                    // genuinely all-string
   readonly defaultParamValues: {vλl?: unknown; [key: string]: unknown};   // or a CompiledFnDefaults alias
   ```
   Then the emitter sees an optional `vλl` and guards it, validation stops rejecting real values, and
   the five `as unknown as` casts can go.

2. **Drop both fields from `CompiledFnData` entirely** — larger, better end state. They are pure
   functions of `familyTag`: `familyMeta` is the only writer, so nothing per-entry is encoded in
   them. Exposing that table as a lookup would let a consumer reconstruct both bit-identically with
   zero wire bytes, and removes the question at the root.

Option 2 is worth considering seriously given the fields appear to be write-only in practice — a
survey of whether anything anywhere actually reads `args` / `defaultParamValues` at runtime would
settle it.

## What the consumer does meanwhile

`@mionjs/core` drops non-string entries from `defaultParamValues` before serializing
(`toWireArgs`, `packages/router/src/lib/remoteMethods.ts`). The loss is inert for mion — it restores
functions from `code` alone — but it is a workaround for a type that should not need one, and it will
keep silently discarding data if this field ever starts carrying something meaningful.

## Done when

- `defaultParamValues` has a type that admits its real values (or the field is gone).
- The `as unknown as CompiledFnArgs` casts in `entryTuple.ts` are unnecessary and removed.
- A round-trip test covers it: build `createValidateFn`/`createJsonStringifyFn` over `CompiledFnData`,
  feed it a real entry from each family, and assert the output parses and validates. That test is
  what would have caught this.
