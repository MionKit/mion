---
type: fix
spec: full-plan
status: done
created: 2026-09-13
---

# The clone strategy has to strip both ways

## Problem

A route named one `encoder` strategy per direction, but only the encode side honoured it. Every
non-compact strategy decoded with the same family (`packages/router/src/types/encoder.ts:42`):

```ts
type DecodeFamily<S> = S extends 'compact' ? 'cjr' : S extends string ? 'rj' : never;
```

`rj` is the plain restore: it transforms the declared members where they sit and touches nothing
else. Put plainly, mion compiled the PRESERVE decoder for `clone`, a stripping strategy. The Go
table names the two apart (`ts-go-runtypes/internal/constants/constants.go`):

```go
"jsonDecoder|strip":    {"rj", "ukuw"},
"jsonDecoder|preserve": {"rj"},        // what clone got
```

`clone` promises undeclared keys are dropped by construction. That promise only covered the bytes
mion sent. Any other caller (curl, another language, a patched client) could post
`{name, surname, extra}` to a `clone` route and `extra` reached the handler.

## What shipped

A new compiled family, `rjs` (`restoreFromJsonSafe`, fnHash `IRLg`), the decode mirror of `pjs`:
it rebuilds each object from the declared shape while applying the restore transforms, so an
undeclared key is gone rather than blanked. `clone` decodes with it. `mutate`, `direct` and
`compact` decode exactly as before.

| Strategy | Encode | Decode | Sending | Receiving |
| --- | --- | --- | --- | --- |
| `clone` | `pjs` | `rjs` (was `rj`) | dropped | dropped (was kept) |
| `mutate` | `pj` | `rj` | kept | kept |
| `direct` | `sj` | `rj` | dropped | kept |
| `compact` | `cj` | `cjr` | dropped | dropped |

Additive by construction: `rj`, `ukuw`, `cjr`, `sj`, `createJsonDecoderFn` and `createParseFn` all
behave exactly as before, and no `createJsonDecoderFn` strategy composes the new family. It is
reachable only through the marker (`InjectTypeFnArgs<T, 'rjs'>`), the way `pjs` and `cjr` are.

### The emitter

`ts-go-runtypes/internal/cachegen/typefunctions/json_restore_safe.go`. FIVE arms diverge from
`rj`, not the three the plan predicted:

- **Object literal, class/`SubKindNone`** — the keyed rebuild, `emitObjectCompactFromJson`'s shape
  with `propertyAccessor` in place of the positional accessor.
- **Index signature** — CONDITIONAL. Delegates to `rj`'s in-place walk when the declaration
  already admits every key, rebuilds otherwise. `cjr` punts these to the in-place walk, which
  would have been exactly wrong here. Four rebuild triggers: a template-literal or
  patternProperties key, a symbol-keyed signature, a function-valued signature, and a dropped
  declared sibling (G6). In doubt it rebuilds, because a needless rebuild costs an allocation and
  a wrong delegation leaks keys.
- **Union** — gated on `atomicOnlyJsonIdentity()`, the CLONE ENCODER's gate, not `rj`'s
  `!AtomicNeedsTuple` early-out. That correction mattered: a union of plain objects is fully
  JSON-compatible so it never envelopes, and `rj`'s gate would have stripped nothing in the
  commonest case. Two body shapes, enveloped and bare.
- **Tuple** — guarded with `Array.isArray`. `rj` is a noop for a tuple of plain objects and never
  runs on a malformed body; `rjs` is live for those same types, so without the guard an absent
  body reached `v[0]` and threw.

Three things the rebuild keeps: `unsafeKeyThrow` (the DECODER rule) rather than `pjs`'s
`unsafeKeySkip`; index-signature handling modelled on `pjs`, which keeps the keys a signature
legitimately admits; and a declared-name skip built from `collectSiblingNamedKeys` directly rather
than `siblingNamedSkipCode`, which returns "" in silence when nobody published its context item.

### One gap shared with `pjs`, closed separately

`rjs` carries the same `atomicOnlyJsonIdentity()` early-out `pjs` has, so for a union like
`{a: string}[] | number` neither end stripped. This change did not touch that gate on either side;
a follow-up narrows the gate once for all three families that read it.

## Behaviour change worth knowing

A wrong-typed param on a `clone` route now answers a **validation error** instead of a
serialization error. Same 422, and the payload is more precise:

```
- type: 'serialization-error', errorData: {deserializeError: 'Parameters might be of the wrong type.'}
+ type: 'validation-error',    errorData: {typeErrors: [{path: [0], expected: 'objectLiteral'}]}
```

This is inherent to a rebuilding decoder and follows the decode doctrine: convert only the wire
form, leave anything else for validate. Nine platform-adapter tests and two router tests were
re-pinned to it. `strictTypes` moved with it: a stripping strategy deletes the key before the
unknown-key check runs, so `mutate` is now the only strategy where that check can fire, and the
router tests say so.

## A related fix that came with it

`deserializeBodyParamsOrThrow` (`packages/router/src/dispatch.ts`) handed the FROZEN
`EMPTY_PARAMS` sentinel to the decoder when no params arrived. The decoders mutate, so a live
decoder threw on it and reported a serialization error for what is really a missing body. `rj`
only hid this by being a noop for non-transforming types. It now returns the sentinel without
decoding.

## Tests

- Go: the new family joined `must_validate_json_test.go`'s security oracle, the
  `noop_predicate_test.go` soundness corpus, the unsafe-key, pattern-props, property-dataonly and
  callable-interface family lists, and the diagnostic-code maps (it delegates `rj`'s codes).
  Family count 22 → 23, fnHash key count +1.
- `getRTFunctionRecovery.test.ts`: paired static / reflection tests per the Marker rule, with the
  same-compiled-fn equivalence assert, plus a case pinning that a declared key with no transform
  is still copied (leaving it out would DELETE a declared key, the worst failure available here).
- `encoder.spec.ts`: a new "what arrives at the handler" block covering clone dropping an
  undeclared key at the top level and nested, the declared values still restored, `mutate` still
  receiving extras, an index signature keeping its own keys, and a prototype-named key refused.
- Fuzz: a `rebuild` lane on the round-trip oracle (the clone wire read by `rjs`), so every
  generated shape checks that the rebuild loses nothing. The runner now also fails when that lane
  does not wire, since a silently absent lane reports green while checking nothing. The
  "undeclared keys are dropped" half is covered by the hand-written tests, which can inject a key
  the generator never produces.

## Docs

The website's strategy table had one "Unknown keys" column, which read as a property of the
strategy while being true in one direction only. It is now two columns, sent and received, with
all four rows filled in honestly, plus a paragraph on why the two ends differ and a note on the
arrival direction in the trimmed-return section.

## Not done here

`direct` still keeps `rj`, so it drops what it sends and keeps what it receives; the docs table
now says so. `createJsonDecoderFn`'s `strip` and `createParseFn`'s `strip` still compose `ukuw`
and still blank rather than delete. `ukuw` was not retired. Making the `huk` / `uke` slots
strategy-driven, and a lint rule for a `strictTypes` that can never fire, remain open.
