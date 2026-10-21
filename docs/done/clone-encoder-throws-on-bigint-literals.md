---
type: fix
spec: guidelines
status: done
created: 2026-09-13
updated: 2026-09-13
---

# The clone encoder throws on an array of bigint literals

## Intent

`createJsonEncoderFn<T>(undefined, {strategy: 'clone'})` throws at runtime for a type whose
bigint values are declared as LITERALS rather than as `bigint`. A plain `bigint` is converted to
a decimal string as it should be; a bigint literal is handed to native `JSON.stringify`
untransformed, which refuses it.

Reproduces today:

```ts
const encode = createJsonEncoderFn<(1n | 2n)[]>(undefined, {strategy: 'clone'});
encode([1n, 2n]);
// TypeError: Do not know how to serialize a BigInt
```

This is a shipped encoder failing on a type the type system accepts, so it is a bug rather than a
limitation. Symbol literals look like the same case and should be checked alongside.

## Direction

What was checked:

- **The root is one missing flavour check.** `extraProofRecursive`
  (`ts-go-runtypes/internal/cachegen/typefunctions/json_prepare_safe.go:646-650`) answers `true`
  for `reflection.KindLiteral` unconditionally:

  ```go
  case reflection.KindString, reflection.KindNumber, reflection.KindBoolean,
      reflection.KindNull, reflection.KindEnum, reflection.KindTemplateLiteral,
      reflection.KindLiteral:
      return true
  ```

  A bigint or symbol literal is NOT extra-proof: it needs the same transform its non-literal
  sibling gets. `emitLiteralPrepareForJson` and `emitLiteralRestoreFromJson` both branch on
  `literalFlavour`, so the emitters know the difference and only this predicate does not.

- **The decode side already gets it right.** `compactFromJsonNoopRecursive` and
  `restoreJsonSafeNoopRecursive` (`noop_types.go`) both gate on
  `literalFlavour(rt) == litPrimitive`. Only the `pjs` shortcut is missing it.

- **Why the suite is green.** `emitArrayPrepareForJsonSafe` early-returns identity on
  `isExtraProof(child)`, and the noop predicate uses the same helper, so the emitter and the
  predicate agree with each other and no oracle catches the disagreement with reality.

- **The blast radius is wider than arrays.** `isExtraProof` also gates tuple arms and the
  `Object.keys(v).length === N` object fastpath, so an object of only bigint-literal props may
  return the input by reference and hit the same throw. Worth mapping every `isExtraProof` caller
  before choosing where the guard goes.

The implementer plans the rest. Start from a failing test for each shape that reproduces (array,
tuple, object fastpath, union of literals), then decide whether the fix belongs in
`extraProofRecursive` itself or at each call site.

## Done when

The clone encoder round-trips a bigint literal exactly as it round-trips a plain `bigint`, symbol
literals behave consistently with plain symbols, every shape that reaches the same shortcut is
covered by a test, and the encode and decode predicates agree about what a literal costs.

## Plan — one flavour check in extraProofRecursive (approved 2026-09-13)

### What shipped

The root was the single predicate arm the Direction section pointed at.
`extraProofRecursive` (`ts-go-runtypes/internal/cachegen/typefunctions/json_prepare_safe.go`)
now splits `KindLiteral` out of the always-true group:

```go
case reflection.KindLiteral:
    return literalFlavour(rt) == litPrimitive
```

The fix went into the predicate rather than each call site, so every caller inherits it. The
`isExtraProof` doc comment, which claimed "bigint after transform" was extra proof, was
corrected alongside.

Nothing else in the emitter changed. The array `.map`, the tuple rebuild and the object clone
all already compile their children through `safeChildExpr`, which reaches
`emitLiteralPrepareForJsonSafe` and its correct bigint / symbol transforms. Only the
by-reference shortcut in front of them went away.

### Blast radius, confirmed

All three `isExtraProof` callers were broken and all three are fixed by the one change:

| Caller | Shape | Emitted before |
| --- | --- | --- |
| `emitArrayPrepareForJsonSafe` | `(1n \| 2n)[]` | `return v` |
| `emitTuplePrepareForJsonSafe` | `[1n, 2n]` | `return v` |
| `emitObjectPrepareForJsonSafe` (`allExtraProof`) | `{a: 1n; b: 2n}` | `if (Object.keys(v).length === 2) return v; …` |

A root union `1n | 2n` and a root `1n` were already correct: the union emitter never consults
the predicate, and a root literal reaches its own emitter arm. Both are covered anyway.

### Symbol literals

The Intent asked for symbol literals to be checked alongside, and for them to behave
consistently with plain symbols. Read literally that would mean making them unsupported,
since a bare `symbol` is `CodeNS` in all four JSON families. That is NOT what shipped, because
symbol literals are deliberately supported everywhere else: all four families encode them as
`'Symbol:' + description` and `emitLiteralRestoreFromJson` rebuilds them with `Symbol(...)`.
The consistency that was actually missing is the one delivered here. A symbol literal stops
being extra proof, exactly as a bare symbol already was, so the clone strategy now agrees with
mutate, direct and compact instead of silently emitting `[null]` where they emit
`["Symbol:tag"]`.

### Tests

Go, `ts-go-runtypes/internal/cachegen/typefunctions/json_prepare_safe_literal_test.go`:
the predicate tables for `isExtraProof` and `isNoopForPrepareJsonSafe` (primitive literals
still true, bigint / symbol literals now false), plus pinned emitted bodies for the array,
tuple, object, array-of-union and array-of-symbol-literal shapes. Every one of them fails
against the pre-fix predicate.

Vitest, as `SerializationCase` records so each runs through all four encoders, both decoders,
binary and the value-first schema forms:

- `Arrays.ts` → `array_bigint_literal`, the reported repro
- `Tuples.ts` → `tuple_bigint_literal`
- `Objects.ts` → `object_bigint_literal_props`, the key-count fastpath
- `Atomic.ts` → `literal_bigint`, which was already green; it pins the root shape beside the
  existing `literal_string` / `literal_number` / `literal_boolean`

No Vitest case for symbol literals: two `Symbol('x')` instances are never equal, so a
round-trip assertion in that suite cannot pass. Symbol-literal coverage is the Go
emitted-code test.

### Docs

None. This is a bug fix that makes the clone strategy match the three strategies the website
already documents; nothing on the site described the broken behaviour.
