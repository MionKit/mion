---
type: chore
spec: full-plan
status: ready
created: 2026-09-29
---

# Faster CI: cache the compiler, and skip work that already passed

## Problem

Every heavy CI job pays the same setup before its first test, measured on the 2026-09-29 runs:

| Step | Time per job |
|---|---|
| Checkout with `submodules: recursive` | ~30s (3s without submodules) |
| Bootstrap (Go, pnpm, 2 GB Go build cache restore, install) | ~30s |
| `check:builds` (resolver + marker and devtools dists) | 50 to 70s |

It repeats in go-fuzz, js-lint and smoke (`ci.yml`), website, bench and pre-publish-build (`pr-heavy.yml`), build (`drizzle-e2e.yml`) and most of `release-gate.yml`.

Four more costs:

- **A Go change reruns the whole JS suite.** Every lane hashes all of `ts-go-runtypes/` (`WORKSPACE`, `scripts/ci/lanes.mjs:50`), including `_test.go`, `testdata/` and the `gen-*` tools that never enter the binary.
- **A JS change reruns whole projects.** `core test-pr` selects by package. The JS suite is 483 files: `Duration 239.85s (transform 47.90s, import 106.06s, tests 343.03s)`. Most of that is spent re-running files whose code did not change.
- **Container lanes are all or nothing.** One drizzle marker covers five databases. One bench marker covers five competitors, and four of them never load mion code.
- **Five nearby bugs turned up during the investigation.** They are in scope (see Plan, the step that owns each).

The fix is one idea applied at three sizes: a result depends only on its inputs, so hash the inputs, and skip the work when that hash already passed. It already works per lane (`scripts/ci/lanes.mjs`, `.github/actions/{ci-lanes,save-lane-green}`). This todo extends it to the compiler binary, to items inside a lane, and to single test files.

## Plan

Six steps, each its own PR, in this order. Steps 1 to 3 are safe wins. Step 5 starts with a trial.

### Step 1: cheaper setup, and cache-key fixes

1. **Stop fetching the TypeScript test corpus.**
   - `submodules: recursive` pulls `typescript-go/_submodules/TypeScript` (~620 MB), which no build uses.
   - Replace `submodules: recursive` on every checkout with one submodule step that inits only `ts-go-runtypes/third_party/tsgolint` and its `typescript-go`, at `--depth 1`. It lives in `.github/actions/bootstrap/action.yml` for now and moves into the resolver action in step 2.
   - Reuse the logic in `scripts/setup-claude-web.sh:329-335`, which already skips the corpus.
   - Update any contract test that pins `submodules: recursive` (`packages/devtools/test/repo-contracts.test.ts` and the `*-lane-contracts` tests).
2. **Add `runner.arch` to the Go build cache key** (`bootstrap/action.yml:40-48`). `website-deploy.yml:58` runs on linux-arm64 and currently shares `Linux-gocache-…` with x64.
3. **Add the tsgolint commit to the playground wasm cache.** It links typescript-go, but `WASM_INPUTS` (`scripts/website/playground-wasm-inputs.mjs:18`) and the key (`.github/actions/cache-playground-wasm/action.yml:18`) both leave it out, so a tsgolint bump serves a stale wasm.
4. **Pin Go exactly.** Add a `toolchain go1.26.N` line to `ts-go-runtypes/go.mod`, or a `.go-version` file. Point setup-go at it with `go-version-file`. Step 2 needs a Go version that can be read without installing Go.

### Step 2: cache the compiled resolver

**Key.** Add `resolverKey()` to `scripts/core/build.mjs`, computed with git and node only (no Go, no submodule checkout). It hashes:
- the `RESOLVER_INPUTS` content, filtered by `isGoInput` (`scripts/lib/go-inputs.mjs`). Hash git object ids the way `laneHashes` does (`scripts/ci/lanes.mjs:103`);
- the tsgolint gitlink, from `git rev-parse HEAD:ts-go-runtypes/third_party/tsgolint`. It pins typescript-go and the patch set too;
- the pinned Go version from step 1;
- the ldflags inputs: root `package.json` version, and the tsgolint sha at a FIXED length (today `--short` depends on how many objects the repo holds);
- OS and arch.

