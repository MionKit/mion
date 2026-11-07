---
type: chore
spec: full-plan
status: done
created: 2026-11-06
---

# Faster PR CI: run the heavy work in parallel

## Problem

A PR waits a median 16.7 min for `ci.yml` (max 33.9, 30 runs); a push to main 10.8 min. One job does six things
in a row while the other finishes early and idles.

Run 42145193727 (18.8 min, every lane ran):

| Job | Steps, in order | Time |
|---|---|---|
| `go-fuzz` ("go tests + fuzz") | setup 1.1, go-tools 2.6 (codegen 49 s, build-gate 96 s), Go suite 7.1, JS fuzz sweep 2.0, race 0.7, time-boxed fuzz 4.6 | 18.3 min |
| `js-lint` ("js tests + lint") | setup 0.7, lint + typecheck 3.6, contracts 0.9, JS suite 8.1 | 13.7 min |
| `smoke` | free disk, image pull, website check 3.75 | 6.6 min |

Replaying the last 30 merged PRs (#544 to #573) through `lanes.mjs`: 23 ran every lane, 4 changed only website
pages (one also a Go comment) yet ran the JS suite, JS fuzz and Go-backed checks, 3 docs-only ran nothing.
The full run IS the normal PR: make it shorter, and stop running it for page edits.

1. **Serial jobs.** Go suite, JS fuzz and go-tools share one runner (ci.yml:130-276); lint and the JS suite
   another (ci.yml:280-441). The repo is public: `ubuntu-latest` = 4 cores, free minutes.
2. **A one-file-at-a-time tail in the JS suite.** Vitest 4.1.8 runs every file of a project with
   `isolate`, `sequence.groupOrder` 0 and `maxWorkers: 1` in one sequential group AFTER all other files
   (`node_modules/vitest/dist/chunks/cli-api.BfdDOPPI.js:3801`). `client`
   (packages/rpc-client/vitest.config.ts:34), `client-bundled` (vitest.bundled.config.ts:25) and
   `drizzle-example-app` (packages/private-drizzle-example-app/vitest.config.ts:24) set it.
   Tail: 159 s of the suite's 369 s in run A, 110 s in #573 (run 42290518621).
3. **Two Go packages run their tests one at a time.** `internal/compiler/resolver`: 1,017 tests, one
   `t.Parallel()`, 261 s. `internal/convert`: 160 tests, none parallel, 250 s. `internal/compiler/apitypes`:
   133 s. The suite (47 packages, 833 s summed) never beats its slowest package.
4. **Website pages feed lanes that never read them.** `JS` (scripts/ci/lanes.mjs:67) holds all of `container/`,
   so a page edit re-runs `js`, `js-fuzz` and `go-tools`. The only non-contract test reading pages is
   `packages/devtools/test/website-links.test.ts` (CONTENT_DIR, line 12); contracts already run in `js-static`.
   #573 (one page + one Go comment) took 12.6 min.
5. **Contract tests run twice.** The `Contract tests` step (ci.yml:363-365, `pnpm test contracts`) runs the 12
   `packages/devtools/test/*contracts*.test.ts`, then the JS suite (ci.yml:394-404) runs them again: 42 s of test
   time in run A.
6. **Go's test cache ignores the repo files the Go tests read outside `ts-go-runtypes/`.** `go test` re-checks
   only files under the module root (Go 1.26 `cmd/go/internal/test/test.go:2050-2052`). Reproduced:

   ```
   $ go test ./internal/compiler/apimeta/          -> ok (cached)
   $ : > packages/run-types/dist/markers.d.ts
   $ go test ./internal/compiler/apimeta/          -> ok (cached)
   $ go test -count=1 ./internal/compiler/apimeta/ -> FAIL
   ```

   CI never saves Go test results, so CI is safe; a local `go test ./internal/...` is not. Readers outside the
   module: internal/testfixtures/realmarker.go (~48-56, ~142), realdrizzle.go, fuzzseed.go:43 (`version.json`),
   apitypes real_router_test.go:15-25 and drizzle_test.go:150-151 (symlink a `t.TempDir()` into
   `packages/.../node_modules`), regexsafety/shipped_patterns_test.go:14, resolver/marker_artifact_test.go:21,
   purefnindex_test.go:721,738, convert/drizzlemodnames_test.go:34, cmd/gen-drizzle-manifest/gen_test.go:152.
   Same root cause, also in CI: the `go` lane (lanes.mjs:93) misses `version.json`, which fuzzseed.go reads.

## What shipped

All six items. Measured on this PR's own run 42320635559, every lane running: **8.0 min** from start to the last job
(before: median 16.7 min). The longest job is now the unchanged container smoke (7.5 min), then the time-boxed fuzz
lanes (6.8 min) and js lint (5.5 min); the three Go shards took 3.2, 4.3 and 4.6 min.

Where the build left the plan below:

- **Item 2: no project went parallel.** Forced to 4 workers, `client` failed 1 of 5 runs and again on one core (7
  files: `Cannot find module '../.mion/types/…'`, its gen dir raced) and `drizzle-example-app` its first run.
  `client-bundled` failed every run, but not from parallelism: its lane server (a forked second process writing
  the same genDir) rooted its vite server at the cwd, the repo root, while vitest roots the project at
  `packages/rpc-client`. The two named the generated modules apart and each generate pruned the other's, so
  `routeDrift.spec.ts` failed whenever it ran first (alone, after a failure reordered the files, or with its
  siblings proven by the passed list). Fixed in the same PR: the child takes vitest's project root, and
  `test/lib/laneServer.ts` refuses to start when the child reports any other. All three keep `maxWorkers: 1` and run in `js-serial`; no
  `ONE_WORKER_PROJECTS` constant: the contract derives the set from the configs that set `maxWorkers: 1` and checks
  both suite jobs' `--project` / `--skip-project` lists against it.
- **test-skip `--skip-project`** checks names against the root config's project list, not vitest's own (a
  `--project` filter narrows that one).
- **`js-fuzz-green`** saves the lane once each fuzz job passed or was skipped because its item was proven;
  `go-green` and `js-green` need plain success.
- **`go-suite`** sets no `MION_LANES`: no step of it reads the env, its wait is the `go-suite-wait` job.
- **Item 3: no `go-shard --check`.** It rebuilt the shards with the same planner it checked, so only a stale `HEAVY`
  entry could fail it. `go-shard` dies on that itself, lists the three heavy packages in one parallel
  `go test -list` call, and its unit tests prove the planner runs every package and test exactly once.
- **Item 6:** `testfixtures.RepoRoot()` joins `Repo` and `DeclareInputs` (a test handing repo paths to the compiler
  takes the real root, and must declare what the compiler reads); `DeclareInputs` also takes an absolute path under
  the repo. Links: `pnpm-lock.yaml` (the apitypes temp projects link `node_modules`), `packages/platform-node` (the
  drizzle example app's server imports it), and only `packages/devtools/src/core/go-generated` of devtools (the
  `cmd/gen-*` tests compare the committed generated files there and in run-types and core, and declare them; the
  generators keep their own repo paths for `go run`). `private-test-server` has none (nothing reads it through
  `Repo`). The source scan works per package: a test file never climbs out by hand, and a package whose code reaches
  the repo (by climbing, `…Root(), "packages"` or `RepoRoot()`) declares it in its tests. A bare `"packages/…"`
  literal is no signal: temp-dir fixtures use the same names.
  Repros, each answering `(cached)` before: `apimeta` after emptying `markers.d.ts` (FAIL), the apitypes router test
  after appending a line to `packages/rpc-router/src/router.ts` (re-ran), `gen-plugin-keys` after appending a line
  to its committed generated file (FAIL, drift).

## Plan

One PR, one commit per item, each with its contract-test updates. Line numbers below are from main at
7f90098; re-find them before editing.

### Shared mechanism: lane items + a record job (no new caching code)

- A shard is a lane item with `paths: []`: `itemFeeds` (lanes.mjs:235-239) then feeds it every lane input, so
  each item hash = the lane's inputs. `decide` runs only unproven items (lanes.mjs:292-293), `candidateKeys` adds
  item keys (264), and supersede already waits on and keeps item markers (supersede.mjs:13-14, 68-69).
- Every ci.yml lane must still save a LANE marker (ci-lane-contracts.test.ts:466-477). A sharded lane gets a
  small record job that saves it once all shards pass: precedent `bench-green` (pr-heavy.yml:188-197), and smoke
  at ci.yml:552-556.
- A matrix over `runItems` gets its own `<job>-wait` job (`lane-wait.yml`) and reads
  `needs.<job>-wait.outputs.lanes || needs.lanes.outputs.lanes`, as drizzle does (drizzle-e2e.yml:164-172):
  ci-lane-contracts.test.ts:456-462 forbids reading `needs.lanes.outputs.lanes…runItems` anywhere else.
  `strategy.fail-fast: false` (drizzle-e2e.yml:169), so one red shard never cancels the others.

### Item 1: split the two heavy jobs

Lane names do not change: no marker is orphaned and the `lanes:` list (ci.yml:118) stays.

| Job id | Display name | Proves | Steps (moved verbatim) |
|---|---|---|---|
| `go-checks` | `go checks` | `go-static`, `go-tools` | gofmt, vet, build, codegen drift, drizzle-manifest drift, build-gate tests, refusal count, `go-shard --check` (item 3) |
| `go-suite-wait` | `go suite · wait for an older run` | | lane-wait.yml, lanes `go` |
| `go-suite` | `go suite (${{ matrix.shard }})` | `go.<shard>` | build, one Go shard (item 3) |
| `go-green` | `record the go suite as green` | `go` | save once every shard succeeded |
| `js-fuzz-sweep` | `js fuzz sweep` | `js-fuzz.sweep` | build, JS fuzz sweep, race fuzz |
| `js-fuzz-timeboxed` | `js fuzz time-boxed` | `js-fuzz.timeboxed` | build, time-boxed lanes |
| `js-fuzz-green` | `record the js fuzz as green` | `js-fuzz` | save once both fuzz jobs succeeded |
| `js-static` | `js lint` | `js-static` | format, build, drizzle versions, env, test-batch, typecheck coverage, lint + typecheck, code-import, examples typecheck, contracts |
| `js-suite` | `js suite` | `js` / `js-pr` if no project stays one-worker | build, restore list, JS suite (minus projects that stay one-worker), save list, bun |
| `js-serial` | `js suite (one worker)` | | only if item 2 step 1 leaves a one-worker project |
| `js-green` | `record the js suite as green` | `js` or `js-pr` | only with `js-serial`: save once both suite jobs succeeded with the same scope |

- lanes.mjs: `js-fuzz` gets `items: {sweep: {paths: []}, timeboxed: {paths: []}}`; the js == js-fuzz hash
  contract (ci-lane-contracts.test.ts:140-151) still holds, items do not change a lane hash.
- Every work job keeps today's guards: `needs: lanes` (or its wait job), the
  `${{ !cancelled() && needs.lanes.result == 'success' && (…) && !contains(…labels…, 'skip-defaults') }}` shape
  (a one-lane job still writes the parentheses), `actions: read`, `MION_LANES`, checkout `fetch-depth: 2`.
- In-job wait steps (non-matrix jobs): `lanes:` lists EVERY lane the job's later steps read (wait-for-older-run
  rewrites `MION_LANES` to only those). `jobs:` is a prefix shared by sibling jobs: `go checks`, `js fuzz`,
  `js lint`, `js suite` (matches `js suite (one worker)` too); a sibling's failure then ends the wait at once.
