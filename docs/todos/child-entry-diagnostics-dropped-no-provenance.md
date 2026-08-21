# Diagnostics from interned CHILD entries are silently dropped (no provenance)

**Status:** todo
**Type:** bug (diagnostics coverage)
**Created:** 2026-08-21 (found while adding `diagnostics.Dedupe` — see
[../done/](../done/) once that ships; the dedup work is unrelated and did NOT cause this)

## The bug

A diagnostic raised while walking an **interned child entry** never reaches the user. It is
not deduped, not downgraded, not logged: it is dropped before it becomes a `Diagnostic`.

`Walker.rootProvenance` is populated per entry from the marker call sites that demanded
**that entry's own root type**:

```go
// internal/cachegen/typefunctions/module.go:504
walker.rootProvenance = opts.ProvenanceSites[runType.ID]
```

A child type reached through a parent (`Pet` inside `{pet: Pet}`) gets its OWN cache entry,
keyed by its own id — an id that was never a marker call argument. So
`ProvenanceSites[Pet.ID]` is empty, and `EmitDiagnostic` bails:

```go
// internal/cachegen/typefunctions/walker.go:407
if len(w.rootProvenance) == 0 {
    // No call sites known — skip rather than emit a Diagnostic
    return
}
```

## Evidence

Same class, same emitter, three positions. Only the root-position one warns:

| Source | CLS001 emitted |
| --- | --- |
| `createJsonEncoderFn<Pet>()` | `["CLS001(Pet)@3"]` |
| `createJsonEncoderFn<{pet: Pet; owner: Owner}>()` | `[]` |
| `createJsonEncoderFn<Pet \| Owner>()` | `[]` |

Reproduce with the `withInlineSources` harness in
[packages/ts-runtypes-devtools/test/helpers/inline.ts](../../packages/ts-runtypes-devtools/test/helpers/inline.ts),
scanning each shape and filtering `family === Family.RunType`.

CLS001 is just the visible example — the gate is in `EmitDiagnostic`, so this applies to
**every** code raised from a child walk, the `…010`+ member-level warnings included.

## Why it matters

The advisory is exactly as true for a nested class as for a root one: `{pet: Pet}` decodes
`pet` to a plain object, not a `Pet` instance, unless `registerClassSerializer(Pet, …)` is
called. A user nesting their classes (the normal case — a class at the root of an encoder is
the exception) is told nothing at all.

Worse, it is invisible: the "no provenance" branch exists so a diagnostic never renders with
an empty `filePath`, which is right, but the effect is a silent drop with no counter and no
debug line.

## Fix plan

1. **Propagate provenance down the walk.** When the resolver renders a child entry demanded
   by a parent, seed the child walker's `rootProvenance` from the ancestor entries that
   reach it (transitively — a child can have several parents, each with several call sites).
   The demand graph already knows these edges: entries carry `rtDependencies`, and the
   cross-family fixpoint in `internal/compiler/resolver/dispatch.go` already walks them to
   render foreign entries.
2. **Expect volume to rise, and lean on the dedup.** One shared child entry (`string` with a
   format, a common DTO) can be reachable from many call sites, so a naive fan-out reports at
   every one of them. `diagnostics.Dedupe` collapses exact repeats but NOT the same finding
   at N distinct sites — which is arguably correct (each site really does have the problem)
   but should be measured against a real project before shipping. Consider capping the
   fan-out per code, or attributing a child diagnostic to its nearest *rooted* ancestor
   rather than to every leaf call site.
3. **Never drop silently.** Whatever the outcome, a diagnostic that cannot be attributed
   should be counted and surfaced under a debug flag rather than vanishing at
   `walker.go:407`.

## Open question for the user

Is the current behaviour partly deliberate — root-position only, to keep the advisory quiet?
The `EmitDiagnostic` comment justifies the branch by RENDERING (no empty `filePath`), not by
policy, which reads as an accident rather than a decision. Confirm before changing it, since
the fix meaningfully increases how much a normal build prints.

## Done when

- A nested / union-member class raises CLS001 at the call site that pulled it in.
- The volume change is measured on a real project (mion is the handy one) and accepted.
- No code path drops a diagnostic without a trace.
