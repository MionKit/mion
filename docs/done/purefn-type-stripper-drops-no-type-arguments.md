---
type: fix
spec: guidelines
status: done
created: 2026-08-03
---

# The pure-fn type stripper leaves call/new type arguments in the emitted JS

Found while adding the `rt::uniqueItems` pure fn
([optimise-json-schema-emitted-validators.md](optimise-json-schema-emitted-validators.md)).
Writing `new Set<any>()` in a pure-fn body produced a `table.generated.go`
entry whose `code` still contained `new Set<any>()`, which is not JavaScript.

## Evidence

`collectTypeRanges` in
[striptypes.go](../../ts-go-runtypes/internal/cachegen/purefunctions/striptypes.go)
had a case for every type position it knew about: `as` / `satisfies`, legacy
`<Type>expr` assertions, non-null `!`, parameter annotations, variable
declaration annotations, and function-like return types plus type-parameter
lists. There was **no case for the `TypeArguments` of a call or new
expression**, so those survived verbatim.

What the generated table contained before the source was reworded:

```
const primitives = new Set<any>();
...
if (objects === null) objects = new Set<string>();
```

How that behaves once the pure fn body is evaluated:

```
new Set<any>()            -> SyntaxError: Unexpected token ')'
new Map<string, number>() -> SyntaxError: Missing initializer in const declaration
foo<T>(1)                 -> parses, silently, as (foo < T) > 1
```

The first two are load-time syntax errors in the delivered pure fn. The third
is worse: it parses as a chain of comparisons and evaluates to a boolean, so a
generic call would silently compute the wrong thing.

Nothing caught it. The extractor did not parse-check its own output, and no
built-in pure fn used type arguments, so the path had never run. The workaround
was a comment in
[pure-fns-utils.ts](../../packages/ts-runtypes/src/runtypes/pure-fns-utils.ts)
telling authors not to write them, which is exactly the kind of rule that gets
forgotten.

## What shipped

**The missing stripper case.** `collectTypeRanges` gained
`ast.KindCallExpression` and `ast.KindNewExpression` branches. Both splice the
`TypeArguments` range through a new `appendTypeArgumentsRange` helper that scans
outwards for the surrounding `<` / `>` using the existing
`findPrecedingAngleBracket` / `findCharAfter` — the AST range covers only the
inner type nodes, exactly as with a function-like's `TypeParameters`. Each
branch then recurses into the callee expression and the argument list (via a
small `collectListTypeRanges`) and returns, matching how the sibling expression
cases avoid re-walking the type nodes they just spliced.

**The codegen backstop.** `gen-builtin-purefns` now runs `parseCheckEntries`
before `render`, so a bad body fails codegen instead of being written. Each
entry is re-rendered the way the runtime builds it
(`new Function(...paramNames, "'use strict'; " + code)`) and parsed with
`core.ScriptKindJS`. Parsing as JS rather than TS is what does the work: in a JS
file a leftover annotation or type argument is a grammar error, not valid
syntax. Verified by reverting the stripper fix, which made codegen fail with

```
gen-builtin-purefns: 2 extracted pure-fn body/bodies are not valid JavaScript — the type stripper left TS syntax behind.
  rt::uniqueItems (rendered body 32:37): TS1109 Expression_expected_1109
  rt::uniqueItems (rendered body 41:55): TS1109 Expression_expected_1109
Fix internal/cachegen/purefunctions/striptypes.go (add the missing type position), not the source or the table
```

leaving `table.generated.go` untouched.

**Coverage.** `TestStripTypes_TypeArguments` in
[striptypes_test.go](../../ts-go-runtypes/internal/cachegen/purefunctions/striptypes_test.go)
table-tests nine shapes: one and two type arguments on `new`, nested
(`Map<string, Set<number>>`), `new` without parentheses, a generic call, a
two-argument generic call, type arguments nested inside a call argument, type
arguments on a property-access callee, and an annotation plus a type argument in
the same statement. Each pins the exact stripped output and asserts no angle
bracket survives. All nine fail against the pre-fix stripper.

**The workaround is gone.** `pf_uniqueItems` now writes `new Set<any>()` and
`new Set<string>()` directly, and the comment is deleted. Regenerating produced
byte-identical emitted JS (only `code` and `bodyHash` moved, because the source
text changed). All 30 built-in bodies were confirmed to build under
`new Function`, with `uniqueItems` still correct across 0/-0, NaN, key order,
and the string-`'{}'`-versus-object-`{}` collision cases.

## Known limits

`TaggedTemplateExpression` and `ExpressionWithTypeArguments` also carry type
arguments and remain unhandled. Neither appears in any built-in pure fn, and
both are now caught loudly by the parse check rather than shipped, which was the
point of pairing the fix with the backstop. Add them the same way if a body ever
needs one.

The parse check cannot catch stripped-but-still-wrong output that stays valid
JS. `foo<T>(1)` is the example: it parses clean either way. Only the stripper
case prevents that one, which is why the fix and the backstop are both needed.

## Done when

A pure-fn body containing `new Set<string>()`, `new Map<K, V>()` and a generic
call extracts to valid JavaScript with the type arguments removed, a striptypes
test pins each shape, and the `uniqueItems` workaround comment in
pure-fns-utils.ts can be deleted. All met.