- Only `go-checks` and `go-suite` pass `toolchain: 'true'` to the resolver action. A cache miss builds the
  binary in every job at once (64 to 80 s each): same wait as one build job, so none is added.
- `js-green` (only with `js-serial`): `needs: [lanes, js-suite, js-serial]`; each suite job outputs its `scope` (today's logic,
  ci.yml:398-404); save `js` on full, `js-pr` on partial (today at ci.yml:430-441). No contract needs the save in
  the suite's own job, and the wait checks only that the key exists (supersede.mjs:83-86, 108).
- Rewrite the ci.yml header comment (lines 6-76: "TWO balanced jobs", the disjoint vitest slices, "FOURTH" /
  "FIFTH" job, "the three heavy jobs"). The partition stays complete and disjoint: fuzz sweep + time-boxed +
  JS suite (+ `js-serial` if it exists) + build-gate.

Everything that pins the old layout (full sweep; no GitHub ruleset requires a ci.yml check):

- `ci-lane-contracts.test.ts`:
  - `IN_JOB_WAITERS` 604-607 and `WAITS_IN` 671-686: new ids, names, prefixes; jobs with no comment-reading
    first step (fuzz jobs) need the `first` check (698-703, 710-715) made optional.
  - `jobOf(ci,'js-lint')` 345-382 and 1023-1028 → `js-suite` (and `js-serial`); save scope pins stay in `js-suite`, or move to `js-green` if it exists.
  - go-tools step pins 1017-1038 → `go-checks`; step-follows pins 802-808 (the shard and time-boxed steps now
    save item markers).
  - 497-502: the `.go.run` / `['js-fuzz'].run` save conditions move to the record jobs.
  - 518-534 in-job item saves and 536-542 `runItems` reads: add `go` and `js-fuzz`, accept the bracket form
    `['js-fuzz'].runItems`.
  - Hard counts: `toBe(9)` 546-578, `toBe(4)` 737-761, `toBe(7)` 1079-1092: recount on the new file.
