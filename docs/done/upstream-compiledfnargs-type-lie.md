# `CompiledFnArgs` — upstream fixed the values, mion dropped `toWireArgs`

**Status:** done
**Created:** 2026-07-27
**Shipped:** 2026-08-20, on `@ts-runtypes/core` 0.12.0 (see
[ts-runtypes-0.12.0-upgrade.md](ts-runtypes-0.12.0-upgrade.md))
**Found while:** deleting `rtResolver.ts` ([rtresolver-removal.md](rtresolver-removal.md))

## What the bug was

`CompiledFnData` types both `args` and `defaultParamValues` as `CompiledFnArgs` (all-string). On
0.11.0 and earlier `defaultParamValues` held real runtime values — `{vλl: undefined}`,
`{vλl: undefined, pλth: [], εrr: []}` and friends — each laundered through an
`as unknown as CompiledFnArgs` cast. mion ships these to the browser on the methods-metadata
route, and they broke it two ways: `createValidateFn<CompiledFnData>()` rejected every entry, and
the `sj` JIT stringifier emitted the literal text `"vλl":undefined`, which is invalid JSON.

mion worked around it with `toWireArgs` in `packages/router/src/lib/remoteMethods.ts`, which
dropped non-string entries and then backfilled `out.vλl = 'v'`.

## What upstream actually did — NOT either fix this spec proposed

This spec proposed widening `defaultParamValues` to `unknown` values, or dropping both fields as
derivable from `familyTag`. **Both were wrong, and the reason matters.**

`defaultParamValues` is consumed when a receiver rebuilds the function via `new Function(...)`,
which is exactly why it was typed as strings. The Go emitter's `ArgSpec` is the authority: `Key` is
the conceptual slot, `Name` the JS identifier in the emitted signature, `Default` the JS-source
default expression. Both tables are **JS source fragments** describing the emitted
`function verr_<hash>(v, pth=[], er=[])` — not runtime values.

So `CompiledFnArgs` was correct all along; the JS mirror in `entryTuple.ts` had drifted. Upstream
kept the type and corrected the values, deleting all five casts and documenting the contract on the
type so it cannot drift again. Verified in the 0.12.0 tarball: zero
`as unknown as CompiledFnArgs` casts remain, `valueDefaults` is `{vλl: ''}` and `errorDefaults` is
`{vλl: '', pλth: '[]', εrr: '[]'}`. An empty string means "no default", mirroring Go's convention.

## This spec's own claim was wrong

It said *"nothing reads these values, so the loss is inert"* and called them derivable bookkeeping.
**That was wrong in principle.** They are the default expressions a client needs to reconstruct a
signature. No outage resulted — mion's client restores through `code` via `buildFactoryFromCode` —
but the field is meaningful and must be forwarded verbatim.

## Evidence: the workaround was corrupting every entry, not just error-shaped ones

Captured from the real metadata-serialization path before and after the upgrade:

| familyTag | `args` (identifiers) | `defaultParamValues` BEFORE | `defaultParamValues` AFTER |
| --- | --- | --- | --- |
| `val` / `pj` / `rj` / `sj` | `{vλl:'v'}` | `{vλl:'v'}` | `{vλl:''}` |
| `verr` / `uke` | `{vλl:'v', pλth:'pth', εrr:'er'}` | `{vλl:'v'}` | `{vλl:'', pλth:'[]', εrr:'[]'}` |
| `huk` | `{vλl:'v', θpts:'opts'}` | `{vλl:'v'}` | `{vλl:'', θpts:'{}'}` |
| `tb` | `{vλl:'v', sεr:'Ser'}` | `{vλl:'v'}` | `{vλl:'', sεr:''}` |
| `fb` | `{vλl:'ret', dεs:'Des'}` | `{vλl:'v'}` | `{vλl:'', dεs:''}` |

Worse than this spec originally described: **every** family shipped `{vλl: 'v'}`, not just the
error-shaped ones. `verr`/`uke` lost two of three slots, `huk` lost `θpts`, `tb` lost `sεr`. And
`fb` is the clearest proof the backfill fabricated data — its value parameter is named `ret`, so
the injected `'v'` named no parameter in that signature at all.

## What shipped

- Bumped `@ts-runtypes/*` to 0.12.0 (9 pins across 7 packages).
- Deleted `toWireArgs` and its explanatory comment — which carried the same wrong "loss is inert"
  claim — and replaced the call site with `defaultParamValues: {...comp.defaultParamValues}`,
  mirroring how `args` was already spread.
- Added a round-trip regression test in `packages/router/src/lib/remoteMethods.spec.ts`: a
  metadata payload must survive `JSON.parse(JSON.stringify(…))` with every `defaultParamValues`
  slot intact.

**The test asserts on slot PRESENCE, not `toEqual`** — deliberately. `JSON.stringify` silently
drops undefined-valued keys and `toEqual` treats a missing key and an undefined one as equal, so a
naive value-wise round-trip check passes even with the bug present. It compares the key SET of
`defaultParamValues` against the key set of `args` (both describe the same emitted signature) and
requires every value to be a string. Confirmed to fail when the old mangling is reintroduced, and
only that test fails.
