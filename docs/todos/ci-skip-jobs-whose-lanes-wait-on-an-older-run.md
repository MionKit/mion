---
type: fix
spec: full-plan
status: ready
created: 2026-11-08
---

# CI skips a job whose lanes wait on an older run, and stops one a newer run took over

## Problem

On MionKit/mion#588, commit 7b09c27 changed only a `docs/todos/` file. It was pushed 3.5 minutes after
1bb27ed, whose `ci` run 42497312877 was still going. The content gate behaved correctly: it works per commit,
not per pull request. It kept the older run and set `deferredTo` on every lane that hashes the same. The go
suite, js suite, fuzz, smoke, website and bench jobs all showed as skipped.

`js lint` (`js-static`) and `go checks` (`go-checks`) in run 42497607316 still started full runners anyway.
Each one ran checkout, bootstrap and the resolver, then idled about 2 minutes in "Wait for the older run's …".
Then it ran the ungated "Build the resolver + dists" step and skipped every lane step. The checks list shows
them as green jobs that ran. `build the Go binaries` (`go-build`) also started, for nothing.

Cause:
- Commit 8bf5b19 moved the wait inside the job (`.github/actions/wait-for-older-run`), so a job could run its
  checks that read comments (raw lanes) before waiting on the code lanes.
- A later split broke the jobs up: go-checks, go-suite, js-fuzz-sweep, js-fuzz-timeboxed, js-static, js-suite,
  js-serial. Now no job holds both kinds of lane, so nothing runs before the wait.
- `supersede()` (`scripts/ci/supersede.mjs:51-57`) keeps `run: true` on a deferred lane. Every job `if:` that
  reads `.run` therefore starts the job: `ci.yml:134, 149, 293, 350, 402, 490, 577`.
- go-suite and smoke in `ci.yml`, plus every heavy job in `pr-heavy.yml` and `drizzle-e2e.yml`, already wait in
  a waiter job built on `.github/workflows/lane-wait.yml`. That job is a cheap runner with no bootstrap. The
  heavy job reads `waiter || gate` and shows as skipped. In pr-heavy run 42497607439 only `e2e-wait` ran, and
  that is correct.

## Plan

### A. Four new waiter jobs in `ci.yml`

Copy `go-suite-wait` (`ci.yml:223-236`): `needs: lanes`, `actions: read`, `uses: ./.github/workflows/lane-wait.yml`,
`decision: ${{ needs.lanes.outputs.lanes }}`, `minutes: 70`.

| waiter | lanes | `jobs:` prefix | heavy jobs that need it |
|---|---|---|---|
| `go-checks-wait` | `go-static go-tools` | `go checks` | go-checks |
| `js-fuzz-wait` | `js-fuzz` | `js fuzz` | js-fuzz-sweep, js-fuzz-timeboxed |
| `js-static-wait` | `js-static` | `js lint` | js-static |
| `js-suite-wait` | `js` | `js suite` | js-suite, js-serial (`js suite (one worker)` matches the prefix) |

- Single-lane waiters: `if: fromJSON(needs.lanes.outputs.lanes)[<lane>].deferredTo`.
- `go-checks-wait` starts only when the job has nothing to run yet. With G = `go-static` and T = `go-tools`:
  `(G.deferredTo || !G.run) && (T.deferredTo || !T.run) && (G.deferredTo || T.deferredTo)`.
  A comment-only JS edit moves `go-tools` (raw) but not `go-static`. A plain "any deferred" waiter would then
  hold `go-tools` behind the older run, which is the slowdown 8bf5b19 fixed. In that mixed case the job starts
  at once and re-runs gofmt and vet, about a minute.

### B. Each of the six heavy jobs (go-checks, js-fuzz-sweep, js-fuzz-timeboxed, js-static, js-suite, js-serial)

- `needs: [lanes, <waiter>, go-build]`.
- In the job `if:`, change `fromJSON(needs.lanes.outputs.lanes)` to
  `fromJSON(needs.<waiter>.outputs.lanes || needs.lanes.outputs.lanes)`. Keep `!cancelled()`: it lets the job
  run past a skipped waiter.
