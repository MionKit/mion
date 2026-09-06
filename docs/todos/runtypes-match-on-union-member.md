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
match(outcome)
  .when<User>(user => ...)                             // a VALUE member, by type: generated member check
  .catch<RangeError>(e => ...)                         // an ERROR member, by class: E extends Error
  .catchTyped('user-not-found', e => e.errorData.id)   // a TAGGED error, by tag: pure TS narrowing
  .otherwise(v => ...);                                // the fallback, v: unknown
// or .exhaustive(): no fallback, a value no branch matches throws
// the chain returns the branch's return value
```

- THE UNION IS FORMED BY THE BRANCHES, never read from the matched value's static type.
  `match(value)` accepts `unknown`; the union the generated check decides over is
  `A | B | C`, the types named by the chain's `when<A>` / `catch<B>` / `catchTyped` branches.
  That is what keeps the feature generic: it works on any value, and it is what lets a
  separate rule compare the union a call site built against the union something else
  declared (the mion client's route contract, in its own todo).
- `when<T>` is a marker. It injects T's typeId like `getRunTypeId<T>()` does; the matcher
  compares it against the member typeIds the generated entry carries. Members are matched
  EXACTLY (a `when<Admin>` next to a `when<User>` is an error, never a structural hit).
- `catch<E extends Error>` is the same marker restricted to error members, so error classes
  and plain values never share a branch kind. The generated check for a class member is the
  class check the validators already emit.
- `catchTyped<E>(tag, cb)` needs no generated code and no mion import. It binds structurally
  to `Error & {type: string}`: any error carrying a `type` literal qualifies, `TypedError` and
  `RpcError` from `@mionjs/core` included (core depends on run-types, never the reverse, so
  run-types must not name them). The runtime check is one property read. Typing: `E` is the
  branch's contribution to the union; when the matched value DOES have a static union type,
  the tag alone narrows it (`Extract<U, {type: Tag}>`) and the payload (`errorData` for an
  RpcError) is inferred, so `E` is rarely spelled out. A second callback argument carries
  the source (`'route' | middleFnName`, or the batch slot) when the same tag can come from
  several places. The client todo relies on that inference, since call outcomes are typed.
- `otherwise(v => ...)` receives whatever no branch claimed, typed `unknown`. `exhaustive()`
  closes the chain without a fallback: a value no branch matches throws. The chain returns
  the branch's return value, so state or JSX can come straight out of it.
- First hit wins, exactly one branch runs, async branches pass their promise through
  untouched (all sync or all async).

## Why the union comes from the branches, and why the name is `match`

Two designs were weighed. They share the runtime and differ in where the union comes from.

**A, the one to build: union from the branches.** `match(value)` takes `unknown`; the
chain's `when` / `catch` / `catchTyped` types ARE the union. TypeScript can read that union
back from the chain (a `MatchUnion<typeof matcher>` helper over the accumulated branch
types), which is what an outside rule needs to compare it with a contract. TypeScript
cannot, on its own, say a branch is wrong or missing, because there is no input type to
check against; `exhaustive()` means "no match throws". The resolver has to read the whole
chain as one site to synthesize the union for the generated check.

**B, not built now: union from the input.** `typeMatch(outcome)` reads the union from the
value's static type, `when<T>` requires `T` to be a member, `otherwise` receives exactly
what is left and `exhaustive()` compiles only when that is `never`. Cheap to build (the
union is a real checker type, one marker on the input) and exhaustive for free, but unusable
on an `unknown` subject.

A is the shape of the TC39 pattern matching proposal (`match (subject) { when pattern: …
default: … }`: any subject, patterns independent of it, no exhaustiveness, no match without
`default` throws), so A keeps the name `match`. B is a typed restriction of A, one extra
constraint `T extends U` when the input has a static type. If it is ever wanted, it ships
under its own name (`typeMatch`), never as a behaviour of `match` that changes with the
input type: one function whose rules depend on the input is exactly what users should not
have to remember.

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
- Because the union comes from the branches, the resolver must read the whole chain
  (`match(...).when<A>(...).catch<B>(...).otherwise(...)`) as ONE site and synthesize
  `A | B | ...` as the type the entry is generated for. Which call carries the injected id
  (the opening `match`, the closing `otherwise` / `exhaustive`, or every branch) is the
  implementer's call; the safe-order and discriminator passes need the union node either way.
- Chained method markers already work: the scanner reads the resolved call signature
  (`ts-go-runtypes/internal/compiler/resolver/scan.go`, `Checker_getResolvedSignature`) and
  `mion.route()` is itself a method marker (`packages/router/src/types/mionRouter.ts`). So
  `.when<T>()` needs no resolver change, but a `when` in ARGUMENT position of another call
  needs its paired test (Marker test coverage rule, both `getRunTypeId` shapes).
- Safety comes from the compiler and the linter, not from TypeScript (see the A / B note
  above). Build Errors, all "throws at runtime" cases: a chain never closed, two branches
  with the same runtime shape (cannot be told apart, refuse rather than pick one), a branch
  an earlier one already covers (dead code, first hit wins). A lint rule for what the build
  cannot see: a chain built and left dangling. The compiler-routed lint diagnostics already
  exist for batches (`BAT001`-style codes), follow that road. Contract checks (do the
  branches cover what a route declares) belong to the consumer, the client todo carries
  mion's.
- An open error (`type: string`, the mion undeclared error) can never be a branch, so a
  chain that expects one always needs `otherwise`.
- Docs: a new page under the runtypes site tree, plus an example file in
  `packages/examples/src/` so the snippet typechecks. Fuzz candidate: the generated index
  must agree with running each member's validator in safe order (compare-to-trusted-source).

## Done when

- `match` / `when` / `catch` / `catchTyped` / `otherwise` / `exhaustive` ship from `@mionjs/run-types`,
  with the generated `unionIndex` entry demand-driven like every other family.
- The build Errors and the dangling-chain lint rule exist; `MatchUnion` reads the branch
  union back at the type level.
- Marker tests cover both call shapes and `when` in argument position; the fuzz oracle runs.
- The website documents it with a compiled example.
