---
type: fix
spec: guidelines
status: blocked
created: 2026-10-01
---

# Make DataOnly and the emitter agree on standard-library classes

Status: blocked on a design decision (which side changes).

## Problem

The Go side treats every class or interface the standard library declares as not data: `typeid.NotDataBuiltinOf`
(`ts-go-runtypes/internal/cachegen/runtype/typeid/libglobal.go`) marks `URL`, `URLSearchParams`, `Blob`, `Error`,
`WeakMap` and any other lib-declared global `SubKindNonSerializable`, so every family drops it at a property and
refuses it at a root. `DataOnly<T>` (`packages/run-types/src/runtypes/dataOnly.ts`) cannot see where a class was
declared, so it projects those classes to their data shape:

```ts
type T = {u: URL; n: number};
createValidateFn<T>()({n: 1});            // true: u is dropped as non-data
createValidateFn<DataOnly<T>>()({n: 1});  // false: DataOnly<T> requires u: {href: string; ...}
```

A decoder typed `DataOnly<T>` therefore promises a member the decoded value never has. The D4 fuzz rule
(`packages/run-types/test/fuzz/type/dataOnlyOracle.ts`) would flag this, so the non-data generator draws no
standard-library class today.

## Options (the decision this todo waits on)

1. **DataOnly strips the lib classes it can name** without naming `lib.dom` types, through `typeof globalThis`
   probes (`typeof globalThis extends {URL: {prototype: infer P}} ? P : never`). Closes it for `URL`, `Blob`,
   `FormData` and the like. `Error` stays open: a plain `{name: string; message: string}` is assignable to it, so a
   structural test would strip user data. Costs type instantiations on every DataOnly node (see the budgets in
   `packages/run-types/test/types/dataonly.compile.test.ts`).
2. **The emitter treats lib classes as data** and validates their declared members structurally. Changes what every
   family does with `Error`, `URL` and friends, and the members of many lib classes are getters or methods.
3. **Keep the gap and say so** on the validation page, with the list of classes it affects.

## Done when

- One option is chosen and built, with paired static and value-shape tests.
- The non-data generator (`NONDATA_GEN_OPTIONS` in `packages/run-types/test/fuzz/core/typeGen.ts`) draws
  standard-library classes and D4 passes on them, or the page documents the gap and the generator says why it skips them.
