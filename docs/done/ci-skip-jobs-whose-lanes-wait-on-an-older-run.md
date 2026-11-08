---
type: fix
spec: full-plan
status: done
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
- Delete the wait step. The fuzz jobs and the suite halves drop `actions: read`; go-checks and js-static keep it
  for the watcher in E. Save steps keep reading hashes from `needs.lanes`.
- Drop `fetch-depth: 2` in go-checks, js-static and both fuzz jobs: only the re-decide read HEAD^1 there. Keep it
  in js-suite and js-serial, whose `test-pr --base HEAD^1` needs it.
- go-checks: gate "Build the resolver + dists" (`ci.yml:190`) on `fromJSON(env.MION_LANES)['go-tools'].run`.
  Move "Record gofmt and vet as green" to right after `Go vet`.
- js-static: gate its "Build the resolver + dists" step on `fromJSON(env.MION_LANES)['js-static'].run`.
- The `*-green` jobs need no change: they already use `!cancelled()` and accept a skipped job.
- `--pr` / `js-pr` keep working: `lane-wait.yml` passes `--pr`, and `deferredKeys` adds `js-pr` on a PR.

### C. Delete `.github/actions/wait-for-older-run/`

After B nothing uses it. Per the AGENTS.md removal rule, leave no comment, test or doc line naming it, and no test
that it is gone.
Rewrite `ci.yml:222` ("A matrix job cannot wait in a step…") and `.github/actions/ci-lanes/action.yml:31-32`
("or a wait step placed after the checks that read comments").

### D. Other jobs that start a runner for nothing

- `go-build` (`ci.yml:134`): gate it on `(L.run && !L.deferredTo)` for each of its lanes. The heavy jobs then
  accept `contains(fromJSON('["success","skipped"]'), needs.go-build.result)`. On a skipped `go-build` the
  resolver action restores or builds the binaries itself. That is slower only when the older run failed, and
  it saves a runner on every deferred commit.
- drizzle `decide` (`drizzle-e2e.yml:74`): it has no `if:` and does a full-history checkout on every run. It now
  needs `drizzle-wait` and starts on `!cancelled() && needs.lanes.result == 'success'` plus the
  `waiter || gate` verdict's `drizzle.run`, so a lane the older run proves never boots it. `build` already
  requires `decide.outputs.run == 'true'`.
- Beyond these and the two dists builds in B, the sweep found nothing: the pr-heavy jobs already start only
  through their waiters, and every other step runs only in a job whose lane runs.
- Run a final sweep over every job in `ci.yml`, `pr-heavy.yml` and `drizzle-e2e.yml`. Look for a job that
  starts while none of its lanes runs (`run && !deferredTo`), or a step that runs when its lane does not. Fix
  each one you find in this PR.
- Leave `commitlint` alone. Skipping it on label events would make a skipped (green) check hide an earlier
  red one on the same commit.

### E. A kept older run's job stops when a newer run takes over its lane

GitHub can only cancel a whole run, never one job. `supersede()` keeps an older run only when every code lane it
runs is unchanged, so the only lanes a newer run can re-run while the older one still runs them are the raw ones:
`go-static`, `go-tools`, `js-static`. Today the old and new `go checks` and `js lint` then both run to the end.

- The job stops itself. In `go-checks` and `js-static`, every one-line `run:` step is
  `$MION_WATCH <lane> -- <command>`, where `<lane>` is the lane its `if:` gates on. Job env:
  `MION_WATCH: node ${{ github.workspace }}/scripts/ci/supersede.mjs --watch` (absolute, for `working-directory`
  steps) and `GH_TOKEN`. gofmt, the one multi-line script, takes a second and is left out.
- `supersede.mjs --watch` spawns the command in its own process group. Off a pull request it only runs it.
  On a pull request it polls each minute, after the first minute.
- One listing serves both directions. `listRuns()` returns this workflow's runs on this branch and event, from
  this repository, and on a pull request of this PR only. `readDecision()` downloads a run's `lane-decision`
  once into a directory every watched step of the job shares, and reads it back from there.
  - The gate's "Keep or cancel the older runs" step, formerly bash and jq, is now one line:
    `supersede.mjs --plan --older-dir …`. `olderRuns()` keeps the older runs that are still active. A failed
    listing warns and keeps or cancels nothing.
  - `newerDecisions()` keeps the newer runs that were not cancelled, finished ones included: a newer run that
    finished still re-ran the lane. A finished run that never uploaded a decision is given up after one try.
