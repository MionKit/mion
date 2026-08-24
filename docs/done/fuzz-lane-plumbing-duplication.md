---
type: chore
spec: guidelines
status: done
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

6. ~~**Three lanes reach for the seed helpers inconsistently.**~~ **DONE** —
   fixed by the version-seeding change: `laneSeed` / `soakSeed` collapsed into one
   `entrySeed(lane)` that every lane now calls, including the two sidecar lanes in
   `packages/ts-runtypes-go-be-sidecar` and both Go sweeps.

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

The seeding policy itself, which shipped separately: every lane now derives its
entry seed from the package version and logs it. That change also closed finding 6
above.

## Plan — quick tier + registry-derived lanes (approved 2026-08-19)

Approved with one addition to the original direction: **a per-PR QUICK tier**.
Waiting for a release to run soak budgets means findings arrive with their cause
long out of context, so every lane now also runs on every PR at roughly twice
its default budget, placed to keep the two CI jobs balanced rather than to add
runners.

Measured first, on real runs (the numbers that sized the tier):

| | wall clock | notes |
| --- | --- | --- |
| full soak round | ~96 runner-min over 12 parallel jobs | slowest lane `typemod` 27m46s; `enrich` 14m06s, `i18n` 10m16s, the other nine 4-6m |
| per-PR defaults (before) | ~1.5 min | already ran inside `go tests + fuzz`; the gate itself called them "close to decorative" |
| per-PR quick tier (after) | ~3 min of runner time | +~50s PR wall clock, no new runner instances |

What shipped:

1. **One source of truth** (findings 1-3). The `FUZZ` registry in
   `scripts/rt.mjs` owns the lane list; `rtx core fuzz-lanes` emits the soak
   lanes as JSON and both soak workflows build their matrices from it through a
   ~30s `pick` job. **The opt-in survives, relocated**: a lane soaks only if its
   registry entry carries a `soak` budget, which is still a deliberate
   wall-clock commitment, now stated once instead of four times. Four lists
   became one plus one justified copy: a `workflow_dispatch` choice input's
   `options` are resolved before any job runs and can never be derived, so that
   list stays literal and `fuzz-lane-contracts.test.ts` pins it to the registry.
   `release-gate.yml` was NOT converted to call the reusable workflow (finding
   2): deriving the matrix is what actually collapsed the duplication, and
   nesting `workflow_call` would have re-prefixed every check name for no
   further gain.
2. **`all` is now all** (finding 4). It runs every lane at its default budget:
   the whole `test/fuzz` tree, both sidecar lanes, `race` (it sets
   `RT_FUZZ_RACE=1` itself) and both Go sweeps under `internal/convert` —
   including `TestFuzz_SchemaDocDeterminism`, which no lane reached before. It
   takes no tier flag, because a quick or soak round is per-lane by design.
3. **The scheduling rule is enforced, not just written down** (finding 5).
   `rtx core fuzz` accepts several lanes in one invocation, and when that set
   contains a time-boxed (`*_SOAK_MS`) lane it runs the files sequentially and
   says why. Batching also pays vitest's startup once: the six time-boxed lanes
   take ~2min together versus ~3.5min run separately. Lanes that would collide
   on the shared `RT_FUZZ_ITER` now fail loudly instead of silently taking one
   budget. The rule is documented in the registry header, `docs/FUZZING.md` and
   the fuzz README.
4. **Quick tier in `ci.yml`**, split by that same rule: the six time-boxed lanes
   run as one sequential batch on the `js tests + lint` runner, the count-based
   lanes ride `go tests + fuzz`'s sweep (whose exclude list removes the six, so
   the jobs stay a disjoint partition), and `RT_FUZZ_ITER` widens the Go sweeps.
   Seeds stay version-derived per PR, so a red lane belongs to that PR and
   replays locally with the command the failing step names. Projected from the
   measurements: both jobs land ~7.5 min, against 6m41s and 5m26s before.

Drive-by fixes found while working: `rtx core fuzz constructor` used to pass the
unknown-suite guard and crash on a prototype property; `SETUP.md` documented a
`pnpm rtx dev …` area that no longer exists; the env registry's fuzz header
referenced `package.json` fuzz scripts that are gone, and `RT_FUZZ_ITER`'s row
did not mention that it drives two lanes.