**Trust a restored binary without Go.** Today `checkGo` dies without Go (`build.mjs:143`), and the digest calls `go version` (`:135`), both before the stamp is read. Change it so that:
- a binary whose stamp equals the git-only key is trusted with no Go on PATH;
- with Go present, it warns when the local `go version` differs from the pin;
- an explicit `miondevx core build` still does the full build-id compare.

**Fix `submoduleInitialised()`** (`scripts/lib/tsgolint.mjs:42`). On an empty submodule dir, `git -C <dir> rev-parse` answers with the main repo, so it returns true, `headCommit()` returns the main repo HEAD, and `patchState()` returns `[]`. Check that `rev-parse --show-toplevel` equals the dir.

**New action `.github/actions/resolver`: the ONLY place that sets up Go and the third-party code.** `bootstrap` loses its Go half and keeps only pnpm, Node and the install. The resolver action owns, in order:
1. Restore `mion-bin/mion` and its stamp from `mion-resolver-<os>-<arch>-<key>`. Cache `mion-bin/extract-fn-bodies` and `mion-bin/extract-fn-bodies-linux-<arch>` in the same entry, under the same key plus `cmd/extract-fn-bodies`.
2. **On a hit (default mode):** stop. No submodule, no setup-go, no Go cache. Output `hit=true`.
3. **On a miss, or with `toolchain: true`:** set up the Go toolchain:
   - init the submodule (step 1);
   - apply the tsgolint patches (moved from bootstrap);
   - setup-go from the pin;
   - restore the EXISTING Go build cache, keeping its key (Go version + tsgolint pin + go.mod/go.sum, plus the arch from step 1). The precompiled typescript-go objects stay cached exactly as today, so a miss rebuilds only our own packages;
   - build, then save the binary entry.

Details:
- `toolchain: true` is for the jobs that need Go beyond the binary (listed below). They always get Go plus the warm build cache, and still restore the binary when it is there.
- Every job restores-or-builds itself. No producer job: on a hit, a producer would add serial latency to every run.
- Parallel misses race to save, and the loser's save no-ops.

**Move every other Go need out of the binary-only jobs:**
- `codegen all --check` and `drizzle-manifest --check` (both `go run`) move from js-lint to go-fuzz, under a new `codegen` lane.
- `check-format`'s gofmt half is already covered by go-fuzz's "Go formatting" step. Give `check-format` a way to run without it in js-lint. The local `pnpm run format` still runs all three.
- `enrichGen.test.ts` and `enrichCheck.test.ts` run `go run ./cmd/extract-fn-bodies` (`packages/run-types/test/util/enrichCases.ts:26`). Make them use the cached `mion-bin/extract-fn-bodies` (a new build target).
- `packages/devtools/test/build-gate.test.ts` runs a real `go build`. Move it to the go-fuzz job with an explicit include in go-fuzz and exclude in js-lint, kept a complete, disjoint partition like the fuzz split. Never skip it.
- `ensurePlayground` skips the playground when `which('go')` fails, even on a wasm cache hit (`scripts/website/site.mjs:139`). Trust the stamp first.
- **bench:** `ensurePrereqs` (`scripts/website/bench-data/bench.mjs:95-96`) calls `checkLinuxGo`, which calls `checkGo()` without the stamp (`build.mjs:190`), and `checkLinuxExtract` always builds (`:242`). On Linux, trust the stamp. Give linux-extract its own stamp.
- **`release binaries --host-only`** (pre-publish-build, drizzle build) runs its own `-trimpath` build. Cache its output under the key plus the release flags.

