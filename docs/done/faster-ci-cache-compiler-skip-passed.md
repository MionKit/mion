---
type: chore
spec: full-plan
status: done
created: 2026-09-29
---

# Faster CI: cache the compiler, and skip work that already passed

## Problem

Every heavy CI job paid the same setup before its first test (measured on the 2026-09-29 runs): ~30s for a checkout with `submodules: recursive`, ~30s of bootstrap (Go, the 2 GB Go build cache, pnpm, install), and 50 to 70s of `check:builds`. It repeated in go-fuzz, js-lint, smoke, the pr-heavy jobs, the drizzle build and most of the release gate. On top of that, a Go test edit re-ran the whole JS suite, a container lane was all or nothing, and seven nearby bugs sat in the cache keys and gates.

The idea, applied at three sizes: a result depends only on its inputs, so hash the inputs and skip the work when that hash already passed. It already worked per lane; this extends it to the compiler binary, to items inside a lane, and (as a local tool) to single test files.

## What shipped

One branch, not the six PRs first planned: the steps kept touching the same workflows and scripts.

### Cheaper setup
- No checkout uses `submodules: recursive` any more. The resolver action inits only `third_party/tsgolint` and its `typescript-go`, at `--depth 1`, skipping the ~620 MB `_submodules/TypeScript` corpus.
- CI's Go is pinned in `ts-go-runtypes/.go-version` (read by setup-go through `go-version-file`). A `toolchain` line in `go.mod` was not used: with `GOTOOLCHAIN=auto` it would make every older local Go download the pinned one.

