---
type: chore
spec: guidelines
status: ready
created: 2026-08-19
---

# The fuzz lane list is duplicated four ways, and the plumbing around it drifted

## Intent

Draining the v0.12.0 soak backlog ([drain-fuzz-soak-backlog](../done/drain-fuzz-soak-backlog.md))
added `.github/workflows/fuzz-soak.yml` so a soak round can run off the release
path. It works, but it left the lane list spelled out in FOUR places, and while
wiring it up several older inconsistencies in the surrounding plumbing surfaced.

None of these breaks anything today. They are all the same shape of hazard: a
lane can stop being exercised without anyone noticing, which is exactly what
`drain-fuzz-soak-backlog` and
[fuzz-cloning-lane-wiring-drift](../done/fuzz-cloning-lane-wiring-drift.md) were
both about. A dead `jsonschema` lane already sat in the gate's matrix long enough
to break a release round.

## Findings (verified 2026-08-19)

1. **The lane list lives in four places.** rtx's `FUZZ` registry
   ([scripts/rt.mjs](../../scripts/rt.mjs), the entries carrying a `soak` key),
   `release-gate.yml`'s `fuzz-soak` matrix, and BOTH the `lane` choice options
   and the `pick` step's JSON in `fuzz-soak.yml`. They are pinned equal by
   [fuzz-lane-contracts.test.ts](../../packages/ts-runtypes-devtools/test/fuzz-lane-contracts.test.ts),
   so drift now fails loudly rather than silently — but the duplication itself
   is untouched.

2. **`release-gate.yml` duplicates the whole soak job** rather than calling the
   new reusable one. It was left that way deliberately: `pre-publish.yml` already
   calls the gate via `workflow_call`, so another nesting level would re-prefix
   every check name (`gate / fuzz soak · X` gains a segment) while a release PR
   was open against a `prod` ruleset that requires named checks. That constraint
   disappears once no release is in flight.

   Worth weighing during design: `workflow_call` removes only ONE of the four
   lists. A `workflow_dispatch` choice input's `options` are not readable at
   runtime, so they can never feed a matrix — those two lists inside
   `fuzz-soak.yml` stay separate whatever happens. The change that actually
   collapses the duplication is deriving the matrix from the rtx registry.

3. **Deriving from the registry reverses a deliberate decision.** `release-gate.yml`
   states the literal list is the intended trade: "a new entry in the FUZZ
   registry does not soak here until it is added to this list — a soak budget is
   a wall-clock commitment, not a default." The contract test in finding 1 already
   softened that (registry and workflows must now match, so adding a budget
   forces a workflow edit or CI fails). Decide deliberately whether the opt-in
   survives; do not let it erode as a side effect a second time.

4. **`all` is not all.** `all: {patterns: ['fuzz.integration', 'typeFuzz.integration',
   'binaryEncoderResize']}`. Because vitest positional filters are case-insensitive
   substring matches, that accidentally sweeps up most lanes, but it MISSES
   `roundtrip`, `size`, `race` and `convert` (the last being Go-side, which a
   vitest pattern can never reach). So `pnpm rtx core fuzz all` runs 8 of 12
   lanes, and the 8 are accidental rather than declared. The gate's own comment
   describes `all` as "a composite of lanes already listed", which is not true.

5. **Budget knobs have four different shapes.** Six lanes take a duration
   (`RT_FUZZ_*_SOAK_MS`), three take sequence counts (`*_SEQUENCES` + `*_MAXCMDS`
   or `*_MAXSTEPS`), `race` takes `ITERATIONS` + `FANOUT`, and `convert` /
   `convertcli` SHARE one `RT_FUZZ_ITER`. The shapes are mostly justified (a
   time-boxed lane and a sequence-count lane really are different), but the
   shared `RT_FUZZ_ITER` means exporting it in a shell hits both convert lanes at
   once. This has a real consequence recorded in
   [drain-fuzz-soak-backlog](../done/drain-fuzz-soak-backlog.md): time-boxed lanes
   silently buy LESS coverage under CPU contention while count-based ones do not,
   so the two kinds cannot be scheduled the same way. Nothing states that anywhere
   a reader would look.

6. **Three lanes reach for the seed helpers inconsistently.** `enrich`, `i18n` and
   `typemod` call `parseSeed(process.env.RT_FUZZ_SEED, <pinned>)` directly instead
   of the `laneSeed()` / `soakSeed()` helpers in
   [core/fuzzPolicy.ts](../../packages/ts-runtypes/test/fuzz/core/fuzzPolicy.ts),
   so they skip the "print the seed when it differs from the pinned default"
   behaviour every other lane gets.

## Direction

Investigate and plan at build time; the shape above is findings, not a design.
Rough order of value: pick ONE source of truth for the lane list (finding 3 is the
decision that unlocks findings 1 and 2), then fix `all` so its name is honest or
rename it, then document the time-boxed vs count-based split so nobody schedules
them wrongly again.

Do it when no release is in flight, so check names can change freely.

## Done when

- A lane is named in one place, or the places are justified in a comment and
  pinned by the existing contract test.
- `pnpm rtx core fuzz all` either runs every lane or is named for what it does.
- The time-boxed vs count-based distinction is written down somewhere an
  implementer will find it before scheduling lanes concurrently.
- The opt-in question in finding 3 is answered deliberately, either way.

## Out of scope

The seeding policy itself (pinned defaults, timestamp-derived entry seeds,
logging a seed so a failure replays). That is being changed separately; finding 6
here is only about which helper the three model lanes call, not what the helpers
should do.