**Jobs that call the resolver action with `toolchain: true`:** go-fuzz, release-gate build (7 platforms), fuzz-soak (the `convert` lane runs `go test`), website-deploy (`go test -list`). All others get Go only on a miss.

### Step 3: narrower Go inputs for the non-Go lanes

- Lane path entries in `scripts/ci/lanes.mjs` gain an optional `exclude` predicate.
- `WORKSPACE` stops listing `ts-go-runtypes/`. The `go` lane keeps all of it.
- Every other lane hashes only the resolver inputs (`isGoInput`) plus the tsgolint gitlink.
- Lanes that use `extract-fn-bodies` (js, bench, smoke) also add `cmd/extract-fn-bodies`. website and smoke add `cmd/mion-wasm`. The `codegen` lane takes `cmd/gen-*`.
- **Result:** editing a Go test, a `testdata/` fixture or a generator no longer reruns the JS suite or the containers.

**Fix the marker listing before step 4 adds many more keys.** `gh cache list --key mion-lane-green- --limit 200` (`.github/actions/ci-lanes/action.yml:60`) drops the oldest markers past 200. That fails safe, but it quietly reruns lanes. List per lane prefix instead (one call per decided lane), or page past 200.

### Step 4: per-item markers inside the container lanes

- Extend `LANES` with optional `items`: `{name: {paths}}`. An item's hash is the lane's shared paths plus its own.
- `decide` returns `{run, hash, items: {name: {run, hash}}}`. Item keys are `mion-lane-green-<lane>.<item>-<hash>`.
- Each item's job saves its own item marker on success.
- The lane-level marker is written only when every item is green (proven earlier, or passed now).
- The "one marker for the whole matrix" contract (`packages/devtools/test/ci-lane-contracts.test.ts:241`) becomes "each item claims only itself, the lane claims all". Its original worry, one green dialect standing in for four others, cannot happen, because a marker only claims its own item.

**drizzle** (`.github/workflows/drizzle-e2e.yml`)
- Items `pg`, `mysql`, `sqlite`, `d1`, `durable`. The matrix is built from the unproven items with `fromJSON`, so only those dialects run.
- An item's paths:
  - `shared/runners/<d>.test.ts`, `shared/addendum/<d>.test.ts`, and `shared/runners/durable-*` for durable;
  - its image dir `container/drizzle-e2e/<image>/`;
  - its dialect package and manifests.
- Shared paths: the rest of `container/drizzle-e2e/shared/`, `drizzle-suites.pin.json`, `drizzle-dialects.json`, the packages every dialect installs, and the resolver inputs.
- Hash source paths, never tarball bytes. `pnpm pack` is not byte-stable (`scripts/release/receipt.mjs:13-14`).
- Splitting below the dialect is out of scope: the control comparison and the coverage gate need the whole tree.

**bench** (`pr-heavy.yml` bench, and the `bench smoke` / `bench typecheck` steps of ci.yml `smoke`)
1. **Make correctness a real gate first.**
   - Today a competitor that accepts invalid data or rejects valid data is recorded as data only. `aggregate.mjs` exits 1 (`:86-106`), but `cmdBench` ignores it (`scripts/website/bench-data/bench.mjs:331`). The lane stays green, against the rule "every lane must answer correctly AND reject an invalid payload".
   - Fail the run on it, with a test.
2. **Items per competitor** (`COMPETITORS`, `scripts/website/bench-data/columns.mjs:10`).
   - `zod`, `typebox`, `ajv` and `typia` hash only `container/benchmarks/competitors/<c>/`, `_deps/competitors/<c>/` and `shared/`.
   - `mion` adds `packages/` and the resolver inputs.
   - A mion change then reruns only the mion lane.
3. **Run a subset.** Add `bench --only <list>`.
   - `checkEngineBranch` (`bench.mjs:261-282`) needs `results/mion.json`, so it belongs to the mion item.
   - `bench typecheck` gains a name argument. `bench build <name>` already exists.