- `ci-skip-defaults-contracts.test.ts:37-61`: heavy job list → new work-job ids, one expected condition each;
  header comments 3-8, 47.
- `fuzz-lane-contracts.test.ts:177-186`: the time-boxed step sits in `js-fuzz-timeboxed`, not between
  `\n  go-fuzz:\n` and `\n  js-lint:\n`.
- `ci-token-hash-contracts.test.ts:137-162`: step `if:` text unchanged; confirm it still matches.
- `ci-supersede.test.ts`: fixtures 17-24/39 and 215-226 use `go` / `js-fuzz` as item-less lanes; move them to
  `go-static` / `js-static`. Job-name strings 229, 264, 283 → current names.
- Old names elsewhere: lanes.mjs `job:` labels (90, 95, 98, 100, 101, 103) and comments 65, 78-83, 96;
  scripts/README.md:84; scripts/miondevx.mjs 68, 76, 90, 225; scripts/ci/supersede.mjs:62;
  docs/FUZZING.md:244; packages/run-types/test/fuzz/README.md:589; build-gate.test.ts:3, 74.
  `docs/done/` stays as is.

### Item 2: end the one-file-at-a-time tail

Correctness must never depend on the core count: a runner, a fork's runner or a laptop can have one core, and
vitest then runs one file at a time anyway. So first prove which projects are safe in parallel, then split
the rest by project name.

