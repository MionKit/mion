---
type: chore
spec: guidelines
status: done
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

## Plan — shared `core/runLoop.ts` (approved 2026-08-27, shipped)

### What landed

`packages/ts-runtypes/test/fuzz/core/runLoop.ts` — two entry points,
`runFuzzLoop` (async) and `runFuzzLoopSync`, plus `core/runLoop.unit.test.ts`.
The helper owns: entry-seed defaulting (`seed ?? defaultSeed ?? Date.now()`,
normalised to uint32), per-step seed derivation via `mixSeed`, fixed-count vs
duration control (exactly one of `rounds` / `durationMs`, else it throws), the
crash guard around every step, `budget.mark()` per round with the
`slowestIterationMs` / `slowestIterationRound` pathology fields, and violation
streaming to `onViolation`.

Two levels, because the lanes genuinely need both:

- a **round** is the budget unit (one mark each, the soak stops between rounds),
- a **step** is the seeding and crash-guarding unit.

Most lanes run one step per round; value and cloning run one step per target
inside a round, which is what keeps their soak seed stream
`mixSeed(seed, target.title, round)` intact.

One optional hook, `setup(seed)`, runs inside the budget but outside the crash
guard. Two lanes need exactly that: the binary lane's deterministic floor (its
loud failure is the resolver-reachable proof, so it must never be swallowed) and
the elision lane's resolver client + convert project. `withSeededRandom` stayed
lane-side rather than becoming a flag, since only two lanes wrap a whole
iteration in it.

### Adopters

All six, each keeping its own resources, stats, violation type and report:

- `value/fuzzRunner.ts`, `cloning/cloneFuzzRunner.ts` — fixed mode runs one round
  per target with `iterations` steps inside it, which preserves the original
  target-major violation order; soak runs one round per pass over all targets.
- `type/typeFuzzRunner.ts`, `roundtrip/roundtripRunner.ts` — one step per round;
  `ClientHolder` stays lane-owned in a `try`/`finally` around the loop.
- `elision/elisionRunner.ts` — the local `runLoop` is gone; client and convert
  project moved into `setup`.
- `binary/sizeFuzzRunner.ts` — its nested config loop was flattened onto the flat
  round index (fixed: `block = floor(round / perConfig)`; soak:
  `block = floor(round / 25)`, config cycling `block % SIZE_CONFIGS.length`), so
  the `cfg{n}` / `soak{n}` seed stream is preserved exactly. A small `BlockClient`
  holder opens a client when the block changes and takes the respawned one back
  from `runOneWithRespawn`.

### Behaviour neutrality, verified

- The flattened binary index math was checked against the original nested math
  over many iteration counts for both modes: identical `(label, index)` pairs and
  identical config cycling.
- `runTypeFuzz`, `runRoundtripFuzz`, `runSizeFuzz` and `runElisionFuzz` were run
  on pinned seeds before and after the change: identical `runs`, `iterations`,
  `seed`, per-lane stats, violations and crashes.
- The whole JS suite is green (374 files, 10322 tests), the six lanes' existing
  integration tests untouched.

### One deliberate addition

Elision was the only lane whose report lacked the slowest-iteration fields, so it
had no pathology tripwire. It now gets them from the helper, and its soak test
asserts `pathologyReport(...)` is null like the other five. A single unbounded
iteration there now fails as a named finding instead of blowing the vitest
timeout.

### Out of scope, as filed

`convert/convertRoundtrip.ts` (no crash guard, no soak budget, no seed
defaulting — genuinely a different loop) and the enrich sequence fuzzers.

### Docs

`test/fuzz/README.md` gained a `runLoop.ts` bullet in the shared-core section.