**pre-publish e2e**
- Items are the three halves that already have flags: `matrix`, `mion`, `host-smoke` (`--no-matrix`, `--no-mion`, `--no-host-smoke`, `scripts/release/e2e.mjs:428-443`).
- All three share every packed package. That is correct: the lane tests the install.
- Per bundler app is out of scope. `build-outputs.test.mjs` hardcodes all 12 apps, and no result files come back out of the container.

**website build and `website check`:** no split. Each is one build.

### Step 5: per-test-file skip for the vitest suite (trial first)

**Key per test file.** sha256 of:
- **The transformed code of every module in its graph.** Walk it before running, with the same code `--changed` uses (`getTestDependencies`, vitest 4.1.8 `cli-api` chunk; `transformRequest` on each node).
  - The devtools plugin writes compiler output as real files under `<genDir>/types/`, imported statically (`packages/devtools/src/core/unplugin.ts:247-250`). So a Go change that yields identical generated code yields an identical key, with no Go hash needed.
  - Our `@mionjs/*` packages resolve through the `source` condition, so they are in the graph.
- **The exact version of every external package the graph loads**, read from `pnpm-lock.yaml`. A zod bump reruns only the files that load zod.
- **A project salt:** Node version, vitest version, the root and project vitest configs, and the sources of the project's `setupFiles` and `globalSetup`, plus what those load. That covers the rpc-client test server and the vercel and cloudflare bundles built there.
- **An env salt:** the `MION_FUZZ_*` values and `version.json`. Fuzz seeds are `hash("${version}:${lane}")` read from disk (`packages/run-types/test/fuzz/core/fuzzPolicy.ts:28-60`).

**Never cached; these files always run:**
- files whose graph imports `node:child_process`, `node:fs`, `node:fs/promises`, `node:net`, `node:http` or `node:worker_threads`. This catches, automatically:
  - the 64 devtools-core files on `test/helpers/inline.ts`, which drive `mion-bin/mion` with no plugin;
  - the ~34 run-types files on `typeFuzzHarness.ts`, `util/enrich*` and `compileHarness.ts`;
  - the 6 drizzle `*.integration.spec.ts`;
  - the go-be-sidecar tests;
  - the 11 `*.compile.test.ts`;
  - the contract tests that read workflow files;
- time-boxed fuzz files (coverage depends on the wall clock).

A file with any test skipped at runtime (`.skipIf(!HAS_BIN)` and the like) is never recorded as passed.

**Runner.** `scripts/core/test-skip.mjs`, on vitest's documented programmatic API: `createVitest`, `globTestSpecifications`, hash each spec, then `runTestSpecifications(unproven)`.
- A reporter's `onTestModuleEnd` records `file → key` when `testModule.ok()`.
- The graph walk warms vite's transform cache in the same server, so the compiler runs once per file, not twice.
- Do not hook a custom sequencer: filtering in `sort()` works, but it is not documented.
- Do not turn on `experimental.fsModuleCache`. Its key is the source file, so it misses Go changes.

**Store.** A JSON file `{file: [last 3 keys]}`.
- In CI, `actions/cache` with `restore-keys: mion-vitest-passed-`, saved under `mion-vitest-passed-<run_id>`. A PR reads its own copies and main's.
- Locally, `node_modules/.cache/mion/vitest-passed.json`, behind an opt-in flag, so a plain `pnpm test` is unchanged.
- A lost or stale file only causes extra runs.

**Where it runs.** Pull requests only, layered under `core test-pr`: projects are picked first, then files. A push to `main` keeps the full suite, as with the `js-pr` marker today.

**Safety net.** Each full run on `main` also computes which files the list would have skipped. If one of those fails, the step fails and names the file: an input the key missed.

**Trial gate.** Before wiring it into `ci.yml`, run it on one Go-only change and one JS-only change from recent history. Record files skipped and wall time. Proceed only if it saves at least a third of the suite's wall time on both. Otherwise record the numbers in this spec and stop at the lane level.

