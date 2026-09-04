---
type: chore
spec: guidelines
status: done
created: 2026-09-04
---

# Make every Go compiler pass reach nested nodes

## Intent

Rules that should hold for a whole type keep landing on the root node only. The latest one: the
build check for a property named `__proto__`, `prototype` or `constructor` looked at the root type's
direct members, so `interface Outer {inner: {constructor: string}}` compiled and its decoder read
the slot through the prototype chain. The fix made that one function walk the graph. It was the
third or fourth bug of this exact shape, and each one was found by accident. The goal is to end
the class: find out whether the compiler can enforce, by construction, that any function processing
a node with children propagates the call to those children, ship that enforcement, and fix every
root-only rule the work turns up. If a deterministic enforcement is not reachable, the deliverable
is a skill with repeatable instructions that lets a session hunt this class of bug on purpose,
still with every rule found along the way fixed and tested at depth.

## Direction

The implementer plans the details. What was checked:

- **Two kinds of walker coexist.** The emit walker
  (`ts-go-runtypes/internal/cachegen/typefunctions/walker.go`, `NewWalker`, `Compile`,
  `CompileChild`, `pushStack`) descends generically: each emitter arm asks it to compile a child, so
  emit logic reaches nested nodes for free. The bugs come from the OTHER kind: standalone
  pre-passes and helpers that take a `*reflection.RunType` plus the ref table and loop over
  `Children` themselves. Today `module.go` runs three such pre-passes before `walker.Compile()`
  (`BuildCircularSkeleton`, `unsafeDeclaredMember`, and the `MustValidateJson` contract lives in
  `reflection` on the same shape), and a grep for `range ….Children` in non-test Go under
  `internal/` finds 86 loops across 31 files, with hand-rolled `visited` maps in at least eight of
  them (`runtype/entries.go`, `circular_skeleton.go`, `clone_exact_shape.go`, `json_compat.go`,
  `json_prepare_safe.go`, `noop_types.go`, `union_flat_compact.go`, `unsafe_keys.go`). Each is a
  place where "did this reach the children" is decided by hand.
- **The graph has more child slots than `Children`.** A RunType holds sub-types in `Children`,
  `Child`, `Index`, `Return`, `Parameters` and `TypeArguments`, and a child can be a `KindRef`
  that must go through the ref table. A loop that covers `Children` only misses an array element
  (`Child`), a Map key (`Index`) or a generic argument, so "propagates to the children" has to be
  defined against the full slot list, and refs must be resolved on the way.
- **The worked example to carry in the doc.** Before the fix, `unsafeDeclaredMember` in
  `typefunctions/unsafe_keys.go` switched on the root kind, looped `rt.Children`, resolved each
  ref, and returned the first property whose name was unsafe: correct for the root, blind one
  level down. After the fix it walks with a `visited` set over `Children`, `Child`, `Index` and
  `TypeArguments`, through refs, and stops only at function-like kinds and statics (a `typeof Box`
  carries a real `prototype`). The Go test that caught it is
  `TestDiag_NestedUnsafePropertyNameFailsTheBuild` in
  `internal/compiler/resolver/unsafe_names_test.go`: the same source as the root test with the
  member moved one object deeper. That "same test, one level deeper" shape is the cheapest
  detector this class of bug has, and the skill should say so.
- **Candidate enforcement shapes to weigh** (the implementer picks, or rules them all out):
  a single shared graph walk in `reflection` (a `ForEachChild` / `Walk` over every slot with ref
  resolution and cycle guard) that every pre-pass is rewritten on, with a lint or a Go test that
  fails on any new `range ….Children` outside that helper and the emit walker; a pre-pass
  registry in `module.go` so a per-node rule is declared once and applied by the walker at every
  node instead of at the root; or a coverage-style Go test that feeds every rule a nested fixture
  and asserts the diagnostic fires at depth. Whichever lands, the enforcement must not slow the
  build: the walk runs per entry at build time, and the emit walker's own descent is already
  paid for.
- **Every root-only rule found gets fixed in the same PR**, with its one-level-deeper test, whether
  the enforcement lands or the skill does. Finding is not the deliverable; fixing is.
- **The fallback deliverable is a skill.** If no deterministic gate is reachable, write
  `.claude/skills/<name>/SKILL.md` with the repeatable hunt: list the standalone pre-passes and
  helpers (the grep above, refreshed), for each one ask which slots it reads and whether it
  resolves refs, and for each rule add the one-level-deeper twin of its existing test. Include the
  `unsafeDeclaredMember` before/after as the worked example so the pattern is recognisable.
- **Docs impact.** `ts-go-runtypes/CLAUDE.md` gains the rule the investigation settles on (a
  helper every pre-pass must use, or a pointer to the skill). No website change: this is
  contributor-facing only.

