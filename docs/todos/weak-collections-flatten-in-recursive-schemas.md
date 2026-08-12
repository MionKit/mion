---
type: fix
spec: full-plan
status: ready
created: 2026-08-12
---

# `WeakMap` / `WeakSet` inside a recursive schema flatten and move the id

## Problem

A `WeakMap` or `WeakSet` member inside a `circular(…)` body is walked by
`SubstituteSelf` (`packages/ts-runtypes/src/builders/static.ts`) instead of
being passed through as a leaf. Its methods return `this`, so the member walk
circularly references itself, TypeScript resolves the property to `any`, and the
node gets rebuilt into a plain object. The declaration's structural id moves,
so the type-first spelling and the value-first one it converts to stop agreeing:

    export interface Node {seen: WeakSet<object>; kids: Node[]}

    # convert to json-schema, then read that back to builders — the id moves
    Node: GyKKMkq → mmowEU6

Same for `WeakMap<object, string>`. Reproduced by
`TestCircular_BinaryNativesConvert`'s shape in
`ts-go-runtypes/internal/convert/circular_test.go`, with `WeakSet<object>` in
place of the binary native.

## How it was found

While fixing the same failure for the binary builtins (typed arrays, `DataView`,
`ArrayBuffer`, `SharedArrayBuffer`) in
[docs/done/escape-default-type-arguments.md](../done/escape-default-type-arguments.md).
Those were fixed by adding them to `BuiltinClassLeaf`; the weak collections were
deliberately left out, for the reason below.

## Why it was not fixed with the rest

The leaf test runs BEFORE the `Map` / `Set` arms:

    T extends Date | RegExp | BuiltinClassLeaf ? false
      : T extends Map<any, any> ? …
      : T extends Set<any> ? …

A real `Map` / `Set` is structurally assignable to `WeakMap` / `WeakSet`, so
putting the weak collections in `BuiltinClassLeaf` would make
`map(string(), self())` match the LEAF arm — the `Self` would never be
substituted and the brand would leak into the recovered type. That is a strictly
worse bug than the one being fixed, and it is silent.
`runtypes/dataOnly.ts` reasons its way to the same exclusion for
`DataOnlyStripped`.

## Fix direction

Give the weak collections their OWN arm, placed AFTER the `Map` / `Set` arms in
both walks (`ContainsSelfIn` and `SubstituteSelf`), where a real `Map` / `Set`
has already been consumed by the arm above and cannot reach it:

    : T extends Set<any> ? …
    : T extends WeakMap<any, any> | WeakSet<any> ? T      // new
    : T extends Promise<infer E> ? …

Both walks must move together — `ContainsSelf` answering "no Self" while
`SubstituteSelf` still rebuilds (or the reverse) is how the original bug
produced its half-substituted shapes.

## Cost

The `SubstituteSelf` instantiation budgets
(`packages/ts-runtypes/test/types/substituteSelf.compile.test.ts`) are a one-way
ratchet, and the binary-native fix already spent one documented exception (3–12
net instantiations per branch, under 1%). An extra conditional arm in both walks
will cost again. Measure first: if it lands under the current budgets, ship it
with no exception; if not, the header needs a third documented exception, and
the case for it is weaker than the binary one (a `WeakSet` inside a recursive
schema is a rarer shape than a `Uint8Array`).

## Out of scope

`Error` and its subclasses are NOT affected — they carry no self-returning
member, so the walk terminates and the node is returned verbatim. Verified.

## Done when

- `export interface Node {seen: WeakSet<object>; kids: Node[]}` holds its id
  across source → json-schema → builders, and the same for `WeakMap`.
- `map(string(), self())` and `set(self())` still substitute (the negative
  control in `TestCircular_SelfStillSubstitutesThroughContainers`).
- The budget test passes, either under the existing numbers or with a third
  documented REVIEWED EXCEPTION in its header.