**Step 1, premise check (before any CI change).** For each of `client`, `client-bundled`,
`drizzle-example-app`:

- Find why it is one-worker. `client`'s comment says "avoid conflicts with shared server"
  (packages/rpc-client/vitest.config.ts:33): the in-process API from `globalSetup.ts`. Look for shared mutable
  server state, fixed ports, shared gen dirs or files the tests write. `drizzle-example-app` says "heavy: the
  cost test compiles whole programs" (memory, not correctness).
- Drop `maxWorkers: 1` locally and FORCE parallel files: `pnpm exec vitest run --project <name> --maxWorkers 4`,
  5 runs in a row, then the same under `taskset -c 0` (one core, still 4 workers) to shake out ordering and
  timing assumptions. Also watch peak memory for `drizzle-example-app` against the runner's 16 GB.
- Passes every run → the project drops `maxWorkers: 1` (in its own commit, with what was checked) and simply
  joins the parallel pool: no new job. Any failure or memory risk → it stays one-worker and goes to step 2.
- Record the results (runs, pass/fail, peak memory) in the PR body.

**Step 2, only for projects that stay one-worker: their own job, split by project name.**

- `scripts/core/test-batches.mjs`: `ONE_WORKER_PROJECTS = [...]` beside `BATCHES` (the module that already
  groups project names). A contract test pins it to exactly the projects whose config sets `maxWorkers: 1`,
  so adding or dropping that setting without updating the list fails.
- `scripts/core/test-skip.mjs`: `--skip-project <name>` (repeatable), filtering specs by `spec.project.name`
  after `globTestSpecifications` (`openVitest`, ~240). `--project` already exists.
