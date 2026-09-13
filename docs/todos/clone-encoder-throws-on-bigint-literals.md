---
type: fix
spec: guidelines
status: ready
created: 2026-09-13
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