- `MION_LANES: ${{ needs.<waiter>.outputs.lanes || needs.lanes.outputs.lanes }}`.
- Delete the wait step and the `actions: read` permission it needed. Save steps keep reading hashes from
  `needs.lanes`.
- Drop `fetch-depth: 2` in go-checks and both fuzz jobs. Keep it in js-static, js-suite and js-serial:
  `test-pr --base HEAD^1` needs it.
- go-checks: gate "Build the resolver + dists" (`ci.yml:190`) on `fromJSON(env.MION_LANES)['go-tools'].run`.
  Move "Record gofmt and vet as green" to right after `Go vet`.
- The `*-green` jobs need no change: they already use `!cancelled()` and accept a skipped job.
- `--pr` / `js-pr` keep working: `lane-wait.yml` passes `--pr`, and `deferredKeys` adds `js-pr` on a PR.

### C. Delete `.github/actions/wait-for-older-run/`

After B nothing uses it. Per the AGENTS.md removal rule, leave no comment, test or doc line naming it.
Rewrite `ci.yml:222` ("A matrix job cannot wait in a step…") and `.github/actions/ci-lanes/action.yml:31-32`
("or a wait step placed after the checks that read comments").

### D. Other jobs that start a runner for nothing

- `go-build` (`ci.yml:134`): gate it on `(L.run && !L.deferredTo)` for each of its lanes. The heavy jobs then
  accept `contains(fromJSON('["success","skipped"]'), needs.go-build.result)`. On a skipped `go-build` the
  resolver action restores or builds the binaries itself. That is slower only when the older run failed, and
  it saves a runner on every deferred commit.
- drizzle `decide` (`drizzle-e2e.yml:74`): it has no `if:` and does a full-history checkout on every run. Add
  `if: fromJSON(needs.lanes.outputs.lanes).drizzle.run`. `build` already requires `decide.outputs.run == 'true'`.
- Run a final sweep over every job in `ci.yml`, `pr-heavy.yml` and `drizzle-e2e.yml`. Look for a job that
  starts while none of its lanes runs (`run && !deferredTo`), or a step that runs when its lane does not. Fix
  each one you find in this PR.
- Leave `commitlint` alone. Skipping it on label events would make a skipped (green) check hide an earlier
  red one on the same commit.

### E. A kept older run's job stops when a newer run takes over its lane

GitHub can only cancel a whole run, never one job. `supersede()` keeps an older run only when every code lane it
runs is unchanged, so the only lanes a newer run can re-run while the older one still runs them are the raw ones:
`go-static`, `go-tools`, `js-static`. Today the old and new `go checks` and `js lint` then both run to the end.

- The job stops itself. In `go-checks` and `js-static`, on a pull request, the long steps run under a watcher.
  About once a minute it lists the newer active runs of the same workflow and PR, using the same filters as the
  gate's listing in `.github/actions/ci-lanes`. It reads their `lane-decision` artifacts. A newer run takes over
  lane L when its decision runs L itself (`run`, no `deferredTo`) under a different hash.
- Once every lane of the job is taken over, the watcher kills the running step. The steps below skip, and no
  marker is saved. The job ends green with a step summary naming the newer run. It must not end red: the older
  commit's checks stay readable, and no waiter sees a failed job.
- Put the decision in a pure function in `scripts/ci/supersede.mjs`, next to `supersede()`. It takes this run's
  lanes and hashes plus the newer runs' decisions, and returns the lanes taken over. Run the polling through a
  `gh` function passed in, like `waitForRun`. Use a CLI wrapper (for example `--watch … -- <command>`) for the
  steps. Any `gh` error counts as "not taken over", so the job keeps running.
- Fails safe. Suppose an even newer run defers L to this stopped run. Its waiter ends when this run completes,
  re-decides, finds no marker and runs L.
- Polling budget: two jobs, one listing per minute plus one download per newer run. That stays inside the
  GITHUB_TOKEN limit of 1,000 requests per hour, together with the waiters.

## Tests

`packages/devtools/test/ci-supersede.test.ts`:
- The takeover function:
  - a newer run that runs L under a new hash takes it over;
  - one that defers L, has the same hash, or has L off by label does not;
  - no decision means not taken over;
  - only lanes of this job count.