### Step 6: cache cleanup

New `.github/workflows/cache-cleanup.yml` (`permissions: actions: write`), using `gh cache delete`:
- **On `pull_request: closed`:** delete that PR ref's caches (resolver, vitest-passed, markers).
- **Weekly:** keep the newest 20 `mion-resolver-*` and the newest 5 `mion-vitest-passed-*` on main. Delete the rest.
- GitHub still evicts anything unused for 7 days, and the oldest entries past 10 GB.
- Lane markers are never restored, so they expire 7 days after creation. That is fine, and needs no cleanup.

**New env vars** (the vitest skip flag, any others) go in the `REGISTRY` in `scripts/lib/env.mjs`, prefixed `MION_`, and the user-settable ones in `.env.sample`.

## Tests

- **`resolverKey()` unit tests:**
  - same key across two checkouts of one commit;
  - the key changes on a `.go` edit under `internal/`, a gitlink bump, the Go pin, and the `package.json` version;
  - the key stays the same on a `_test.go` or `testdata/` edit;
  - computes with Go missing from PATH.
- **`build.mjs`:**
  - a restored binary with a matching stamp is trusted without Go;
  - a mismatched stamp rebuilds;
  - `submoduleInitialised()` is false on an empty dir. That was the empty-dir bug.
- **`lanes.mjs`:**
  - an `exclude` predicate keeps `_test.go` out of the js lane hash;
  - item hashes;
  - `decide` with items;
  - the lane marker is claimed only when every item is green.
- **Contract tests updated to the new shape:** `ci-lane-contracts.test.ts`, `drizzle-e2e-lane-contracts.test.ts`, `pr-heavy-lane-contracts.test.ts`, `repo-contracts.test.ts`, `fuzz-lane-contracts.test.ts` (the partition gains `build-gate`).
- **bench:** a competitor that accepts an invalid sample fails `bench` (pins the new gate).
- **`test-skip`:**
  - the key is a pure function of the graph contents: the same code gives the same key, and editing an imported module changes it;
  - a file that imports `node:child_process` is never cached;
  - a runtime-skipped file is never recorded;
  - the main-branch audit fails when a would-skip file fails.
- **Every step:** `pnpm test`, `go -C ts-go-runtypes test ./internal/... ./cmd/...`, and one real CI run showing the new step hit and miss in the job summary.

## Docs

Website: none, because this is contributor-only CI with no consumer-facing behaviour. Update the contributor docs instead:
- root `CLAUDE.md`: the Testing and PR readiness lane notes, and the `test-pr` line;
- `SETUP.md`, if it describes CI setup;
- the long header comments in `ci.yml`, `pr-heavy.yml` and `drizzle-e2e.yml` that describe the old shape.

## Out of scope

- Splitting a drizzle dialect below the whole tree.
- Splitting pre-publish e2e per bundler app.
- Splitting the website build.
- Changing test content.
- Self-hosted runners or bigger runners.
- A persistent Go test-result cache. The Go build cache is ~2 GB per entry, and the `go` lane already skips when its inputs match.

## Done when

- A PR whose resolver inputs match a cached key runs js-lint, smoke, website, bench and the drizzle build with no Go setup, no submodule and no Go build.
- No job fetches the TypeScript test corpus.
- A PR that only edits Go tests or `testdata/` skips the js, smoke and container lanes.
- A re-run after one drizzle dialect was fixed runs only that dialect.
- A mion-only change reruns only the mion bench lane.
- A benchmark correctness failure fails the job.
- The step 5 trial numbers are recorded in this spec, and the skip ships only if it met its gate.
- The cleanup workflow ran once and deleted closed-PR caches.
- The simplify-comments pass ran on every touched source file, committed on its own. No website page is touched, so there is no simplify-docs pass.
