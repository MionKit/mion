---
type: feature
spec: guidelines
status: done
completed: 2026-08-05
created: 2026-08-03
---

# Diagnose cross-site format sample-pool conflicts

## Intent

`docs/done/json-schema-keyword-first-formats.md` (Phase 0) removed `mockSamples`
from the typeID: two string formats identical but for their declared sample
pools now dedup onto ONE cache entry, which is the intended win (samples are
generation metadata, not validation behaviour). The residual: when two call
sites that dedup onto one entry declare **different** sample pools, the shared
entry mocks from whichever interned first. That is deterministic for a fixed
input but a mild footgun (adding/reordering unrelated code can change which
pool wins). This todo adds a **build-time error diagnostic** naming both sites
when it happens, so the ambiguity is surfaced instead of silent.

This was scoped out of the keyword-first-formats change deliberately: it is a
self-contained safety net, not part of the core id change, and proper
cross-site detection with dual source attribution is its own subproject.

## What shipped — FMT006

Detection sits exactly where the investigation predicted, at `Cache.assignID`'s
`byStructural` hit. That path deliberately returns WITHOUT projecting the
incoming type, so the second site's pool was never looked at; `reconcileSamples`
now reads it there and compares against the entry's.

Three outcomes, matching "absence is not an opinion":

| both declare, pools differ | FMT006, an error, naming both pools and the site that interned first |
| one declares, other absent | no error, and the declared pool is **adopted** onto the shared entry |
| both declare the same pool | no error, still one entry |

Pool comparison is ORDER-SENSITIVE: the order is what the mock generator indexes
into, so the same members in a different order really do produce different values
for one seed. Covered by its own test.

### Provenance turned out to be free

The spec expected to thread a declared-vs-generated flag to the comparison point.
Not needed: pattern sample AUTO-GENERATION is a separate later pass over already
interned nodes (`resolver.enrichPatternSamples`), so everything reachable at
`assignID` time is declared-only. Nothing to thread, nothing to recompute.

### Both sites, without new position plumbing

The cache cannot name a site — it has types, not call sites. So it LATCHES the
conflict (the pattern `depthExceeded` already uses) and `commitPending` raises it,
because that is where the call site lives. The resolver keeps `sampleOrigins`,
mapping an id to the FIRST site that resolved it — precisely the site whose pool
the entry kept — so the diagnostic anchors on the second site and names the first
in its message. No `*checker.Type`-to-position work was required.

### Tests

`internal/compiler/resolver/sample_conflict_test.go`: differing pools error with
both pools and the first site in the args at Error severity; declared-vs-absent
does not fire in EITHER scan order; identical pools do not fire; a reordered pool
does; and the shared entry demonstrably carries the adopted pool rather than
merely not erroring.

## Original direction follows

## Direction

The core id change already shipped in `typeid/formats.go`
(`canonicalLiteralMap` skips `mockSamples` at every depth). The diagnostic is
the remaining piece. The implementer plans the details, but the investigation
already pinned the hard parts:

- **The dedup point is `Cache.assignID`**
  (`internal/cachegen/runtype/serialize.go:548-554`): on a `byStructural`
  hit it returns the existing id **without projecting the incoming type**, so
  the second site's samples are never extracted today. Detection has to
  project-to-compare (or extract just the samples) at that hit for
  format-annotated types, then compare against the stored `cache.nodes[id]`
  node's `FormatAnnotation` samples.
- **Declared vs auto-generated provenance**: `pattern_enrich.go`
  (`enrichOneParams`, ~:141-198) fills `pattern.mockSamples` from the regex
  for patterns that declare none. Auto-generated pools are deterministic per
  `source`/`flags`, so they never differ for a shared id — only **declared**
  pools can conflict. The diagnostic must fire only on *different declared*
  pools; declared-vs-absent lets the declared pool win (absence is not an
  opinion). So provenance (declared? y/n) must reach the comparison point —
  either threaded on the annotation or recomputed.
- **Positions**: `assignID` takes a `*checker.Type`; node projection already
  attaches `Position` (serialize.go:1009/1211/1398), so both the stored
  node's position and the incoming type's declaration position are reachable,
  but the early-return path currently surfaces neither. The diagnostic needs
  both to name the two sites.
- **Diagnostic code**: add a new `FMT*` code in
  `internal/diagnostics/codes_runtype.go` (FMT005/`CodeFMTSampleGenFailed` is
  taken) + a message in `messages.go`, `SeverityError`, then regenerate the
  catalog (`pnpm rtx core codegen diag`).

## Done when

- Two files declaring the same string format with **different** declared
  `mockSamples` fail the build with a new FMT error naming both sites.
- Same format, one site declaring samples and the other none: no error, the
  declared pool wins.
- Same declared samples, or auto-generated-only: no error, still dedup to one
  entry.
- `go -C ts-go-runtypes test ./internal/...` green; diag catalog regenerated
  and `pnpm rtx core codegen all --check` clean.
