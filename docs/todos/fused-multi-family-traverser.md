---
type: feature
spec: guidelines
status: ready
created: 2026-08-30
---

# Fused multi-family traverser (checkUnknowns + parse)

## Intent

Two asks started this: a `checkUnknowns` flag on `createValidateFn`, and a `createParseFn`. They are
not two tasks. Both are consumers of one missing piece: a way to walk a type ONCE with several
emitters at the same time and join what each produces per node, instead of running several compiled
functions back to back over the value.

The result is one function per call site that traverses the value once and fails earlier, rather
than `a(v) && !b(v)` or `validate(restore(v))`.

Three phases, three PRs:

1. The multi-family traverser. The real work.
2. `checkUnknowns` on `createValidateFn` / `createGetValidationErrorsFn`.
3. `createParseFn`.

This doc is guidelines, not a plan: the implementer designs the emit. What follows is the
investigation that was already done, so nobody rediscovers it.

## Phase 1 — the traverser

### The seam is narrow, and already emitter-parameterized

`Walker` holds exactly ONE `Emitter` ([walker.go:135](../../ts-go-runtypes/internal/cachegen/typefunctions/walker.go)),
and every per-node decision routes through that interface: `Args`, `Supports`, `IsRTInlined`, `Emit`,
`EmitDependencyCall`, `Finalize`, `ReturnName`, plus the optional `IsNoopType` / `EmitCircularGuard`.
`Walker.Compile` (walker.go:581) is 18 lines. `compileNode` (walker.go:645) pushes a frame,
dispatches one `Emitter.Emit`, reconciles the code type, pops.

`CollectFamilyEntries` ([module.go:186](../../ts-go-runtypes/internal/cachegen/typefunctions/module.go))
already takes the emitter as a parameter:

```go
func CollectFamilyEntries(dump protocol.Dump, settings constants.CacheModuleSettings,
    emitter Emitter, innerPrefix string, opts RenderOpts, extraRoots []string) entrymodules.Graph
```

`FamilySpec.Collect` ([families.go](../../ts-go-runtypes/internal/cachegen/typefunctions/families.go))
just binds them, and
[dispatch.go:228-272](../../ts-go-runtypes/internal/compiler/resolver/dispatch.go) runs the families
in parallel and merges the graphs (composites merge after, dispatch.go:164).

So the multi-family collector is a SIBLING of `CollectFamilyEntries`, not a rewrite of it, and it
plugs into `dispatch.go` the same way.

### The seven joins to define

Each has a concrete anchor. This is the list to work through.

| # | Join | Anchor and the problem |
| --- | --- | --- |
| 1 | Args | `argsList` (walker.go:899) reads one emitter's `Args()`. Contributors disagree: validate `(v)`, validationErrors `(v, pth=[], er=[])`, hasUnknownKeys `(v, opts={})`, restore `(v)`. Union by `Key` (`vλl` / `pλth` / `εrr` / `θpts`), defaults preserved. |
| 2 | Code type | The four shapes in `codetype.go`. Arms disagree: validate emits `CodeE` boolean chains, validationErrors and restore emit `CodeS`. `handleCodeInterpolation` (walker.go:912) reconciles the PARENT/CHILD cross-product already; the SIBLING join does not exist. `CodeNS` from any contributor must poison the node, matching the existing escalation contract. |
| 3 | Child recursion | The one that makes this a traverser and not a wrapper. If each arm calls `CompileChild` itself, the child compiles twice and, worse, each arm dep-calls a DIFFERENT child entry. The traverser must drive ONE recursion per child and hand every arm the result. `SetChildAccessor` / `SetChildPathLiteral` are set-and-cleared around each `CompileChild`, and the error families need path push/splice around their dep call (`emitPathTrackedDepCall`, emitter.go:344) where validate does not. |
| 4 | Dependency calls | `EmitDependencyCall` differs per family (validate passes `v`, huk passes `v,opts`, error families wrap in path tracking). The fused call passes the union, and must target the FUSED child entry. |
| 5 | Finalize | Per emitter, each with its own empty-body answer: `return true` / `return er` / `return false` / `return v`. Fused `Finalize` is a policy decision, not a merge. |
| 6 | Noop | Verdicts memoize in per-family `factKind` lanes (noop_types.go:877). Fused needs its own lane; it is noop only when EVERY contributor is. |
| 7 | Supports | `validationSupports` (validate.go:76) and `unknownKeysSupports` (unknownkeys_shared.go:609) differ. Intersection is the wrong default: for `checkUnknowns` the unknown-key half contributes nothing on kinds it does not support, so it must not veto the node. |

Local var counters (`NextLocalVar`) are per-walker per-prefix, and context items are keyed by name
(`k_<rt.ID>`), so those two are already safe for two arms sharing a frame. Worth confirming, not
worth designing around.

### The pattern has a precedent, and its limit is why this phase exists

