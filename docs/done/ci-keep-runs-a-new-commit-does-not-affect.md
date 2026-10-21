---
type: chore
spec: full-plan
status: done
created: 2026-10-04
---

# CI keeps the runs a new commit does not affect

Built on `main` after MionKit/mion#452 (the content-only and CSS-only website filter in `lanes.mjs`).

## Problem

Each PR workflow cancels its whole older run as soon as a new commit arrives:

```yaml
# .github/workflows/ci.yml:83 (same in pr-heavy.yml:43 and drizzle-e2e.yml:36)
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

A cancelled job saves no green marker (`.github/actions/save-lane-green`), so the next run starts it again from zero, even when the new commit changed nothing that job reads.

Seen on MionKit/mion#452. A CLAUDE.md-only commit (CLAUDE.md is in `FEEDS_NOTHING`) cancelled:
- run 37206846284 `go tests + fuzz`, 7.5 min in and 30 s from the end;
- run 37206846323 `build the docs site`, about 5 min in.

The new runs started both from scratch. Jobs that had already finished (js tests + lint, container smoke) were skipped correctly, so the content gate works. Only the cancel throws work away. A label event on `ci.yml` (`labeled` / `unlabeled` on any label) cancels and restarts a full run the same way.

Two more gaps:
1. `go tests + fuzz` holds three lanes (`go`, `js-fuzz`, `go-tools`) but saves all three markers at the very end. In the run above, `js-fuzz` passed at 13:53:47 and saved nothing. The `smoke.website` item has the same problem: it saves after the bench steps.
2. GitHub can only cancel a whole run, never one job, and has no "cancel only if relevant" option. No outside tool fills this. skip-duplicate-actions compares the whole commit, so a CLAUDE.md edit counts as new content. Nx, Turborepo and Bazel cache by input like our markers do, but do not stop the cancel.

## Plan

Two parts, one PR. Part 1 is small and saves progress inside a job. Part 2 replaces GitHub's blind cancel with one that looks at content.

### Part 1: save each lane's marker as soon as its own steps pass

- `ci.yml` go-fuzz (about lines 224-241): move `Record the Go suite as green` to right after `Go test suite`. Move `Record the JS fuzz sweep as green` to right after `Time-boxed fuzz lanes`. `go-tools` stays last. Keep each save's `if: success() && <lane>.run`. `success()` covers every earlier step, which is stricter than needed and still correct.
- `ci.yml` smoke (about line 443): move `Record the website smoke as green` to right after `Website serves-a-page smoke`. The bench item and the `smoke` lane marker stay last.
- go-fuzz also saves `go-static` right after the resolver build that follows `Go vet` (the save-order test wants no ungated step after a save), and js-lint saves `js-static` right after `Contract tests`.
- No change needed for the other jobs. website, the bench and drizzle legs and pre-publish-e2e each prove their lane in a single step. js-lint already keeps per-file progress through `Save the passed test list` (`always()`).
- `.github/actions/save-lane-green/action.yml`: change "Call this as the LAST step of a lane's job" to "right after the last step its lane gates". Keep the `if: success()` warning.

### Part 2: cancel only the runs a new commit actually affects

**Rule.** A new run keeps an older active run of the same pull request (or pushed branch) only while every lane that run is really running (it decided to run, and its label gate allows it) has the same hash now, and at least one of our lanes waits on it. Each of our lanes waits on the oldest such run that runs it, so two unchanged runs both stay when each runs something the other does not. Every other older run is cancelled, as before. A waiting job skips what the older run proves and runs the rest.

One exception: a changed lane marked `hash: 'raw'` (`go-tools`, `go-static`, `js-static`) does not cancel. A comment-only commit moves only those hashes, so the older run stays, the code lanes wait on it, and the raw lanes run again here once the waiter re-decides.

**a) Hand cancelling to the gate.** In all three workflows:

```yaml
concurrency:
  group: ci-${{ github.ref }}-${{ github.event.pull_request.head.repo.fork && 'fork' || github.run_id }}
  cancel-in-progress: true