- A seeded property check: a lane is taken over only when some newer run runs it itself under a different hash.
- The watcher with a fake `gh` and a fake clock:
  - takeover kills the command and reports it;
  - no takeover lets the command finish with its own exit code;
  - `gh` errors never stop it.

`packages/devtools/test/ci-lane-contracts.test.ts`:
- go-checks and js-static wrap their long steps in the watcher, on pull requests only.
- Their save steps skip once the job was stopped.
- `WAITERS` (~716): add the six ci.yml jobs and their lanes. `WAITER_NAME` (~721): `js-fuzz-sweep` and
  `js-fuzz-timeboxed` map to `js-fuzz-wait`, and `js-serial` maps to `js-suite-wait`. The per-waiter test
  (~774-795) then pins prefix, `deferredTo`, `needs`, `!cancelled()` and `waiter || gate`. Also assert there
  that each waiter grants `actions: read`.
- Delete `IN_JOB_WAITERS` (~729), the `describe('waits inside each heavy job…')` block (~800-860), and the
  `IN_JOB_WAITERS` branch in "sets MION_LANES from the waiter" (~880).
- New tests:
  - a multi-lane waiter starts only when each of its lanes is `deferredTo || !run`;
  - no workflow has a step named "Wait for the older run", and no file names the deleted action;
  - go-checks gates its dists build on `go-tools`, and the `go-static` save sits right after `Go vet`;
  - `go-build` and drizzle `decide` stay skipped when every lane they serve is deferred or off.
- Narrow the start-condition strip (~519-523) and the `go-build` checks (~699-703) to the new shape.

`packages/devtools/test/ci-skip-defaults-contracts.test.ts` (~56-74): every heavy job now reads `waited(...)`.
The fuzz items read `waited('js-fuzz')`, js-serial reads `waited('js-suite')`, and go-checks reads
`waited('go-checks')`. Update the comments at ~2 and ~58.

Run `pnpm exec vitest run ci-`, `pnpm run lint`, and `actionlint` on the changed workflows.

## Live checks on the PR

Open it with the `website` and `pre-publish-e2e` labels. Record each result in the PR body.
1. Push a docs-only commit while the previous `ci` run is still going. Expect only `decide lanes`,
   `commit messages` and the `* · wait for an older run` jobs to run. `go-build`, `js lint`, `go checks`,
   `js suite`, `js suite (one worker)`, both fuzz jobs and the go suite shards should show as skipped.
2. Push a comment-only JS commit the same way. Expect `js lint` and `go checks` to start at once with
   `go-checks-wait` skipped, while `js-suite-wait`, `js-fuzz-wait` and `go-suite-wait` wait.
3. Push a docs-only commit after the previous run has finished. Every heavy job and every waiter is skipped.
4. Push a comment-only JS commit while the older `js lint` and `go checks` are still running. Expect both older
   jobs to stop within about a minute, green, with a summary naming the newer run and no marker saved. The
   older run's suite jobs keep going, and the newer run's waiters still get their markers.

## Docs

None, because this is contributor CI with no website page. The `SETUP.md` CI lanes sentence ("the new run's
jobs wait for the older run's result") stays true.

## Out of scope

- Merging all waiters of a workflow into one runner.
- Changing `supersede()` keep-or-cancel rules or lane hashing.
- Renaming any heavy job: required check names stay.

## Done when

- Live check 1 shows every heavy job and `go-build` as skipped, with only cheap waiter jobs running.
- Live check 2 shows the raw lanes running without waiting.
- Live check 4 shows the older `js lint` and `go checks` stopping themselves while the older suites keep running.
- `wait-for-older-run` is gone with no trace, and the contract tests pin the waiter shape for every heavy job.
- `pnpm exec vitest run ci-` and `pnpm run lint` are clean.
- The simplify-comments pass ran on every touched source file, committed on its own (`chore(comments):`).
  No website page or example is touched, so there is no simplify-docs commit.
- The spec is moved to `docs/done/` and updated to match what shipped.