## Done when

- Either the enforcement is in: a shared walk (or registry, or depth fixture gate) every pre-pass
  and helper runs on, with a gate that fails on a new hand-rolled child loop outside it; or, if
  that is shown not to be reachable, a skill with repeatable instructions for hunting root-only
  rules, carrying the `unsafeDeclaredMember` example and the "same test, one level deeper"
  detector.
- Every root-only rule the work found is fixed, each with a Go test that places the case one
  object deeper than the existing root test.
- `ts-go-runtypes/CLAUDE.md` names the rule every pre-pass must follow, or the skill.

## Plan (approved 2026-09-04) and what shipped

The enforcement turned out to be reachable, so no hunt skill was written. Three gates landed, and
every root-only rule the audit found was fixed with a one-level-deeper test. Two findings the audit
raised were, on inspection, documented feature limits rather than missed recursion, and are recorded
here instead of changed.

### Enforcement

- **`reflection.WalkGraph`** (`ts-go-runtypes/internal/reflection/walk.go`): the one graph walk
  for a standalone pass, built on `EachRefSlot`, resolving refs, guarding cycles, with
  continue / skip-children / stop actions. `unsafeDeclaredMember` was rewritten on it. The checker
  side got two twins: `detectSilentAnyInGraph` (resolver, over `*checker.Type`) and
  `marker.EachWrittenTypeRef` (over written syntax, following references into the declarations
  they name).
- **Slot-coverage gate** (`internal/reflection/refslots_test.go`): fills every `*RunType` /
  `[]*RunType` field of `RunType`, `SchemaChecks` and the check structs through Go reflection and
  fails when `EachRefSlot` misses one. Proven by dropping a slot by hand.
- **Diagnostic Scope + depth gate**: every registered code declares `ScopeRoot`, `ScopeGraph` or
  `ScopeNotSource` (`register` panics otherwise); a `ScopeGraph` code with an `Example` must carry
  a `NestedExample`, and `TestDiagExamples_TriggerAtDepth` feeds each through the real scan. On its
  first run the gate caught the nested silent-`any` gap below. UPN001 got its prose, example and
  nested example.
- `ts-go-runtypes/CLAUDE.md` gained the rule section.

### Rules fixed (each with its one-object-deeper test)

- **UPN001** still missed a Map or Set element type (`Arguments`) and the schema-check slots; on
  `WalkGraph` both come for free.
- **`rejectCircularRefs`** never saw a cycle through a Map value or a Set item: the skeleton read the
  argument wrappers unresolved, so no `mk` / `mv` / `s` edge was emitted and the value overflowed the
  stack instead of raising the typed error.
- **MKR007 / MKR013 / TMP001** saw the root type and the call's own syntax only; a member that
  degraded to `any` one object deeper left the root healthy and its validator `true`. One walk over
  the resolved checker type runs the three per-member predicates everywhere, naming the member and
  its declaration; a hand-written `any` stays legal by construction.
- **The decoder's prototype-name refusal** was dropped when the index-signature value needed no
  rebuild, so a `Record<string, string>` decoder let `__proto__` through to whoever skipped
  validate. The key loop now always ships, and the decode-road noop verdicts say so: an entry that
  carries the guard is a real function, never the `JSON.parse` identity (the shape half of the
  predicate keeps deciding the flat-union envelope, so the wire format did not move). A union that
  round-trips raw still emits no member code; its keys reach validate, which refuses them.
- **MKR011** followed alias bodies only; it now enters interface and class bodies, their extends
  and implements clauses, and the written kinds that fell through (optional and rest tuple
  elements, mapped, conditional and indexed-access types).
- **`convert` and `enrich`** refused a declaration whose own syntax carried an unresolved name but
  not one whose reference did; both now follow references through one shared written-reference walk,
  skipping the bundled lib and `node_modules`.
- **The codecs ignored `patternProperties`**: validate enforced that a `^d_` key holds a Date while
  the encoders, decoders, clone and binary road never converted one. Each entry is now a synthetic
  index signature carrying its key regex, reached through one `objectMembers` enumeration every codec
  object arm and noop predicate walks. `propertyNames` and `contains` need no codec action (a key is
  a string on every wire; contains counts over the array's own element type).

### Recorded, not changed

- `formatNoopRecursive` defaults to identity for a format under a union arm, an index signature or
  a Map / Set value, and `formattransform.go` has no arm there either: predicate and emitter agree,
  and the predicate's own comment records the MVP gap. A feature to add, not a walk that stopped
  early.
- The enrichment closure records no union member ids because the FriendlyText / MockData DSL has no
  key for a union member (object-member unions are out of scope in `friendlyText.ts`); adding one
  would record ids no mirror can name. Now said in `closure.go`.
