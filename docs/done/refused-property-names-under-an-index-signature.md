---
type: fix
spec: guidelines
status: done
created: 2026-09-16
---

# Prototype-named properties stop being a special case

## Intent

Every decoder, validator and rebuilding encoder refused three property names
(`ts-go-runtypes/internal/reflection/unsafe_names.go`):

```go
var UnsafePropertyNames = []string{"__proto__", "prototype", "constructor"}
```

A decoder threw `[mion] Unsafe property name: <key>` on any of them, whatever the type said.
Measured in node, against the exact shapes the generated code uses:

```
data key, the shape the rebuild loops use   declared property, the dotted read
r["__proto__"]   = v  prototype CHANGED         ({}).__proto__   -> Object.prototype
r["constructor"] = v  plain own key             ({}).constructor -> [Function: Object]
r["prototype"]   = v  plain own key             ({}).prototype   -> undefined
```

So `prototype` was harmless in both positions, `constructor` was harmless as a data key, and only
`__proto__` was ever a hazard. What the rule cost was legitimate data: a `Record<string, string>`
holding form fields, tags or a translation map could not carry a key named `constructor` or
`prototype`, and the request failed on data the type declared as valid.

It also punished too hard. A declared name did not drop the MEMBER, it killed the whole type: the
entry rendered as an alwaysThrow factory. A function-valued property, the same situation, drops with
a Warning and the rest of the type keeps working.

## What shipped

**The rule now:** `prototype` and `constructor` are ordinary property names in both positions.
`__proto__` is the only special name: refused as a data key under an index signature, and dropped as
a declared member the way any member that cannot cross the wire is dropped.

TypeScript ACCEPTS the declaration, which is what makes the Warning worth emitting. Measured:

```ts
interface A {ok: number; __proto__: string}
const v: A = {ok: 1, __proto__: 'x'};  // tsc --strict, exit 0
Object.keys(v);                        // ['ok']
v.__proto__;                           // object, where the type promised string
```

So the type promises a value the runtime never carries, and nothing else tells you.

Route names are the one place all three are still refused: a route id is an object key on both ends
of the wire AND a method name on the client's proxy.

### Data keys

- `reflection/unsafe_names.go` narrowed to `__proto__`; the comment names both positions.
- Every emitter call site was untouched, since they all go through `unsafeKeyCheck` /
  `unsafeKeyThrow` / `unsafeKeySkip`.
- `packages/run-types/src/runtypes/dataView.ts` — `desSafePropName` narrowed to `__proto__`, which
  covers the binary road.

### Declared `constructor`, the presence guard

Every object inherits `constructor` from `Object.prototype`, so an absent own key reads as the Object
function and a plain `!== undefined` test calls the member present. The emitter already owned the
right test, used for `Error`'s `name`/`message`/`stack`:

```go
// accessors.go
func propertyIsEnumerableGuard(v, name string) string
// -> Object.prototype.propertyIsEnumerable.call(v, "constructor")
```

- `isEnumerabilityGuarded` now also answers true for a member named `constructor`, via the new
  `isInheritedPropertyName`. No protocol or typeid field was added: the name is already part of the
  member id, so the id and the projection cannot drift on it, and unlike `NonEnumerable` this does
  NOT make the member optional.
- Three shared helpers replaced the scattered presence tests: `propertyPresenceTest`,
  `propertyAbsenceTest` and `namedPropertyPresenceTest` for the sites that carry a flattened slot.
  `namedPropertyInTest` covers the presence-without-a-value-check sites, since `'constructor' in {}`
  is also true through the prototype chain.
- Applied across validate, validationErrors, json_prepare, json_restore, json_restore_strip,
  formattransform, union_flat, union_flat_binary and unknownkeys_arms/has. The five families that
  already read `isEnumerabilityGuarded` (binary_to, clone_exact_shape, json_compact,
  json_prepare_clone, json_stringify) simply started firing for the new case.
- `fromBinary` needs nothing and is pinned as such: presence rides a wire bitmap rather than a read
  off the object, and it writes `ret.constructor = …`, an own key on a fresh object.
- One pre-existing gap on the same path was fixed: `buildSafeIndexSignatureObject` in
  `json_prepare_clone.go` ignored `presenceGuard`, so a guarded member in an object that also has an
  index signature was written unguarded.

### Declared `__proto__`, a Warning drop

- `strippedPropertyDrop` (`union_strip.go`) gained a name check at its top. One edit reaches validate,
  validationErrors, the six serializers, binary, the exact-shape clone and `noop_types.go`, because
  they all call it. New `SlotUnsafeNamePropDropped`, mapped to UPN001 in all nine family maps.
- `unsafeDeclaredMember` and the `module.go` alwaysThrow block were deleted.
- The unknown-keys walkers skip the member silently, the way they already skip a method.
- `CodeUnsafePropertyName` moved from the root-error block to the child-position drop Warning block;
  MRT005 became a Warning too, and the lint rules' defaults moved from `error` to `warn`.
- `packages/run-types/src/runtypes/dataOnly.ts` — the clause that already drops keys by key gained
  the name, so the type matches the runtime:
  ```ts
  [K in keyof T as K extends symbol | '__proto__' ? never : …]
  ```
- `compiler/routerrules/rules.go` narrowed to `__proto__`. Its class-constructor special case went
  with it: a class `constructor()` method is no longer a name the rule looks at.

### The router's error message

`packages/router/src/dispatch.ts` replaced every decoder error with fixed text, because a compiled
decoder's message can quote internal detail. The unsafe-key refusal cannot: it is mion's own constant
naming a key the caller sent. It is now surfaced as `deserializeError` and `publicMessage`;
everything else keeps the fixed text, and the "no engine text reaches the client" assertion still
holds.

### Fuzz oracles

Both demanded all three names and would have fired on correct code:

- `generatedCodeOracle.ts` GC-REBUILD narrowed to `['__proto__']`, plus a new case pinning that a
  loop guarding `constructor` and NOT `__proto__` is still a finding.
- `securityOracle.ts` SJ-PROTO narrowed the same way. The `record.constructor-key` and
  `record.prototype-key` attack entries stayed: already `expect: 'any'`, they keep probing that a
  carried key changes no prototype.

### Tests

- Go: `unsafe_keys_test.go` rewritten by position (guard text, the drop, the ordinary names, the
  enumerability guard required and optional, one container deeper); `resolver/unsafe_names_test.go`
  and `routerrules_test.go` follow, with new positive tests that `prototype` and `constructor`
  compile cleanly end to end.
- JS: `prototypeKeys.test.ts` restructured by position, 34 tests covering both roads, every encoder
  and decoder strategy, `DataOnly` type assertions, and the absent-optional `constructor` case the
  old code got wrong. `security.spec.ts` pins the new router message, that the other two names now
  dispatch successfully, and that route names still refuse all three.
- No new fuzz suite: the security lanes already own this property, and this narrowed two of their
  oracles.

### Docs

Four website pages plus the generated diagnostics catalog and the two user-facing message entries in
`messages.go`.

## Done when

A record can carry `constructor` and `prototype` as data on every road; a declared `__proto__` is
dropped rather than failing the build, with one decided behaviour that is the same on every road; a
declared `prototype` or `constructor` compiles and round-trips; and a test pins each position. All
met, plus the router now names the refused key instead of answering "Parameters might be of the wrong
type".