### The cached resolver
- `goBinCacheKey()` in `scripts/core/build.mjs` (`core build --cache-key`) keys `mion-bin/mion` + `mion-bin/extract-fn-bodies` and their stamps as `mion-go-bins-<platform>-<arch>-<hash>`. It needs git and node only: the input files, the ldflags (root `package.json` version, a fixed 7-char tsgo sha), the PINNED Go version (never the Go on PATH: runner images ship their own), the platform, the tsgolint commit (the checkout's, else the gitlink) and any unapplied patch.
- The stamp uses the same identity, so a restored binary is trusted with no Go on PATH; `checkStampedGoBin` asks for Go only past the stamp, and warns when a local build uses a Go other than the pin.
- `.github/actions/resolver` is the ONE place a job sets up Go: restore; on a miss (or `toolchain: 'true'`) fetch the submodule, apply the patches, setup-go, restore the existing tsgolint-keyed Go build cache, build and save. `bootstrap` now holds only Node, pnpm and the install.
- `toolchain: 'true'` jobs: go-fuzz, release-gate build and soak, fuzz-soak, website-deploy. Conditional on a cache miss: smoke, pr-heavy website and release-gate website (the playground wasm), pre-publish-build and the drizzle build (the release binary). Every other job gets Go only on a resolver miss.
- The Go-backed JS checks (codegen drift, drizzle-manifest drift, `build-gate.test.ts`) moved from js-lint to go-fuzz under a new `go-tools` lane; js-lint runs `check-format:js`, and the gofmt half runs in go-fuzz.
- The enrich tests spawn the prebuilt `mion-bin/extract-fn-bodies` (new `extract` build target) instead of `go run`. linux-go / linux-extract copy the trusted host binaries on Linux.
- `release binaries` caches each binary under `.cache/release-bin/`, keyed on the exact go args and env it builds with (`goBuild` / `cachedBinPath` / `stageBinary`); `--cache-key` prints the Actions key the packing jobs restore and save.

### Narrower lane inputs
- Lane path entries can be `{prefix, keep}`. Every non-Go lane hashes `ts-go-runtypes/` through one `GO_BUILD` filter: `isGoInput` (no `_test.go`, no `testdata/`) minus `cmd/gen-*`. `go` and `go-tools` hash the whole tree.
- `core test-pr` ignores a path the js lane does not hash (a Go test, docs), but an UNCLASSIFIED path still forces the full suite.
- The ci-lanes action looks each candidate marker up by its exact key (`lanes --candidates`), so no marker falls off the end of a listing.

### Per-item markers
- A lane can declare `items`; an item hashes the lane's paths minus what a sibling item claims. `decide` returns `items` and `runItems`, and the lane marker is written only once every item that ran passed (the others were proven by their own markers).
- drizzle: one item per database lane (pg, mysql, sqlite, d1, durable), a matrix built from `runItems`, one marker per dialect.
- bench: one item per competitor; only mion hashes our packages and the Go tree. The pr-heavy bench job is a per-competitor matrix running `bench --quick --only <name>`, with a `bench-green` lane-marker job.
- smoke: `website` and `bench` items; both hash our packages and Go (the site, and the mion competitor `bench smoke` builds).
- pre-publish e2e: `matrix`, `mion` and `host-smoke` items, mapped onto `release e2e`'s `--no-*` flags.
- A benchmark correctness failure now fails `bench` (it used to be printed by aggregate and ignored). Measured before the change: every competitor passed, so the gate turned nothing red.

### Cache cleanup
`.github/workflows/cache-cleanup.yml` + `scripts/ci/cache-cleanup.mjs`: on `pull_request_target: closed` it deletes every cache of that PR's ref EXCEPT the lane markers (main reads them after a merge). Weekly it keeps the newest 20 `mion-go-bins-*` on main. A refused delete fails the job; a cache already gone does not. `pull_request_target` because a fork's `pull_request` token is read-only; it runs only the base branch's code.

### The nearby bugs, fixed here
The Go build cache key had no `runner.arch` (website-deploy runs on arm64); the playground wasm key ignored the tsgolint commit, the pinned Go and `go.work`; `submoduleInitialised()` answered true on an empty submodule dir; `--short` made the tsgo sha length depend on the clone; the marker listing stopped at 200; bench ignored aggregate's exit code; `ensurePlayground` refused to run without Go even on a wasm cache hit.

### Per-test-file skip: shipped as a local tool only
`core test-skip` (and `test-pr --skip-passed`) keys each vitest file on the code it loads after the vite transform (so the compiler's output, not the Go source), its external package paths and a salt, and skips files already recorded as passed. Generated pattern `mockSamples` are drawn at random on purpose when no mock.seed is set, so they are stripped from generated code before hashing. A file importing `child_process`, `fs`, `net`, `http` or `worker_threads`, a time-boxed fuzz file, and a file with any skipped test are never recorded; a run with unhandled errors records nothing.

The trial (this container, 485 files, the js-lint suite):

| run | wall |
|---|---|
| plain vitest | 396s |
| test-skip after a Go-only change (`80e6cd5` replayed) | 301s |
| test-skip after a JS-only change (`4f1a6ea` replayed) | 310s |

Both replays skipped all 290 cacheable files (their compiled code was identical), but the 195 never-cached files, above all the 100 devtools-core files driving the binary, dominate the time. 22 to 24% missed the one-third gate, so the CI wiring was not shipped; it is a new todo.

## Tests

- `go-inputs.test.ts`: the key computed with node and git only equals the in-process one; two worktrees of HEAD give one key; the ldflags carry the root version and a 7-hex tsgo sha; only unapplied patches count; the wasm digest and key include the tsgolint commit, `.go-version` and `go.work`; the playground build runs without Go.
- `build-gate.test.ts` (go-fuzz): a matching stamp is trusted with no Go on PATH, linux-go / linux-extract fill from trusted binaries with no Go, a mismatched stamp fails loudly without Go.
- `ci-lane-contracts.test.ts`: the `GO_BUILD` filter, item hashing, `decide` with items, `candidateKeys`, item-save guards, no whole-lane save inside a drizzle dialect or bench competitor job, the gocache arch, no recursive submodules, and the build-gate split between go-fuzz and js-lint.
- `release-binaries-contracts.test.ts`: the cache key names the platform, GOARM and version; a second stage reuses the cached binary.
- `bench-lane-contracts.test.ts`: aggregate exits 1 on a divergence, `bench` honours it, `--only` narrows and refuses an empty list.
- `cache-cleanup.test.ts`, `test-skip.test.ts`, `test-pr.test.ts`: the cleanup plan and command, the skip key and recorder, the unclassified-path rule and `--skip-passed`.

## Out of scope

Splitting a drizzle dialect below the whole tree; splitting pre-publish e2e per bundler app; splitting the website build; a persistent Go test-result cache.
