---
type: chore
spec: guidelines
status: ready
created: 2026-08-20
---

# Extract the fuzz lanes' loop skeleton into a shared core runLoop

## Intent

Six fuzz runners each hand-roll the same loop skeleton: default the entry
seed, derive per-iteration seeds with mixSeed, run either a fixed iteration
count or a startSoakBudget duration, wrap the body in the crash guard, mark
the budget, stream violations through an onViolation callback, and assemble
runs / iterations / slowest-iteration fields into the report. The
duplication has a real cost: adopting the crash guard (core/crashGuard.ts)
took six near-identical edits, and a future lane can silently forget the
guard or the budget discipline because nothing owns them. Extract ONE shared
helper in test/fuzz/core/ that owns exactly those invariants, so a lane
cannot ship a loop without them. Deliberately NOT a framework: lanes keep
their own resources, stats, violation types, and reports around the helper.

## Direction

The implementer investigates and plans the details; rough shape:

- A `runLoop` (name free) in `test/fuzz/core/` owning: entry-seed
  defaulting, fixed-count vs duration control (`core/soakBudget.ts`),
  per-iteration crash guarding (`core/crashGuard.ts` — fold or compose),
  budget marking + the slowest-iteration pathology fields, and violation
  streaming. The lane passes a per-iteration callback and keeps everything
  else. Sync and async lanes both exist (value / cloning are synchronous
  compiled-fn loops; the rest are async).
- The six adopters and their quirks — the helper must serve them without
  hooks sprawl, or leave the odd one out with a note:
  - `value/fuzzRunner.ts` + `cloning/cloneFuzzRunner.ts`: targets ×
    iterations grid; the mixSeed label is the TARGET title, not the lane
    name, so per-iteration seeding can't be hardcoded to one label.
  - `type/typeFuzzRunner.ts` + `roundtrip/roundtripRunner.ts`: single
    stream, ClientHolder lifecycle stays lane-owned.
  - `binary/sizeFuzzRunner.ts`: cycles configs and respawns the client
    every 25 iterations; the deterministic floor stays OUTSIDE the loop
    (its loud failure is the resolver-reachable proof).
  - `elision/elisionRunner.ts`: closest to the plain shape (runLoop is
    already the local function name there).
- Behavior-neutral bar: same seeds hit the same iterations (replay lines
  and soak findings must stay stable within a release), reports keep their
  per-lane types and anti-vacuity counters, `core/crashGuard.unit.test.ts`
  and every lane's integration test stay green untouched or with mechanical
  import updates only.
- Out of scope unless trivial: `convert/convertRoundtrip.ts` (owns
  per-iteration failure capture natively) and the enrich sequence fuzzers
  (model-based, confirm-on-reproduce semantics).
- Docs: the fuzz README's core section describes the shared files — add the
  helper there when it lands.

## Done when

- The shared helper exists in `test/fuzz/core/` with its own unit test, and
  the six generation lanes' runners are thin wrappers around it (resources,
  stats, and report assembly still per-lane).
- No behavior change: entry seeds, per-iteration seed streams, report
  shapes, and every lane's integration test outcome are unchanged.
- A new lane gets seeding, budget, crash guarding, and pathology tracking
  by construction, not by copying a loop.