```

A fork's read-only token cannot cancel runs, so GitHub still cancels per ref for forks. The `lanes` gate job gains `actions: write`. If the gate cannot list the older runs, it warns and cancels nothing: that wastes runner minutes but never hides a result.

**b) Label gates in the lane table.** `scripts/ci/lanes.mjs` `LANES` gets a `gate` field, read by `laneLive(name, {labels, baseRef})`, so the gate can tell whether an older run is really running a lane:
- `skip-defaults` (`SKIP_DEFAULTS`) blocks `go`, `js-fuzz`, `go-tools`, `go-static`, `js`, `js-static` and `smoke`;
- `website` requires the `website` label, `bench` requires `bench`, `e2e` requires `pre-publish-e2e`;
- `drizzle` requires `drizzle-e2e`, or a PR into `prod`. This over-approximates `drizzle-e2e.yml`'s `decide` job. The worst case is a wait that ends when the older run ends.

lanes.mjs also exports `flagValues` (supersede.mjs reuses it) and gains `--out <file>`: the verdict goes to the file instead of stdout, and `--github` now only adds the step summary, so `lanes=` is written once, by ci-lanes.

**c) New `scripts/ci/supersede.mjs`.**
- `supersede({ours, older})` is a pure function. `ours` = {lanes, labels, baseRef}. `older` = [{runId, decision | null}]. It returns {keep[], cancel[], reasons{runId: why}, deferred{lane or lane.item: runId}, lanes}. The reasons go to the log and the step summary. Walking the older runs oldest first, a run is cancelled when:
  - its gate has not decided yet (no decision);
  - this commit changes a lane or item it runs live, other than a raw lane;
  - none of its live lanes is still needed here (we do not run it, our labels turn it off, or an older kept run already covers it). This is how `skip-defaults` stops the running `ci` jobs: it turns off every `ci` lane here. A `pr-heavy` run started by the same label event still keeps the older benchmark and e2e work, which the label does not turn off.
  Otherwise it is kept, and each still-needed key gets `deferredTo: <runId>` (on an item lane, on the item, plus a lane-level flag that starts the waiter). A deferred lane keeps `run: true`.
- `deferredKeys(lanes, names, {pr})` builds one group per deferred lane or item: {runId, keys}. Any key proves the group; on a pull request the `js` group also takes `js-pr`, the marker a partial js-lint run saves, or the waiter would outwait js-lint.
- `waitForRun({groups, jobs, gh, sleep, now, deadline})` runs `gh` through a function passed in, so tests fake it. It polls each group until a marker exists (`gh cache list --key`, exact lookup), its run completes, or that run fails a job whose name starts with one of `jobs` (the waiting job's own names). It never cancels: the run may still be proving lanes for other waiters, and a failed `commit messages` job must not end a wait for go-fuzz. A `gh` error is one more poll, and the deadline returns. It polls every minute for ten minutes, then every three, to stay inside the GITHUB_TOKEN budget of 1,000 requests per hour per repo during a long bench wait.
- CLI: `--plan --decision <f> --older <f> --out <f> --github` writes our lanes (with `deferredTo`) to `--out` (required) and `cancel=` to `$GITHUB_OUTPUT`, plus a summary section. `--wait --decision <f> --lanes <…> --jobs '<name>|…' --timeout <min> [--pr]` waits for the deferred groups, or returns at once when nothing is deferred.

**d) `.github/actions/ci-lanes/action.yml`.** One new input, `supersede` (default `true`). The label step runs only with `supersede` on a pull request; both readers fall back to `[]`. Then lanes.mjs decides into a file, and `jq` builds the decision `{lanes, labels, baseRef}` from the verdict, `MION_PR_LABELS` and `GITHUB_BASE_REF`. When `supersede` is true and the PR is not from a fork:
1. Upload the decision as artifact `lane-decision`, retention 1 day.
2. List older active runs through `gh api .../actions/workflows/<file>/runs` with the branch (`GITHUB_HEAD_REF`, else `GITHUB_REF_NAME`, read from the environment, never pasted into the script) and the event, keeping runs with a lower id, from this repository, and on a pull request only the runs of this PR (`pull_requests[].number`). A same-named branch in a fork or another PR is never touched.
3. Download each one's `lane-decision`. A download that fails, or a file that is not a decision, counts as none.
4. Run `supersede.mjs --plan`.
5. `gh run cancel` each id in `cancel`, in its own step; a run that already ended only logs a warning.

A final step writes `lanes=` from the planned file, or from the decision when `supersede` was off.

**e) New reusable workflow `.github/workflows/lane-wait.yml`** (`on: workflow_call`, inputs `lanes`, `jobs`, `decision`, `minutes`; output `lanes`). Its one job has `timeout-minutes: ${{ inputs.minutes }}`, runs `supersede.mjs --wait` with `--timeout` ten minutes shorter so the re-decide still runs, then `./.github/actions/ci-lanes` with `supersede: false`, and outputs the fresh `lanes` JSON.

**f) One waiter job per heavy job, which runs only when something was deferred.** That is 7 waiters: ci `go-fuzz-wait`, `js-lint-wait`, `smoke-wait`; pr-heavy `website-wait`, `bench-wait`, `e2e-wait`; drizzle `drizzle-wait`. Shape:

```yaml
  go-fuzz-wait:
    name: go tests + fuzz · wait for an older run
    needs: lanes
    if: fromJSON(needs.lanes.outputs.lanes).go.deferredTo || fromJSON(needs.lanes.outputs.lanes)['js-fuzz'].deferredTo || fromJSON(needs.lanes.outputs.lanes)['go-tools'].deferredTo || fromJSON(needs.lanes.outputs.lanes)['go-static'].deferredTo
    permissions:
      contents: read
      actions: read
    uses: ./.github/workflows/lane-wait.yml
    with:
      lanes: go js-fuzz go-tools go-static
      jobs: go tests + fuzz
      decision: ${{ needs.lanes.outputs.lanes }}
      minutes: 70
