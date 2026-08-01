# Upstream: `CompiledFnArgs` cannot describe its own values

**Status:** todo — upstream half FIXED, mion half blocked on a release
**Type:** upstream bug report → now a mion cleanup
**Created:** 2026-07-27
**Updated:** 2026-08-01 — upstream fix landed as
[MionKit/ts-run-types#308](https://github.com/MionKit/ts-run-types/pull/308)
**Found while:** deleting `rtResolver.ts` ([../done/rtresolver-removal.md](../done/rtresolver-removal.md))

## The bug (as filed, and correct on `@ts-runtypes/core` 0.11.0)

`CompiledFnData` types **both** `args` and `defaultParamValues` as `CompiledFnArgs`
(all-string). `args` genuinely is all-strings. `defaultParamValues` is not, for any family —
`{vλl: undefined}`, `{vλl: undefined, pλth: [], εrr: []}`, `{vλl: undefined, θpts: {}}`,
`{vλl: undefined, sεr: undefined}`, `{vλl: undefined, dεs: undefined}` — each laundered through
an `as unknown as CompiledFnArgs` cast. `familyMeta` is the only writer of either field, so 100%
of entries carry a `defaultParamValues` the declared type rejects.

Two walls for a consumer that builds codecs over the wire form (mion ships these to the browser):

1. **Validation.** `createValidateFn<CompiledFnData>()` rejects every real entry — the required
   `vλl` slot holds `undefined`, not a string.
2. **Serialization.** The `sj` JIT stringifier compiled from `CompiledFnData` has no
   undefined-guard on a required property, so it emits the literal text `"vλl":undefined` —
   syntactically invalid JSON. The receiver's `JSON.parse` throws on every entry.

## What upstream actually did — NOT either fix we suggested

We proposed (1) widen `defaultParamValues` to `unknown` values, or (2) drop both fields as
derivable from `familyTag`. **Both were wrong**, and the reason matters for mion:

`defaultParamValues` is consumed when a receiver rebuilds the function via `new Function(...)`,
which is exactly why it was typed as strings. The Go emitter's `ArgSpec` is the authority:

```go
// Key is the conceptual slot ("vλl", "pλth", "εrr"); Name is the JS identifier
// in the emitted signature; Default is the JS-source default expression
// (empty for no default).
type ArgSpec struct{ Key, Name, Default string }
```

Both tables are **JS source fragments**, describing the emitted
`function verr_<hash>(v, pth=[], er=[])`. So `CompiledFnArgs` was correct all along — the JS
mirror in `entryTuple.ts` had drifted to storing real runtime values where source text belongs.

Upstream therefore **kept the type** and corrected the values:

| family | `args` (identifiers) | `defaultParamValues` (source text) |
| --- | --- | --- |
| value-shaped (`val`, `pj`, `rj`, `cj`, `ces`, `fmt`, …) | `{vλl:'v'}` | `{vλl:''}` |
| error-shaped (`verr`, `uke`) | `{vλl:'v', pλth:'pth', εrr:'er'}` | `{vλl:'', pλth:'[]', εrr:'[]'}` |
| `huk` | `{vλl:'v', θpts:'opts'}` | `{vλl:'', θpts:'{}'}` |
| `tb` | `{vλl:'v', sεr:'Ser'}` | `{vλl:'', sεr:''}` |
| `fb` | `{vλl:'ret', dεs:'Des'}` | `{vλl:'', dεs:''}` |

An empty string means "this parameter takes no default", mirroring Go's convention. No type was
widened, no field removed.

## Consequences for mion

**Our note that "nothing reads these values, so the loss is inert" was wrong in principle.**
They are not derivable bookkeeping — they are the default expressions a client needs to
reconstruct a signature. Today nothing on our client side reads them (we restore through `code`
via `buildFactoryFromCode`), so no outage was caused, but the field is meaningful and must be
forwarded verbatim once available.

Two things about `toWireArgs`
([`packages/router/src/lib/remoteMethods.ts`](../../packages/router/src/lib/remoteMethods.ts)),
in the order they bite:

1. **On the current pin (0.11.0) it ships wrong data.** Non-string values are dropped, so
   `pλth: []` and `εrr: []` vanish; then `if (!('vλl' in out)) out.vλl = 'v'` injects the
   *identifier* `'v'` into a table of *default expressions*. Every error-shaped entry goes over
   the wire as `defaultParamValues: {vλl: 'v'}` — three slots reduced to one, and that one
   semantically wrong. Inert only because nothing reads it.
2. **After the upgrade it becomes an identity no-op.** Every value is a string, so the filter
   copies all of them and the `vλl` fallback is unreachable. Dead weight, plus a fallback that
   would inject a wrong value if it ever fired again.

## Done when

- [x] Filed in the `ts-run-types` repo with the repro above.
- [x] Upstream fix shipped ([ts-run-types#308](https://github.com/MionKit/ts-run-types/pull/308)):
      the five drifted values corrected, all five `as unknown as CompiledFnArgs` casts removed,
      and the source-text contract documented on the type so it cannot drift again.
- [ ] **Blocked on a release.** `@ts-runtypes/core` is pinned to `0.11.0` in `client`, `core`,
      `drizze`, `examples` and `router`; the fix is on `main`, unreleased. Bump all five pins to
      the first release that contains it.
- [ ] Delete `toWireArgs` and pass `comp.defaultParamValues` through unchanged (spread it like
      `args` already is: `defaultParamValues: {...comp.defaultParamValues}`). Drop its long
      explanatory comment with it.
- [ ] Add a round-trip assertion so this cannot regress silently: a metadata-route payload must
      survive `JSON.parse(JSON.stringify(…))` with **every** `defaultParamValues` slot intact.
      Assert on slot presence, not `toEqual` — `JSON.stringify` silently drops undefined-valued
      keys and `toEqual` treats a missing key and an undefined one as equal, so a naive
      round-trip assertion passes even when the bug is present.
