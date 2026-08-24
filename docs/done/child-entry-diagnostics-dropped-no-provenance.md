# Diagnostics from interned CHILD entries were silently dropped (no provenance)

**Status:** done — fixed in `feature/devtools-bun-lane-and-diagnostics`.
**Type:** bug (diagnostics coverage)
**Created:** 2026-08-21 (found while adding `diagnostics.Dedupe`)
**Closed:** 2026-08-21

## The bug

A diagnostic raised while walking an **interned child entry** never reached the user. It was
not deduped, not downgraded, not logged: it was dropped before it became a `Diagnostic`.

`Walker.rootProvenance` was populated per entry from the marker call sites that demanded
**that entry's own root type**:

```go
// internal/cachegen/typefunctions/module.go
walker.rootProvenance = opts.ProvenanceSites[runType.ID]
```

A child type reached through a parent (`Pet` inside `{pet: Pet}`) gets its OWN cache entry,
keyed by its own id — an id that was never a marker call argument. So
`ProvenanceSites[Pet.ID]` was empty, and `EmitDiagnostic` bailed rather than render a
diagnostic with an empty `filePath`.

Same class, same emitter, three positions — only the root-position one warned:

| Source | CLS001 before | after |
| --- | --- | --- |
| `createJsonEncoderFn<Pet>()` | `["CLS001(Pet)"]` | `["CLS001(Pet)"]` |
| `createJsonEncoderFn<{pet: Pet; owner: Owner}>()` | `[]` | `["CLS001(Owner)", "CLS001(Pet)"]` |
| `createJsonEncoderFn<Pet \| Owner>()` | `[]` | `["CLS001(Pet)", "CLS001(Owner)"]` |
| `createJsonEncoderFn<{a: {b: {c: Pet}}}>()` | `[]` | `["CLS001(Pet)"]` |

CLS001 was only the visible example: the gate was in `EmitDiagnostic`, so this applied to
**every** code raised from a child walk, the `…010`+ member-level warnings included. Nesting
is the normal way people write types, so most occurrences of most child-position diagnostics
never reached anyone.

## The fix

`inheritProvenanceToDescendants` (`internal/compiler/resolver/render.go`) — after the direct
call-site map is built, every type REACHED BY a site inherits that site's provenance, walked
through `EachRefSlot` with a per-root visited set (so a recursive type terminates and reports
once) and a depth cap for un-interned inline subtrees.

**Why "every site that reaches it" is the right attribution.** The established rule for a root
type is one diagnostic per CALL SITE, not one per type id. Inheriting provenance keeps that
rule intact one level down: a site is told about the types it actually pulls in. Repeats
collapse in `diagnostics.Dedupe`, so a child reached by several paths from one site, or by
several cache families, still yields one line.

## Measured volume

The worry was that fanning out to every reaching site would flood a real project. It did not,
because the same change set also deduped the per-family repeats. Measured on mion's router
suite:

| | CLS001 lines |
| --- | --- |
| before (published 0.12.0) | 148 |
| after (dedupe + inherited provenance) | **29** |

So coverage went UP (nested and union classes now report at all) while noise went DOWN 5x.
mion's full router + core suites stay green, as does the whole ts-runtypes JS suite.

## Open question that turned out not to need an answer

The original spec asked whether root-position-only was partly deliberate — a way to keep the
advisory quiet. It was not: the `EmitDiagnostic` comment justifies the branch by RENDERING (no
empty `filePath`), not by policy. With the volume measured as a net reduction, there was no
trade-off left to put to the user.