`tryInlineLeafValidateCheck`
([json_prepare.go:585](../../ts-go-runtypes/internal/cachegen/typefunctions/json_prepare.go)) already
borrows one emitter's per-node output from inside another's:

```go
sub := &EmitContext{Vλl: v, walker: ctx.walker}
rt := ValidateEmitter{}.emitKindDefault(member, sub, CodeE)
```

Its comment names the contract, and that contract is the whole problem: it is safe ONLY because the
borrowed arms read `ctx.Vλl` and nothing else. No `NextLocalVar`, no `SetContextItem`, no
`CompileChild`, no `registerRTLookup`, no `EmitDiagnostic`. `isInlinableLeafValidateKind`
(json_prepare.go:610) enforces that with a leaf-kind allowlist that EXCLUDES every compound kind.

Phases 2 and 3 need to fuse at exactly the kinds that allowlist excludes: objects, index signatures,
unions, Map/Set. So the throwaway-context trick does not generalize, and joins 3 and 4 are what
replaces it.

### Blocker that decides the shape: variants are never disk-cached

In `module.go`, every disk-cache read and write is gated on the entry being the plain variant:

```go
// read, module.go:461                          // write, module.go:671
if variantSuffix == "" && !rejectCircular {     if variantSuffix == "" && !rejectCircular {
    if cached, ok := tryReadCachedEntry(...)        writeCachedEntry(runType, settings, ...)
```

Three more variant limits stack on it:

- Root-scoped. `walker.InnerPrefix` stays the PLAIN family hash (module.go:483), so children of a
  variant walker dispatch to plain child entries. A `checkUnknowns` flag built as a variant would
  only ever check the root object.
- Overrides skipped. module.go:235 applies `overrideHashForTag` to the plain variant only, so a
  user's `overrideValidate<T>()` would be silently ignored.
- Noop verdicts memoize per family (join 6).

A FAMILY has none of those: `CollectFamilyEntries` renders the whole transitive subtree
(module.go:186-280), `innerPrefix` is the family's own hash so children recurse fused, entries
disk-cache under `<typeID>/<tag>.json`, and overrides work.

**So: fused output is new families, not new variants.** The public surface stays a flag; the scanner
swaps which operation a call site resolves to in `computeSiteFn`
([scan.go:1101](../../ts-go-runtypes/internal/compiler/resolver/scan.go)), which is already where
axis / strategy / circular routing happens.

### Two more things to keep in view

- **Phase 1 needs a consumer to be real.** A traverser with no caller is untested machinery. Land it
  mergeable with Go-level traverser tests, and let phase 2 be its first real consumer and the thing
  that proves it.
- **Cost, stated out loud.** Fusing doubles the emitted entries for a subtree (a type reachable from
  a plain and a fused call site renders both). Normal pay-for-use, but `checkUnknowns` lands it on
  the validate family, the biggest one. A bundle-size check belongs in the phase 2 PR.

## Phase 2 — checkUnknowns

Strict validation today is two compiled functions back to back:

```ts
const isUser = createValidateFn<User>();
const hasExtraFast = createHasUnknownKeysFn<User>(undefined, {runsAfterValidation: true});
const isUserStrict = (d: unknown): d is User => isUser(d) && !hasExtraFast(d);
```

([packages/examples/src/guide/unknown-keys-after-validation.ts](../../packages/examples/src/guide/unknown-keys-after-validation.ts))
Two walks; every nested object visited twice.

Add `checkUnknowns` to `ValidateOptions`, honoured by `createValidateFn` and
`createGetValidationErrorsFn`. Fuse validate + `huk`, and validationErrors + `uke`, through phase 1.

The unknown-key emit helpers are already package-level and emitter-agnostic
(`addObjectPropsToContext`, `callCheckUnknownPropertiesForHas`, `emitCountKeysCheck` in
`unknownkeys_shared.go` / `unknownkeys_has.go:141`). Reuse them, do not rewrite.
`createHasUnknownKeysFn` stays as it is.

Two things worth attention:

- **Placement is the win, not just presence.** Once the property checks sit in the same `&&` chain,
  the `runsAfterValidation` precondition holds by construction at every depth: put the O(1)
  key-count compare after the prop checks and it is sound, where today it is only sound at the root.
  Optional-prop and index-signature shapes keep the scan.
- **Error order changes.** Today `verr(v).concat(uke(v))` puts all type errors before all
  unknown-key errors. Fused, they interleave in walk order. Decide, document, pin with a test.

## Phase 3 — createParseFn

`createParseFn<T>()`, closest sibling to zod's `parse`: restore, validate, and throw a full report,
fused per node instead of three walks. Input is the output of `JSON.parse`, not a string, matching
the `restoreFromJson` contract, so it composes with `createJsonDecoderFn` rather than duplicating it.

**Unknown keys ride the existing `strategy` option, not a new one.** This started as
`unknownKeys: 'drop' | 'fail'`, but `strategy` is the established name for exactly this axis on both
`createJsonEncoderFn` and `createJsonDecoderFn`, with `AxisJsonStrategy` behind it, so `getFnHash`'s
`jsonStrategy` axis, `Canonical`, and the collision guard all work with no new machinery. Parse
registers its own `Strategies` + `DefaultStrategy`. Suggested tokens, borrowed from the decoder's
vocabulary:

