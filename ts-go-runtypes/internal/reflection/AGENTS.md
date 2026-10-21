# reflection: whole-type rules are walks

Read before writing any rule or check that must hold for a whole type.

## ⚠️ A whole-type rule is a walk, never a look at the root

Root-only rules let a member one object deeper slip through: prototype-named property check,
Map/Set circular-ref skeleton, silent-`any` guards, bare-generic check. These make that bug a failing test.

### One walk per side

- Standalone pass over a `RunType` graph (build rule, "graph contains X" predicate) → `reflection.WalkGraph`
  ([walk.go](walk.go)).
- It resolves refs, guards cycles, descends via `EachRefSlot` → a new `RunType` slot reaches every pass unchanged.
- Checker-side twins: `detectSilentAnyInGraph` (resolver, over `*checker.Type`), `marker.EachWrittenTypeRef`
  (written syntax, follows each reference into the declaration it names).
- Hand-rolled `for _, child := range node.Children` in a new pass = the bug.
- One exception: kind-aware noop + compat predicates in [cachegen/typefunctions](../cachegen/typefunctions/).
  Each mirrors its own emitter's arms and must stay per-kind.
- Their object members go through `objectMembers`: THE member list a codec walks
  (declared children + patternProperties entries as synthetic index signatures).

### The slot list is gated

- `EachRefSlot` ([refslots.go](refslots.go)) = the one enumeration of child-bearing slots.
- `refslots_test.go` fills every `*RunType` / `[]*RunType` field via Go reflection, fails when one is not visited.
  → a new slot cannot go unwired.

### Every diagnostic declares its Scope

- `ScopeRoot`: fires for the root type by design. `ScopeGraph`: anywhere in the type. `ScopeNotSource`: not from a type.
- `register` panics without it.
- `ScopeGraph` code with an `Example` in [prose.go](../diagnostics/prose.go) MUST also carry a `NestedExample`:
  same trigger one object deeper.
- `TestDiagExamples_TriggerAtDepth` in [compiler/resolver](../compiler/resolver/) feeds it through the real scan.
- That "same test, one level deeper" twin is the cheapest detector: write it for any new rule, gate or not.

### "Is it data?" is decided once

- `reflection.NonDataOf` ([nondata.go](nondata.go)) = the Go mirror of `DataOnly<T>`.
- Strip checks, root codes, JSON noop / compat / safe-to-share shortcuts and the wire `NotSupported` flag all read it.
- Hand-written kind test in an emitter or a shortcut = the bug.
- `nondata_agreement_test.go` in [cachegen/typefunctions](../cachegen/typefunctions/) fails when a kind has no row
  or a family's root disagrees.
- Platform-declared classes + `URL`: [typeid/AGENTS.md](../cachegen/runtype/typeid/AGENTS.md).

### A finding reaches the sites whose FUNCTION calls its entry

- Never the sites whose type merely contains it.
- A walk reports at the sites that named its type. `ReportReachedFindings` walks the entry graph for the rest
  (other families + noop-skipped children included).
- `TestNestedDiagCorpus` in [compiler/resolver](../compiler/resolver/) puts every non-data trigger
  at every position under every family.
- It fails on a silent throw, a silent drop, or a build that disagrees with the dev scan.
- Its `Covers*` gates fail when a family or a non-data kind has no row.
