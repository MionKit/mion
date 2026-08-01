# `CompiledFnArgs` cannot describe `defaultParamValues`

**Status:** done — but NOT as the spec framed it (see "The spec's diagnosis was
backwards" below).
**Type:** bug — the runtime VALUES were wrong, not the type
**Created:** 2026-07-28
**Completed:** 2026-08-01
**Found by:** `@mionjs/core`, which serializes `CompiledFnData` to the browser
([MionKit/mion#129](https://github.com/MionKit/mion/pull/129))

## The symptom (as originally reported, and accurate)

`packages/ts-runtypes/src/runtypes/types.ts` declares both slots as
`CompiledFnArgs` (all-string), and `familyMeta` laundered the values through
five `as unknown as CompiledFnArgs` casts:

```ts
const valueDefaults = () => ({vλl: undefined}) as unknown as CompiledFnArgs;
const errorDefaults = () => ({vλl: undefined, pλth: [], εrr: []}) as unknown as CompiledFnArgs;
// huk: ({vλl: undefined, θpts: {}})   tb: ({vλl: undefined, sεr: undefined})   fb: ({vλl: undefined, dεs: undefined})
```

The `as unknown as` was the tell. 100% of entries carried a
`defaultParamValues` the declared type rejects, so a consumer could neither
validate nor serialize what the library handed it.

## The spec's diagnosis was backwards

The original write-up concluded *"the **type** is what lies"* and proposed
either widening `defaultParamValues` to `unknown` values, or deleting both
fields as write-only bookkeeping.

**Both were wrong, and the owner caught it:** `defaultParamValues` is consumed
when a receiver rebuilds the function via `new Function(...)` — which is
precisely why it was typed as strings.

The Go emitter is the authority, and it is unambiguous
([`typefunctions/emitter.go`](../../ts-go-runtypes/internal/cachegen/typefunctions/emitter.go)):

```go
// Key is the conceptual slot ("vλl", "pλth", "εrr"); Name is the JS identifier
// in the emitted signature; Default is the JS-source default expression
// (empty for no default).
type ArgSpec struct{ Key, Name, Default string }
```

Both tables are **JS source fragments**, and the signature they describe is
`function verr_<hash>(v, pth=[], er=[])`. The authoritative values per family:

| family | `args` (identifiers) | `defaultParamValues` (source text) |
| --- | --- | --- |
| value-shaped (`val`, `pj`, `rj`, `cj`, `ces`, `fmt`, …) | `{vλl:'v'}` | `{vλl:''}` |
| error-shaped (`verr`, `uke`) | `{vλl:'v', pλth:'pth', εrr:'er'}` | `{vλl:'', pλth:'[]', εrr:'[]'}` |
| `huk` | `{vλl:'v', θpts:'opts'}` | `{vλl:'', θpts:'{}'}` |
| `tb` | `{vλl:'v', sεr:'Ser'}` | `{vλl:'', sεr:''}` |
| `fb` | `{vλl:'ret', dεs:'Des'}` | `{vλl:'', dεs:''}` |

So `CompiledFnArgs` (all-string) was **correct all along**. The JS mirror in
`entryTuple.ts` had drifted to storing real runtime values where source text
belongs. Widening the type would have enshrined the drift and permitted
non-JSON-safe values; deleting the fields would have removed something the
`new Function` reconstruction path needs.

Owner's constraint, which the string form satisfies by construction:
**`defaultParamValues` must be JSON-serializable with no conversion step.**

## What shipped

1. **The five drifted values corrected** to their JS-source form (`''`, `'[]'`,
   `'{}'`), matching Go's `ArgSpec.Default` exactly, including its "empty string
   = no default" convention.
2. **All five `as unknown as CompiledFnArgs` casts deleted** — the values now
   satisfy the declared type honestly, so the thunks are plain
   `(): CompiledFnArgs => ({…})`.
3. **The contract documented on the type**, so it cannot silently drift again:
   `CompiledFnArgs` now states that every value is a JS-source fragment (never a
   runtime value), that it mirrors Go's `ArgSpec`, and that this is what keeps
   `CompiledFnData` JSON-serializable with no conversion. `args` and
   `defaultParamValues` each carry their own note.

No type widened, no field removed, no Go change.

## The regression test

[`test/features/compiledFnDataWire.test.ts`](../../packages/ts-runtypes/test/features/compiledFnDataWire.test.ts) —
six cases over **real registered entries** (the file's own `createValidateFn` /
`createGetValidationErrorsFn` / `createJsonEncoderFn` / binary call sites
register several distinct family shapes, read back via `getRTFnCaches()`):

- every `args` / `defaultParamValues` value is a string
- every slot survives a JSON round-trip **with no conversion**
- the tables compose a parseable `new Function` signature
- the library's own `createValidateFn<CompiledFnData>()` +
  `createJsonEncoderFn<CompiledFnData>()` accept its own entries (static and
  reflection pair, per the marker rule)

**Verified to fail without the fix — four of six cases, each on a different
symptom.** The most diagnostic one proves the owner's point directly:

```
(verr) produced an unparseable signature: (v = undefined, pth = , er = )
  → SyntaxError: Unexpected token ','
```

The JSON case needed care: `JSON.stringify({vλl: undefined})` silently DROPS the
key, and `toEqual` treats a missing key and an undefined one as equal, so a
naive round-trip assertion passes with the bug present. It asserts **slot
preservation** instead, and then fails with
`expected ['pλth','εrr'] to deeply equal ['pλth','vλl','εrr']`.

## Verified

- `pnpm test` green — 242 files / 8300 tests (+6 from the new file).
- `pnpm run lint` + `pnpm run format` green.
- Zero `as unknown as CompiledFnArgs` remain in `packages/ts-runtypes/src`.
- No Go source changed; the Go side was already correct.

## Note for the consumer

`@mionjs/core` currently drops non-string entries from `defaultParamValues`
before serializing (`toWireArgs` in `packages/router/src/lib/remoteMethods.ts`).
That workaround is now unnecessary — every value is a string, and dropping them
would discard the default expressions needed to rebuild the signature.

## Done when

- [x] `defaultParamValues` has a type that admits its real values — achieved by
      correcting the values to match the (already correct) type.
- [x] The `as unknown as CompiledFnArgs` casts in `entryTuple.ts` are
      unnecessary and removed.
- [x] A round-trip test covers it: `createValidateFn` / `createJsonEncoderFn`
      over `CompiledFnData`, fed a real entry from each family, asserting the
      output parses and validates.
