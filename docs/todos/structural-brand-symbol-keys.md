---
type: fix
spec: guidelines
status: open
created: 2026-08-04
---

# Keep the format sentinels out of `keyof` (symbol-keyed brands)

## Problem

Every branded type carries its metadata as an optional property on an
intersection member:

```ts
type TypeFormat<Base, Name, Params, Brand> = Base & {
  readonly __rtFormatName?: Name;
  readonly __rtFormatParams?: Params;
};
```

`keyof (A & B)` is `keyof A | keyof B`, so those two property names are part of
the branded type's key set. On a string format nobody notices. On the STRUCTURAL
formats — `FormattedObject<User, P>` / `FormattedArray<T, P>`, now the public
type-first spelling of the JSON Schema object/array keywords — a consumer's own
domain type is the thing being branded, and key enumeration is an ordinary
operation on it:

```ts
type BoundedUser = FormattedObject<User, {minProperties: 1}>;
type K = keyof BoundedUser; // 'id' | 'name' | '__rtFormatName' | '__rtFormatParams'
```

Measured blast radius (pinned by `assertionsStructuralBrandKeys` in
`test/types/typesafety.test.ts`):

- **Leaks:** `keyof T`; anything derived from it (a `keyof`-typed
  `Object.keys` helper, a mapped type written over `Extract<keyof T, string>`);
  an object spread `{...value}`, whose result type keeps both sentinels.
- **Does NOT leak:** assignment (`const u: BoundedUser = {id, name}` compiles —
  the sentinels are optional); property access; a branded type used as a
  PROPERTY of another type, which leaves the enclosing `keyof` clean. `DataOnly`
  deliberately keeps sentinel-branded containers verbatim
  (`dataOnly.ts`), so it does not strip them either.

## Why it was not fixed in the keyword-first-formats PR

The property NAME is the wire contract with the resolver, in two places at once:

- `typeid/formats.go` looks the members up by literal name
  (`formatNameProp = "__rtFormatName"`, `formatParamsProp = "__rtFormatParams"`),
  as do the intersection-collapse and serialize paths;
- those names feed the structural id hash, so re-keying them moves EVERY
  format's id in the same change — every cached entry, every golden fixture,
  every convergence assertion.

The same applies to the type-carrying sentinels that follow the identical
convention: `__rtContains`, `__rtPatternProps`, `__rtPropNames`, `__rtNot`.

## Fix (sketch)

Move the sentinels to `unique symbol` keys, so `keyof` yields a symbol that no
string-key operation picks up:

```ts
declare const rtFormatName: unique symbol;
type TypeFormat<...> = Base & {readonly [rtFormatName]?: Name; ...};
```

Then, in one commit:

1. teach the Go readers to match the symbol-named property (tsgo spells a unique
   symbol member `__@<declName>@<symbolId>`, so match on the `__@rtFormatName@`
   PREFIX, and pin that spelling with a Go test — the numeric suffix is
   per-program);
2. re-key every sentinel together (`__rtFormatName`, `__rtFormatParams`,
   `__rtContains`, `__rtPatternProps`, `__rtPropNames`, `__rtNot`) — a partial
   migration splits ids instead of failing;
3. regenerate every golden fixture and re-baseline the id assertions;
4. flip the three `@ts-expect-error` pins in `assertionsStructuralBrandKeys` to
   positive assertions (they red as TS2578 the moment the leak closes, which is
   the intended prompt);
5. check the fuzz preambles (`FUZZ_FORMAT_PREAMBLE`, the json-schema stand-ins),
   which spell the sentinels raw.

## Risk / size

Large. It touches the id hash — the single most load-bearing invariant in the
repo — and every fixture derived from it, and it depends on a tsgo-internal
naming detail for symbol-keyed properties. Worth doing as its own PR with no
other change riding along, gated on the full JS suite plus
`go -C ts-go-runtypes test ./internal/...`.

Not urgent: nothing is unsound today, assignment and property access are
unaffected, and the leak is now pinned by test rather than merely known.
