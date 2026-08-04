---
type: fix
spec: guidelines
status: done
created: 2026-08-04
completed: 2026-08-04
---

# Keep the format sentinels out of a branded type's string keys

## Problem

Every branded type carried its metadata as an optional STRING property on an
intersection member:

```ts
type TypeFormat<Base, Name, Params, Brand> = Base & {
  readonly __rtFormatName?: Name;
  readonly __rtFormatParams?: Params;
};
```

`keyof (A & B)` is `keyof A | keyof B`, so those names were part of the branded
type's key set. On a string format nobody notices. On the STRUCTURAL formats —
`FormattedObject<User, P>` / `FormattedArray<T, P>`, the public type-first
spelling of the JSON Schema object/array keywords — the thing being branded is
the consumer's own domain type, and enumerating its keys is an ordinary
operation:

```ts
type BoundedUser = FormattedObject<User, {minProperties: 1}>;
type K = keyof BoundedUser; // 'id' | 'name' | '__rtFormatName' | '__rtFormatParams'
```

## What shipped

The sentinel keys are now `unique symbol`s, declared in
`src/runtypes/sentinelKeys.ts` and referenced with `import type` at every use
site. All eight moved together (`__rtFormatName`, `__rtFormatParams`,
`__rtFormatBrand`, `__rtNot`, `__rtContains`, `__rtPatternProps`,
`__rtPropNames`, `__rtOneOf`) — a partial migration would have split ids.

Result, pinned by `assertionsStructuralBrandKeys` in
`test/types/typesafety.test.ts`:

| operation | before | after |
| --- | --- | --- |
| `Extract<keyof T, string>` | leaked both sentinels | clean |
| object spread `{...value}` | leaked both sentinels | clean |
| string-constrained key helper | leaked | clean |
| string-keyed mapped type | leaked | clean |
| bare `keyof T` | leaked (as strings) | still yields them, as SYMBOLS |
| assignability / property access | unaffected | unaffected |

The residue is unavoidable: a property cannot be hidden from `keyof` at all. But
everything that treats an object as data iterates STRING keys, and those are now
clean. The remaining `keyof` case is pinned with `@ts-expect-error`, so if
TypeScript ever changes it the directive goes unused and TS2578 reds the file.

Zero runtime footprint: `declare const` emits nothing and `import type` is
elided, verified against emitted JS. Nothing is imported or constructed at run
time.

## Two things the original spec got wrong

**"It moves every id."** It does not. `memberIDs` (typeid.go) already SKIPPED
the sentinel props, and the format folds into the id as `annotation.Name` plus
its params — the property key never reaches the hash. Confirmed by
`TestSymbolKeyedSentinel_MatchesStringKeyed`, which resolves the same type under
both spellings and asserts one id. No golden fixture needed re-baselining.

**"It is a PR of its own."** The Go side turned out to be one file: every
comparison lives in `typeid/formats.go`, so the change is a single
`isSentinelProp` matcher applied at ~11 sites.

## The compiler-internal dependency, and its tripwire

tsgo names a symbol-keyed property `InternalSymbolNamePrefix + "@" + <the symbol
declaration's name> + "@" + <a per-program symbol id>`
(`checker.getESSymbolLikeTypeForNode`). That is a compiler internal, not a public
API, so the resolver depends on it in exactly one place and defends it twice:

- the prefix is taken from the upstream `ast.InternalSymbolNamePrefix` constant
  rather than spelled out, so a change to it surfaces as a compile-time change;
- `TestSymbolKeyedSentinel_MatchesStringKeyed` resolves a symbol-keyed brand
  through the REAL checker and asserts it is recognised AND lands on the same id
  as the string-keyed spelling.

That test is the whole guard, because the failure mode without it is silent and
total: no sentinel matches, every branded type degrades to its base, ids shift
wholesale, and nothing goes red. It was verified to fail — with a message naming
the scheme that stopped matching — by deliberately breaking the matcher.

## Why the string spelling still works

`isSentinelProp` accepts BOTH the symbol key and a plain string property of the
same name. That is deliberate, not a migration leftover:

- hand-written `.d.ts` fixtures (`internal/testfixtures/`) and the Go test
  overlays can spell a sentinel literally with no symbol declaration;
- the fuzz suites' type-first oracle stays INDEPENDENT of the shipped types —
  importing them would make the convergence check tautological;
- the harnesses that slice a `#region …-extract` block out of src keep measuring
  the REAL machinery; they just re-declare the key symbols by name
  (`SENTINEL_KEYS_PREAMBLE`), since a slice cannot carry an import.

Both spellings fold to one id, which is itself asserted, so the two-spelling
rule cannot silently drift into two behaviours.

## Gates

`pnpm test` (10,481 passing), `go -C ts-go-runtypes test ./internal/...`,
`pnpm run lint`, `pnpm run format`, and the JSON Schema instantiation budgets
unchanged.
