---
type: fix
spec: guidelines
status: ready
created: 2026-08-18
---

# Drain the fuzz-soak backlog iteratively

## Intent

v0.12.0 landed 349 commits across 914 files, and the release gate is the only
place the fuzz lanes run at their `--soak` budgets with a VARYING seed
(`RT_FUZZ_SEED: ${{ github.run_id }}`). Nothing in `.github/workflows` runs on a
timer, so a release cycle's worth of latent defects surfaced all at once at
release time, one seed per round. Three gate rounds drained four findings:

- **typemod** (#342) — the structural-id walker never terminated on a type tsgo
  error-recovered from truncated source. Fixed with a total-expansion budget.
- **i18n** (#342) — a fuzz HARNESS bug: the model expected a leaf live that the
  reconciler had correctly parked in an `@rtOrphanChild`.
- **nondata** (#343) — an index signature swept function-typed declared props, so
  the index value's encoder ran over a function: binary threw an uncontrolled
  `TypeError`, JSON silently emitted the function's source text.
- **convert** (#344) — a never-rest tuple `[T, ...never[]]` changed structural id
  through the builders form (C2).

The defect population is finite and strictly decreasing: each fix removes a real
cause permanently. What is random is WHICH defect a seed surfaces, not how many
exist. So the work is a loop, not a one-shot change. Why they were invisible
until now is already diagnosed in
[fuzz-frozen-seeds-and-silent-gates](../done/fuzz-frozen-seeds-and-silent-gates.md):
the default runs use frozen literal seeds and only the soak branch honours
`RT_FUZZ_SEED`.

## Direction

Run the loop until it comes back quiet:

1. Run the soak lanes on a FRESH seed — `RT_FUZZ_SEED=<n> pnpm rtx core fuzz
   <suite> --soak` locally, or dispatch `release-gate.yml` (it has
   `workflow_dispatch`) to run the whole gate on any branch.
2. Reproduce the finding deterministically BEFORE touching code. Every lane
   prints its replay knob (`RT_FUZZ_TYPEMOD_REPLAY`, `RT_FUZZ_I18N_REPLAY`, the
   per-iteration seed for the type lanes, `RT_FUZZ_SEED` for the Go convert
   sweep).
3. Root-cause it, and decide product bug vs harness bug first. The i18n finding
   was the harness being wrong; "fixing" the product there would have broken
   correct behaviour.
4. Fix it with a pinned regression test, verified DIFFERENTIALLY.
5. Repeat until 2-3 consecutive rounds on fresh seeds are clean.

Verification gotchas, learned the hard way in the v0.12.0 rounds:

- **A pinned test must be verified to FAIL without its fix.** One index-signature
  test initially used a string-literal index value, whose encoder writes a
  constant and never dereferences the swept member — it passed with AND without
  the fix and proved nothing. Stash the fix, rebuild, watch it fail, restore.
- **Never run a stash/rebuild differential concurrently with another
  verification run.** `bin/ts-runtypes` gets swapped underneath the other run and
  silently contaminates its result.
- Rebuild the binary (`pnpm run check:builds`) after any Go change before
  re-running a JS lane.

Decide the release-blocking rule once and write it into the
[release-to-prod skill](../../.claude/skills/release-to-prod/) so it is not
re-litigated every cycle. Proposal: a soak finding blocks the release when it
regresses something THAT release introduces (the convert bug was in a verb
v0.12.0 ships for the first time); a latent bug already shipped in a prior
version becomes its own todo instead of holding the release.

Structural follow-up worth taking alongside: add a `schedule:` running the soak
lanes on `main`. Today the only `schedule:` string in the repo is inside a
COMMENT in `release-gate.yml`, which notes the budgets "only executed when a
human typed the command". Moving discovery off the release path is what stops
this recurring; cadence and placement are the implementer's call.

## Done when

- 2-3 consecutive soak rounds on fresh seeds come back clean across every lane.
- Every finding fixed along the way carries a pinned regression test that was
  verified to fail without its fix.
- The release-blocking triage rule is written down.
- Optionally, the soak lanes run on a schedule outside the release path.

## Plan — drain the backlog (approved 2026-08-18)

Three decisions were taken before building, and they narrow the direction above:

- **Rounds run locally first**, moving to CI once the new workflow reaches `main`.
- **No `schedule:`.** The optional timer was declined. These budgets are a real
  wall-clock commitment, and a nightly red nobody watches trains people to ignore
  it, so discovery stays something a human starts, just far cheaper to start.
- **Every soak finding blocks the release.** The "latent bugs become their own
  todo" carve-out this doc proposed was rejected in favour of the strict rule.

### What shipped alongside the fixes

- **`.github/workflows/fuzz-soak.yml`** — the same twelve lanes as the gate, by
  dispatch, off the release path. `lane` picks one (a replay burns one runner,
  not twelve) and `seed` pins `RT_FUZZ_SEED`; blank derives one from the run id.
  A round costs twelve short jobs instead of the gate's full e2e + benchmarks +
  docs build.
- **`packages/ts-runtypes-devtools/test/fuzz-lane-contracts.test.ts`** — pins the
  lane list equal across four places that had no reason to agree: rtx's `FUZZ`
  registry, the gate's matrix, and both lists in the new workflow. Also asserts
  each workflow sets `RT_FUZZ_SEED` and echoes its replay command. This is the
  guard against the exact two failures already seen here: a dead `jsonschema`
  lane sitting in the gate's matrix, and `roundtrip` / `size` / `nondata` having
  registered soak env vars with no registry entry able to set them.
- **The triage rule**, written into the
  [release-to-prod skill](../../.claude/skills/release-to-prod/) rather than left
  to be re-argued: every red soak lane blocks, fix forward on `main` and re-cut,
  and never re-roll the seed to get green. A fresh seed that passes is not
  evidence the bug is gone, only that the new seed did not reach it.

### Round methodology

A round is every lane with a `--soak` budget on one fresh seed. Locally the lanes
split in two, and the distinction matters:

- The `*_SOAK_MS` lanes are **time-boxed**, so CPU contention silently buys LESS
  coverage in the same wall clock. Run them alone, sequentially.
- The rest are **count-based** (sequences / iterations). Coverage is fixed by the
  count, so contention costs wall clock only. Run them concurrently.

Getting that backwards is a quiet way to run a round that looks complete and
explored a fraction of what it claims.
