---
type: fix
spec: guidelines
status: ready
created: 2026-08-03
---

# The pure-fn type stripper leaves call/new type arguments in the emitted JS

Found while adding the `rt::uniqueItems` pure fn
([optimise-json-schema-emitted-validators.md](../done/optimise-json-schema-emitted-validators.md)).
Writing `new Set<any>()` in a pure-fn body produced a `table.generated.go`
entry whose `code` still contained `new Set<any>()`, which is not JavaScript.

## Evidence

`collectTypeRanges` in
[striptypes.go](../../ts-go-runtypes/internal/cachegen/purefunctions/striptypes.go)
has a case for every type position it knows about: `as` / `satisfies`, legacy
`<Type>expr` assertions, non-null `!`, parameter annotations, variable
declaration annotations, and function-like return types plus type-parameter
lists. There is **no case for the `TypeArguments` of a call or new
expression**, so those survive verbatim.

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

Nothing catches it today. The extractor does not parse-check its own output,
and no built-in pure fn currently uses type arguments, so the path has never
run. The current workaround is a comment in
[pure-fns-utils.ts](../../packages/ts-runtypes/src/runtypes/pure-fns-utils.ts)
telling authors not to write them, which is exactly the kind of rule that gets
forgotten.

## Direction

Add the missing case to `collectTypeRanges`: for `KindCallExpression` and
`KindNewExpression`, splice the `TypeArguments` range including the
surrounding angle brackets. The function-like `TypeParameters` case directly
above is the model, including its `findPrecedingAngleBracket` /
`findCharAfter` scan for the brackets the AST range excludes. Recurse into the
expression and arguments as the sibling cases do.

Worth pairing with a cheap backstop so the next unhandled type position fails
loudly instead of shipping: have `gen-builtin-purefns` parse-check each
extracted body (a syntax-only pass over the rendered code) and fail the codegen
rather than write it. That turns the whole class of bug from silent to
build-breaking.

Unit coverage goes in
[striptypes_test.go](../../ts-go-runtypes/internal/cachegen/purefunctions/striptypes_test.go),
which already table-tests the other strip cases.

## Done when

A pure-fn body containing `new Set<string>()`, `new Map<K, V>()` and a generic
call extracts to valid JavaScript with the type arguments removed, a
striptypes test pins each shape, and the `uniqueItems` workaround comment in
pure-fns-utils.ts can be deleted.
