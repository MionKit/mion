---
type: feature
spec: guidelines
status: ready
created: 2026-09-06
---

# Match on the runtime member of a union

## Intent

A `match()` that branches on WHICH member of a union a value is, with the member check
generated at build time from the type. Today that decision exists only inside the JSON
walkers and the validators; it is never a function a user can call. Exposing it gives one
opinionated way to branch on any union anywhere in user code, and it is the foundation the
mion client needs to replace the call result tuple with a plain union of the route's value
and its declared errors (a separate todo).

The shape agreed on:

```ts
match(outcome)                                       // outcome: User | NotFound | ValidationError | UndeclaredError
  .when<User>(user => ...)                             // a VALUE member, by type: generated member check
  .catch<RangeError>(e => ...)                         // an ERROR member, by class: E extends Error
  .catchTyped('user-not-found', e => e.errorData.id)   // a TAGGED error, by tag: pure TS narrowing
  .otherwise(e => ...);                                // e: exactly what no branch claimed
// or .exhaustive(), which only compiles when nothing is left; the chain returns the branch's return value
```

- The runtime is the TC39 pattern matching proposal's (`match (subject) { when pattern: …
  default: … }`): any subject, first pattern wins, no match without a fallback throws. Static
  typing sits one level up, the way it does everywhere in TypeScript: `match<U>(value: U)`
  knows `U`, so a `when<T>` where `T` is not a member of `U` is a compile error (it could
  never match), each branch removes its member from what is left, `otherwise` receives
  exactly the remainder, and `exhaustive()` compiles only when the remainder is `never`
  (a type error naming the unhandled member otherwise). On an `unknown` subject the
  constraint is vacuous and the chain behaves as the bare proposal, so nothing about the
  rules changes with the input type.
- `when<T>` is a marker. It injects T's typeId like `getRunTypeId<T>()` does; the matcher
  compares it against the member typeIds the generated entry carries. Members are matched
  EXACTLY (a `when<Admin>` next to a `when<User>` is an error, never a structural hit).
- `catch<E extends Error>` is the same marker restricted to error members, so error classes
  and plain values never share a branch kind. The generated check for a class member is the
  class check the validators already emit.
- `catchTyped<E>(tag, cb)` needs no generated code and no mion import. It binds structurally
  to `Error & {type: string}`: any error carrying a `type` literal qualifies, `TypedError` and
  `RpcError` from `@mionjs/core` included (core depends on run-types, never the reverse, so
  run-types must not name them). The runtime check is one property read. The tag alone
  narrows the subject's union (`Extract<U, {type: Tag}>`), so the payload (`errorData` for
  an RpcError) is inferred and `E` is only spelled out on an `unknown` subject. A second
  callback argument carries the source (`'route' | middleFnName`, or the batch slot) when
  the same tag can come from several places.
- The chain returns the branch's return value, so state or JSX can come straight out of it.
- First hit wins, exactly one branch runs, async branches pass their promise through
  untouched (all sync or all async).

## Why the union comes from the input

The alternative weighed was a `match` that ignores the subject's type and builds its union
from the branches alone, so that some outside rule could read that union back and compare
it with a contract. Dropped: TypeScript already knows the subject's type, and static typing
discarding a branch that can never happen is the normal division of labour between the
type level and the proposal's runtime, not a departure from it. Reading the union from the
input also keeps the build trivial (the union is a real checker type, one marker on the
subject) and gives exhaustiveness for free. The one thing an outside rule still adds is
strictness a type cannot express, such as "every declared error gets its own branch rather
than falling into `otherwise`"; that is a consumer's rule (the mion client's, in its own
todo), not part of `match`.

## Direction

The implementer plans the details. Pointers verified at the time of writing:

- The member pick already exists as a piece of the JSON walkers:
  `ts-go-runtypes/internal/cachegen/typefunctions/json_prepare.go` (`unionMemberValidateCheck`,
  inline leaf checks or the cross-family `val_<member>` entry), driven by the safe member order
  and discriminator detection in `ts-go-runtypes/internal/cachegen/runtype/union_safeorder.go`
  (`SafeUnionChildren` / `UnionDiscriminators`). A standalone family, `unionIndex` or similar,
  is mostly wiring: one row in `cachegen/typefunctions/families.go`, one operation in
  `cachegen/operations/operations.go`, a `createX` factory in
  `packages/run-types/src/createRTFunctions.ts`, emitting `(value) => memberIndex | -1` and
  the ordered member typeIds. Discriminator read when one exists, validate fallback otherwise.
- The entry is generated for the subject's static union `U`, the marker sits on `match`
  itself, and each `when<T>` / `catch<E>` injects its own typeId, which the runtime maps to
  a member index of that entry. Member typeIds are canonical hashes of the type, so
  `when<User>` and the `User` member of `U` share one id without the resolver relating the
  two calls. An `unknown` subject has no union to generate for; there each branch falls back
  to its own validate entry, run in written order.
- Chained method markers already work: the scanner reads the resolved call signature
  (`ts-go-runtypes/internal/compiler/resolver/scan.go`, `Checker_getResolvedSignature`) and
  `mion.route()` is itself a method marker (`packages/router/src/types/mionRouter.ts`). So
  `.when<T>()` needs no resolver change, but a `when` in ARGUMENT position of another call
  needs its paired test (Marker test coverage rule, both `getRunTypeId` shapes).
- Three layers, each catching what the one below cannot. TypeScript: the member constraint
  on `when<T>`, the shrinking remainder, the typed `exhaustive()`. The compiler, as build
  Errors since every one is a "throws at runtime" case: a chain never closed, two branches
  with the same runtime shape (cannot be told apart, refuse rather than pick one), a branch
  an earlier one already covers (dead code, first hit wins), a `when<T>` whose `T` is only
  structurally inside `U` and not an exact member. A lint rule for what neither can see: a
  chain built and left dangling. The compiler-routed lint diagnostics already exist for
  batches (`BAT001`-style codes), follow that road.
- An open error (`type: string`, the mion undeclared error) can never be a branch, so a
  chain that expects one always needs `otherwise`.
- Docs: a new page under the runtypes site tree, plus an example file in
  `packages/examples/src/` so the snippet typechecks. Fuzz candidate: the generated index
  must agree with running each member's validator in safe order (compare-to-trusted-source).

## Done when

- `match` / `when` / `catch` / `catchTyped` / `otherwise` / `exhaustive` ship from `@mionjs/run-types`,
  with the generated `unionIndex` entry demand-driven like every other family.
- The three layers exist: the typed constraint and `exhaustive()`, the build Errors, the
  dangling-chain lint rule.
- Marker tests cover both call shapes and `when` in argument position; the fuzz oracle runs.
- The website documents it with a compiled example.