- `strip` (the original "drop") — DEFAULT, matching the decoder's own default and, incidentally, zod.
- `fail` — new token, no decoder equivalent: reject extras in the validation phase, which is phase 2's
  fused arm. So `fail` depends on phase 2.
- `preserve` — keep extras, for symmetry with the decoder.

Findings that shape it:

- **`strip` should not copy the decoder's `strip`.** That one takes two walks:
  `"jsonDecoder|strip": {"rj", "ukuw"}`
  ([constants.go:372](../../ts-go-runtypes/internal/constants/constants.go)), a
  set-undeclared-to-undefined pre-pass then a restore. The note right above it says what to do
  instead: `clone` is shape-derived (prepareForJsonSafe builds a new value from the declared shape),
  so it strips undeclared keys by construction and needs no separate strip pass. The same note
  records that `stripClone` / `stripMutate` were REMOVED as redundant. Shape-derived rebuild in one
  walk is the established answer here.
- **That rebuild is not a tweak to the restore walk.** `restoreFromJson` transforms IN PLACE and
  shares its object walk with the mutating `prepareForJson` (`emitObjectJsonChildren`,
  json_prepare.go:250), so extras survive it. The one existing decode-direction emitter that builds a
  fresh object from the declared shape is `emitObjectCompactFromJson`
  ([json_compact_restore.go:175](../../ts-go-runtypes/internal/cachegen/typefunctions/json_compact_restore.go)),
  rebuilding a keyed object slot by slot. That is the arm to borrow, reading by key not position.
- **Order at restoring leaves is correctness, not preference.** Check the JSON shape before
  restoring, or junk makes `BigInt(v)` throw a raw `TypeError` and `new Date(v)` yield an Invalid
  Date instead of a clean rejection.
- **The cold path should not be fused.**
  [createStandardSchema](../../packages/ts-runtypes/src/standard/createStandardSchema.ts) is the
  precedent: cheap boolean first, issues only on failure. Suggestion: hold soft deps on the PLAIN
  `rj` and `verr` entries and, on mismatch, restore the original input and run `verr` on that. Two
  extra walks on a path about to throw, in exchange for a report identical to
  `createGetValidationErrorsFn`'s.
- **New error class.** Nothing to reuse: `CircularReferenceError`
  ([runtypes/circular.ts:18](../../packages/ts-runtypes/src/runtypes/circular.ts)) is the only error
  class in the package. `RTParseError` carrying `issues: RTValidationError[]` follows its shape.
- Register the family in `entryTuple.ts` `familyMeta`
  ([entryTuple.ts:481](../../packages/ts-runtypes/src/runtypes/entryTuple.ts)) or tuple registration
  silently no-ops: `if (!meta) return false`.

One thing to settle, not designed here: `DemandFor`'s `AxisJsonStrategy` arm assumes a COMPOSITE (it
looks up `JsonCompositeTag` and `JsonStrategyFamilies`,
[demand.go](../../ts-go-runtypes/internal/cachegen/operations/demand.go)). Parse is a type-walking
family with a strategy axis, which that arm does not cover.

## Done when

- **Phase 1** — a multi-family collector renders fused entries for a whole subtree, disk-cached like
  any other family; each of the seven joins is covered by a Go test; phase 2 consumes it.
- **Phase 2** — the fused validator agrees with the two-call composition over a parity corpus and a
  fuzz oracle (compare-to-a-trusted-source, extra keys injected at random depths); a NESTED object's
  extra key is rejected; error order documented and pinned; the strict benchmark lane in
  [container/benchmarks](../../container/benchmarks/) points at the fused fn.
- **Phase 3** — every strategy covered (`strip` leaves no undeclared key at any depth and deep-equals
  `cloneExactShape(restore(v))`, `fail` rejects exactly what phase 2 rejects, `preserve` keeps
  extras); `parse(v)` deep-equals `restore(v)` on success and throws issues deep-equal to
  `getValidationErrors(restore(v))` on failure; junk at every restoring leaf rejects cleanly, never a
  raw `TypeError`; round-trip and rejection fuzz oracles hold.
- **Every phase** — the Marker test coverage rule (both `getRunTypeId` shapes, paired, one
  hash-equivalence assertion); website docs plus a
  [packages/examples/src/guide/](../../packages/examples/src/guide/) example for phases 2 and 3;
  `pnpm test` and `go -C ts-go-runtypes test ./internal/...` green.

## Out of scope

- `createSafeParseFn` returning `{success, data | issues}`. Worth having, its own todo.
- Parse taking a JSON string. `createJsonDecoderFn` owns that.
- Making `runsAfterValidation` propagate past the root object on the standalone
  `createHasUnknownKeysFn`. Related but independent, its own todo.