- `scripts/core/test-pr.mjs`: forwards both under `--skip-passed` (passthrough, 59-68). When its plan is
  partial, a passed `--project` INTERSECTS the plan's projects (never adds to them) and `--skip-project`
  removes from them; an empty result means nothing to run. Refuse both without `--skip-passed` (61 hands
  plain vitest the flags).
- `js-suite` passes `--skip-project <each>`; `js-serial` passes `--project <each>`,
  `--store node_modules/.cache/mion/vitest-serial-passed.json` and cache key prefix
  `mion-vitest-serial-passed-` (not under `mion-vitest-passed-`: `scripts/ci/cache-cleanup.mjs:10` trims that
  family), with its own `KEEP_ON_MAIN` entry there.
- main keeps `test-skip --audit` in both jobs: together they run every file.
- If step 1 frees all three projects, skip step 2 entirely: no `js-serial`, no `js-green`, and `js-suite`
  saves `js` / `js-pr` itself as today.

### Item 3: shard the Go suite

- New `scripts/ci/go-shard.mjs`, registered as `pnpm miondevx core go-shard <i>/<n> [--check]` (row in
  `scripts/lib/devx-registry.mjs`, per scripts/AGENTS.md):
  - Lists packages (`go list ./internal/... ./cmd/...`) and the top-level tests of the heavy ones (resolver,
    convert, apitypes: `go test -list . <pkg>`).
  - Shard i of n: every n-th test of each heavy package by sorted name (one `go test <pkg> -run '^(A|B|…)$'`
    each) + every n-th light package by sorted path (one `go test <pkgs…>`), run concurrently; fails if any
    fails. Same env as today: `MION_FUZZ_ITER: '30'`, `MION_DIAG_GRID_FULL` on push (ci.yml:231-234).
  - `--check`: the shards cover every package and every listed test exactly once. Runs in `go-checks`.
- lanes.mjs: `go` gets `items: {'1': {paths: []}, '2': {paths: []}, '3': {paths: []}}` and
  `'scripts/ci/go-shard.mjs'` in its paths (a shard-script edit must re-run the suite).
- Expected: about 215 s of single-threaded heavy work per shard, spread over 3+ concurrent processes on 4 cores,
  plus light packages and compile: about 4.5 min per job, against 8.3. Re-tune n only if a shard stays above 5 min.

### Item 4: website pages leave the js, js-fuzz and go-tools lanes

- lanes.mjs: a constant beside `WEBSITE_CODE` (53), `{prefix: 'container/', keep: (path) =>
  !path.startsWith('container/website/content/')}`, replaces `'container/'` in `JS` (67). `go-tools` spreads
  `JS`, so it loses pages too, as intended: no go-tools step reads them. `js-static` gets its own list with the
  full `container/` (check-code-imports, contracts and the link test read pages raw).
- `Contract tests` step (363-365) becomes `pnpm test contracts website-links`; the step name stays (pinned).
- ci-lane-contracts: 203-222 asserts at :221 that page paths feed `LANES.js.paths`: switch it to `js-static`.
  New test: a page path feeds `js-static` only among ci.yml lanes; website code still feeds `js`, `js-fuzz`,
  `go-tools` and `js-static`.
- On the 30 replayed PRs: #558, #562, #563, #573 run only `js-static` (+ `go-static` for #573): ~12.6 → ~5 min.

### Item 5: contracts run once

- Both suite command lines (ci.yml:400 and 403), and `js-serial` if it exists: add `--exclude '**/*contracts*.test.ts'` and
  `--exclude '**/website-links.test.ts'` beside the build-gate exclude (globs match per project root, comment at
  ci.yml:393).
- ci-lane-contracts 1023-1028: every suite line carries all three excludes.

### Item 6: Go tests see their repo inputs

- `internal/testfixtures/testdata/repo/`: one tracked symlink per outside root a Go test reads
  (`packages/run-types`, `packages/core`, `packages/rpc-router`, `packages/drizzle-orm*`,
  `packages/private-drizzle-example-app`, `version.json`, plus whatever the grep finds), each pointing at its
  real path. Under `testdata/`: `./...` patterns skip it (no "ignoring symlink" warning in vet / test), and
  `isGoInput` (scripts/lib/go-inputs.mjs:24-25) keeps it out of the binary digest. Go's test cache checks the
  lexical path first, then stats through the link, so reads via these paths count.