```

`minutes` is 70 for the ci waiters and the website, 130 for bench and drizzle, 160 for the pre-publish e2e. drizzle's `jobs` lists `build + pack` and every dialect, since GitHub names those legs after the dialect alone.

Each heavy job then depends on its waiter and reads the fresh verdict when one exists:

```yaml
  go-fuzz:
    needs: [lanes, go-fuzz-wait]
    if: ${{ !cancelled() && needs.lanes.result == 'success' && (<lane condition on the waiter's verdict, else the gate's>) && <existing label condition> }}
    env:
      MION_LANES: ${{ needs.go-fuzz-wait.outputs.lanes || needs.lanes.outputs.lanes }}
```

- Step `if:` and `with:` change from `fromJSON(needs.lanes.outputs.lanes)` to `fromJSON(env.MION_LANES)` (go-fuzz, js-lint, smoke, pre-publish-e2e). js-lint-wait holds `js` and `js-static`.
- A matrix cannot read `env`, so its matrix line spells out the `||` expression: bench `competitor` and drizzle `dialect`.
- `!cancelled()` is needed because a skipped waiter (the normal case) would otherwise skip the heavy job too. A waiter that failed leaves its output empty, so the job falls back to the gate's verdict and runs (fails safe).
- `bench-green` and `record-green` read only `.hash`, which waiting never changes, so they do not need the waiter.
- GitHub skips a job when any job up its `needs` chain was skipped. A skipped waiter would therefore skip the jobs below the heavy jobs, so `bench-green`, `pre-publish-e2e`, the drizzle legs and `record-green` check their direct need instead: `if: ${{ !cancelled() && needs.<direct>.result == 'success' }}`.
- Add `MION_LANES`, `MION_PR_LABELS` and `MION_LANE_DECISION` to `REGISTRY` in `scripts/lib/env.mjs` as `internal`, like `MION_PR_NUMBER`.

**g) Comments.** Rewrite the concurrency and `skip-defaults` notes in the `ci.yml` header, and the concurrency notes in the `pr-heavy.yml` and `drizzle-e2e.yml` headers, to describe the gate-owned cancel.

### Two GitHub behaviours this relies on

Both fail safe, so they are checked by the live checks on the PR rather than on a scratch branch first; the results go in the PR body. `actionlint` accepts the four workflows.
1. `gh run download <id> -n lane-decision` works while the uploading run is still in progress. If it did not, every older run would count as undecided and be cancelled, which is the old behaviour.
2. Job-level `env` built from `needs` can be read in step `if:` and `with:`, and `!cancelled()` runs a job whose waiter need was skipped.

## Tests

All under `packages/devtools/test/`. They import scripts that use `node:child_process` and `node:fs`, so `test-skip` always runs them.

`ci-supersede.test.ts`:
- `supersede`: all hashes equal → keep and defer every live lane. One changed hash → cancel. `skip-defaults` on our side → cancel the older `ci` run, but keep an older run of lanes the label does not turn off. A missing decision → cancel. A run running nothing → cancel. A lane whose label is off in the older run → not deferred and does not block the keep. Item lanes defer per item. A newer unchanged run whose lanes all wait on an older one → cancel. Two unchanged runs that each run something the other does not → both kept, each lane deferred to its own. A PR into prod counts drizzle as live. Only a raw lane changed → keep, defer the code lanes, rerun the raw one; a raw lane plus a code lane changed → cancel; an older run of only a changed raw lane → cancel.
- Property check (random decisions, a fixed seed): a deferred lane always has an equal hash, was live in a kept run, and is live here; every kept run has a lane waiting on it; a cancelled run always has a changed live code hash, no decision, or nothing still needed.
- `deferredKeys`: a plain lane waits for its lane marker and an item lane for its item markers, each on its own run; `js` takes `js-pr` on a pull request only.
- `waitForRun` with a fake `gh` and a fake clock: markers appear (any key of a group) → returns and cancels nothing. The older run completes → returns. The older run fails one of this job's jobs → returns, never cancels. A failed job of another lane (`commit messages`) → keeps waiting. `gh` keeps erroring → returns at the deadline, polling every three minutes after ten.
- The CLI: `--plan` writes the deferred lanes to `--out` and `cancel=` with the right ids, plus the summary; `--wait` with nothing deferred returns without calling `gh`.

`ci-lane-contracts.test.ts`:
- Rewrite `puts every save after the last step that does work`: a run step after a save for lane L must carry an `if:` naming a different lane. The count of 9 jobs stays. A second test pins that the `go`, `js-fuzz` and `smoke.website` saves come straight after their lane's last step.
- `lanes --out`: the verdict goes to the file, not stdout; with `--github` only the summary is added, never `lanes=`.
- Every gate workflow's concurrency group carries `github.run_id`, apart from forks. The gate job has `actions: write`. The gate never passes `supersede: false`, and lane-wait.yml passes `supersede: false` and the `--wait` line with `--pr` on a pull request.
- Every job that reads a lane verdict reads `env.MION_LANES` or the `waiter || gate` expression; only `.hash` reads the gate alone. Every job reading `env.MION_LANES` sets it from its waiter and needs it.
- Each waiter's `lanes:` equals the lanes its heavy job reads, its `jobs:` names the heavy job (and every drizzle dialect), and each heavy job `if:` has `!cancelled()` and `needs.lanes.result == 'success'`.
- Each lane's `gate` matches the label conditions in its own job's `if:`, exactly (drizzle through its `decide` job and the prod base).
- The jobs below a guarded job check their direct need, not `success()`.
- The keep-or-cancel script, run with a fake `gh`: an unchanged run is kept and an undownloadable one cancelled; an unreadable decision counts as none instead of failing the gate; a failed listing warns and cancels nothing; the listing filters on this PR and this repository and never pastes the branch name into the script; a failed cancel only warns; the decision records the live labels `skip-defaults` relies on.

Run `pnpm exec vitest run ci-` and `pnpm run lint`. Run `pnpm run check:env` for the new registry rows.

## Live check on the PR itself

Open the PR with `website`, `bench`, `pre-publish-e2e` and `drizzle-e2e`, so every rewritten heavy job runs at least once (never `skip-defaults`: the default jobs changed too).
1. While `go tests + fuzz` and `build the docs site` run, push a CLAUDE.md-only commit. Expect: the older runs are NOT cancelled, the waiters wait, then both heavy jobs skip once the older runs save their markers. The gate summary names the kept run.
2. Push a commit that changes `scripts/` while a run is going. Expect the older run to be cancelled, as before.
3. Add and remove an unrelated label while `ci` runs. Expect the run to be kept and nothing to run twice.
4. Add `skip-defaults` mid-run. Expect the older run to be cancelled.

Note the result of each check in the PR body, MionKit/mion#454.

## Docs

The website: none, because this is contributor CI that no consumer uses. `SETUP.md` (lines 98-105, the CI lanes paragraph) gets two sentences: a new commit keeps an older run when nothing it tests changed, and its jobs wait for that run's result instead of starting over. Each lane saves its marker as soon as its own steps pass. No website page or example is touched, so no simplify-docs pass is needed.

## Out of scope

- Keeping an older run when only SOME of its lanes still match. Today's rule cancels it. Rework this only if mixed commits turn out to be common.
- Re-checking markers between steps inside a job that did not wait.
- GitHub's native job-level `concurrency` for waiting. It cannot wait on several matrix legs at once and needs an early-exit `if:` on every step.
- `release-gate.yml`, `website-deploy.yml`, `post-publish.yml`, `publish.yml` (no lanes, or cancel already off).
- Renaming any job. Required check names stay as they are.

## Done when

- A commit that changes nothing a running lane reads no longer cancels that lane's job. The new run waits and then skips it, as shown by live check 1 (recorded in the PR body before merge).
- A commit that changes a running lane's inputs still cancels the older run, and `skip-defaults` still stops running jobs.
- `go tests + fuzz` saves each lane's marker when that lane's steps pass, and smoke saves `smoke.website` before the bench steps.
- New and updated tests pass. `pnpm run lint` and `pnpm run check:env` are clean.
- The simplify-comments pass ran on every touched source file and was committed on its own (`chore(comments):`). No website page or example was touched, so there is no simplify-docs commit.
- The spec is moved to `docs/done/` and updated to match what shipped.