- `takenOver()` is a pure function next to `supersede()`. A newer run takes over lane L when its uploaded
  decision has L live (`liveKeys`) under another hash. That decision is written before `supersede()` runs, so it
  carries no `deferredTo`, but a lane deferred to us always hashes the same.
- Once every lane of the step is taken over, the watcher sends the process group SIGTERM, and SIGKILL once the
  command ends (or after 10 s), so nothing it started that ignores SIGTERM survives. It then exits 0. It writes the lane
  to `MION_TAKEN_OVER` (space separated) in `$GITHUB_ENV`, and a line naming the newer run to the step summary.
  A later watched step of a taken lane exits at once, and the save steps add
  `!contains(env.MION_TAKEN_OVER, '<lane>')`. The job ends green, never red: no waiter sees a failed job.
- `main(args, {gh, env, pollMs})` takes the `gh` call, the env and the poll interval, so tests fake them. Any
  `gh` error or unreadable answer counts as "not taken over", so the job keeps running. Signals sent to the step
  are forwarded to the command, and its exit code is passed through.
- Known gap: a command that fails during the second or two a poll blocks on `gh` can still read as a takeover.
  Node runs the exit handler only after the poll returns, so the poll cannot see the exit. The newer run re-runs
  that lane anyway.
- Fails safe. Suppose an even newer run defers L to this stopped run. Its waiter ends when this run completes,
  re-decides, finds no marker and runs L.
- Polling budget: two jobs, one listing per minute plus one download per newer run. That stays inside the
  GITHUB_TOKEN limit of 1,000 requests per hour, together with the waiters.

## Tests

`packages/devtools/test/ci-supersede.test.ts`:
- `takenOver`:
  - a newer run that runs L under a new hash takes it over;
  - one that runs L under our hash, has it off by label, or never decided does not;
  - only the step's lanes count;
  - each lane names the first newer run that took it.
- The run listing, with a fake `gh` serving runs and decisions:
  - `listRuns` filters on repository and PR, keeps every run off a pull request, and returns null for an
    unreadable listing;
  - `olderRuns` keeps the older active runs, counts an undownloadable or unreadable decision as none, and warns
    with nothing to keep or cancel when the listing fails;
  - `newerDecisions` drops cancelled runs, downloads once across polls, retries a missing decision, and gives up
    on a finished run without one.
- `watchStep` with real `node` children:
  - the exit code passes through;
  - a takeover stops a grandchild that ignores SIGTERM, and the test checks its pid is gone;
  - a partial takeover or a throwing check keeps it running;
  - a command that cannot start reports 127.
- The CLI:
  - `--plan` lists, keeps and cancels through the fake `gh`, and cancels nothing when listing fails;
  - a takeover writes `MION_TAKEN_OVER=<already + lane>` to `$GITHUB_ENV` and the step summary, and exits 0;
  - a lane already taken over skips the command;
  - off a pull request the step runs as is;
  - a SIGTERM sent to the watcher stops the command.

`packages/devtools/test/ci-lane-contracts.test.ts`:
- The waiter table covers all eight ci.yml heavy jobs, with their shared waiters. The per-waiter test pins the
  prefix, `deferredTo`, `needs`, `!cancelled()`, `waiter || gate` and `actions: read`.
- The in-job waiter tests are gone. The "reads from the gate alone" check now excuses only the start conditions
  of `go-build` and `go-checks-wait`.
- The gate's bash-harness tests became one check: the step is a single `supersede.mjs --plan` line, with
  `GH_TOKEN` and no branch name in the script. The listing cases moved to the unit tests above.
- New:
  - `go-checks-wait`'s start rule;
  - `go-build` starts only for `run && !deferredTo`, and its restorers accept a skipped `go-build`;
  - `decide` needs `drizzle-wait` and reads `waiter || gate`;
  - the `go-static` save right after `Go vet`, and the dists build after it gated on `go-tools`;
  - in go-checks and js-static: the watcher env and `actions: read`, every one-line command under
    `$MION_WATCH <its lane> --`, and every save gated on `MION_TAKEN_OVER`.

`packages/devtools/test/ci-skip-defaults-contracts.test.ts`: every heavy job reads `waited(...)`.

`actionlint` accepts the four workflows. `pnpm run check:env` covers the new internal `MION_WATCH` and
`MION_TAKEN_OVER` rows in `scripts/lib/env.mjs`.

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
- The `ci-` tests, `pnpm run lint` and `actionlint` are clean.
- The simplify-comments pass ran on every touched source file, committed on its own (`chore(comments):`).
  No website page or example is touched, so there is no simplify-docs commit.
- The spec is moved to `docs/done/` and updated to match what shipped.