- `testfixtures.Repo(rel string) string` returns the in-module path; every reader above switches to it.
- Readers whose bytes arrive through a path outside the module anyway (apitypes symlinks a `t.TempDir()`
  into `packages/.../node_modules`): `testfixtures.DeclareInputs(rel ...string)` walks each root through the
  link and `os.Stat`s every file, so Go records them all.
- Premise check FIRST, before converting callers: with one link + one `DeclareInputs`, the `apimeta` repro
  above and an `apitypes` repro (empty a file in `packages/core/src`) must both stop answering `(cached)`.
  If either still caches, stop and redesign (do not ship a `-count=1` workaround: plain `go test` must be right).
- Go test in `internal/testfixtures`: no `_test.go` or fixture builds a path from `"..", "..", ".."` or names
  `packages/` outside `Repo` (source scan), so a new outside read cannot bypass it.
- ci-lane-contracts 125-138 parses `filepath.Join(repoRoot, "packages", "<pkg>")` from realmarker.go /
  realdrizzle.go: re-point it at the link list, keeping the "every mounted package feeds the go lane" check.
- lanes.mjs: add `version.json` to the `go` lane paths (fuzzseed.go reads it; the lane misses it today).
- The links live under `ts-go-runtypes/`, so they already feed the go lanes; nothing else globs into
  `testdata/` (Node's `globSync` does not follow directory links).

## Tests

- Contract tests listed under each item, changed in the same commit as the workflow change.
- Item 2 step 1: the forced-parallel runs (4 workers, 5 runs, and under `taskset -c 0`) per project, in the PR body.
- Item 2 step 2, if needed: test-skip unit test (`packages/devtools/test/test-skip.test.ts` or beside it):
  `--project` + `--skip-project` split a fixture project set into disjoint, complete halves. test-pr:
  `--project` intersects a partial plan, `--skip-project` removes, both refused without `--skip-passed`.
  Contract: `ONE_WORKER_PROJECTS` equals the projects whose config sets `maxWorkers: 1`.
- go-shard: unit test over a fake package/test list: disjoint and complete for n = 1, 2, 3; `--check` fails when
  a test or package is missing.
- lanes: `go` and `js-fuzz` shard items (item hash = lane inputs; one unproven shard runs alone), page-path
  feeds (item 4), `version.json` and `go-shard.mjs` feed `go`.
- Item 6: the testfixtures source-scan test, plus both repros recorded in the PR body.
- Before the PR: `pnpm run lint`, `pnpm run format`, `pnpm test`, `go -C ts-go-runtypes test ./internal/... ./cmd/...`.
- Once CI is green, compare the PR's wall clock with the table above and put both in the PR body.

## Docs

- `.agents/docs/pr-ready.md`: lanes section (items now also shard ci.yml lanes, line ~52 says container-only).
- `.agents/docs/testing.md` "Run less": `--skip-project` (if added), the Go shards, `testfixtures.Repo` for Go tests reading
  outside the module.
- No website page: repo CI, nothing user-facing.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Out of scope

- Picking tests by dependency tracking or by AI.
- Making never-cached test files skippable (test-skip `DECLARED`), keying speed, fuzz-lane scoping.
- Smoke: after this PR it is the longest job (about 7 min from the run's start); split its website and bench
  halves only if it then sets the wall clock.
- Running lint pieces in parallel: `js lint` is about 6 min, under the suite.
- More runners per run (about 14 jobs) could queue when several PRs run at once on the org's concurrency
  limit; watch it, do not pre-solve it.

## Done when

- A PR that runs every lane finishes in about 8 min or less (today: median 16.7), measured on this PR's own CI.
- A page-only PR runs only `js-static`.
- No JS file waits in a one-file-at-a-time tail behind the rest of the suite. Each former one-worker project
  is either proven parallel-safe (forced runs, one core included) or runs in `js-serial` beside the suite.
- main still runs every test: `test-skip --audit` in both suite jobs, every Go shard, both fuzz jobs.
- `go-shard --check` passes in CI; the contract tests pin the new layout.
- Both item 6 repros stop answering `(cached)` after the file edit, with plain `go test`.
- `pnpm run lint`, `pnpm run format`, the JS suite and the Go suite pass.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.
