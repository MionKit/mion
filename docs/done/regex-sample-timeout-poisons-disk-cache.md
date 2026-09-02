---
type: fix
spec: guidelines
status: done
created: 2026-09-02
---

# A transient regex-sample timeout is cached as a build-halting FMT002 error

## Intent

While fixing the compact codec (`docs/done/roundtrip-compact-quoted-object-key.md`) a
vitest run started on a loaded machine (a Go test run and a fuzz soak in parallel) and
every later vitest run in the tree halted at startup with

```
@mionjs/devtools: 3 unsupported-type errors — build halted.
packages/test-server/src/test-server.ts(287,4): error FMT002: Invalid type-format params:
pattern /^[^\s@]{1,64}@(?:[a-zA-Z0-9-]{1,63}\.)+[a-zA-Z]{2,63}$/ does not compile as a JS
RegExp: pattern evaluation timed out on a 16-character sample; the pattern may backtrack
catastrophically
```

The pattern is the stock email format and matches a 16-character sample in about a
millisecond. The verdict came from the regex sidecar's per-sample budget (250 ms, see
`MATCH_BUDGET_MS` in `packages/go-be-sidecar/src/index.ts`), which was blown only because
the machine was saturated. That transient verdict was then written into the resolver's
disk cache with the entry it belongs to (`node_modules/.cache/mion/<fingerprint>/<typeID>/
val.json`, the `diagnostics` field of `RTEntry` in
`ts-go-runtypes/internal/cachegen/diskcache/format.go`) and replayed as an Error on every
following run, on an idle machine, until the cache was deleted by hand. Two entries under
`packages/client/node_modules/.cache/mion` and the ones under `packages/test-server`
carried the text `backtrack catastrophically`.

Predates the compact fix: the same tree without that change halts the same way as long as
the poisoned entries exist, and passes with `MION_CACHE_DIR=""` (cache off) or after
`rm -rf packages/*/node_modules/.cache/mion`.

## Direction

The implementer plans the details. Verified pointers:

- The sidecar reports a timed-out sample as `compileError` via `runawayMessage`
  (`ts-go-runtypes/internal/jsengine/sidecar.bundle.mjs`, built from
  `packages/go-be-sidecar/src/index.ts`), and the resolver turns that into the Error
  severity diagnostic `FMT002` (`CodeFMTInvalidParams` in
  `ts-go-runtypes/internal/diagnostics/codes_runtype.go`).
- The disk cache stores an entry's diagnostics alongside its code
  (`ts-go-runtypes/internal/cachegen/diskcache/format.go`, `Diagnostics []CachedDiagnostic`),
  so a verdict that depends on wall-clock load becomes permanent.
- Two reasonable fixes, to be weighed: never cache an entry whose diagnostics include a
  timeout verdict (a timeout is not a property of the type), and/or make the sidecar
  retry a timed-out sample once on a quiet budget before declaring the pattern runaway.
  The budget itself may also deserve a look: 250 ms per sample is tight under CI load.
- Doc drift found on the way: the comments in
  `ts-go-runtypes/internal/cachegen/diskcache/disk.go`, `format.go` and `fingerprint.go`
  still name the cache dir `node_modules/.cache/ts-runtypes`; the resolver writes
  `node_modules/.cache/mion` (`ts-go-runtypes/internal/compiler/resolver/resolver.go`).
  Fix those comments in the same change.

## Done when

- A regex-sample timeout can no longer be replayed from the disk cache: a fresh run after
  a loaded run does not halt on `FMT002` for a pattern that matches its sample quickly.
- A test pins it (Go, around the disk cache write or the sidecar verdict, whichever side
  owns the fix).
- The diskcache comments name the real cache directory.

## Plan (built 2026-09-02, run unattended from a delegated session)

Both directions from above shipped, plus the session-scoped twin of the same bug:

- **The sidecar retries a timed-out sample on a quiet budget** before declaring the
  pattern runaway. `MATCH_BUDGET_MS` (250 ms) and `MATCH_RETRY_BUDGET_MS` (2000 ms) now
  live in `packages/go-be-sidecar/src/jobs.ts`; the matcher receives the budget per call
  and `boundedMatch` is the one place a sample is judged. Main landed the same-budget
  retry (`MATCH_RETRIES_PER_BATCH`, capped per batch so a batch of real runaways still
  answers inside Go's round-trip timeout) in parallel; the two merged so each timed-out
  sample gets ONE retry on the quiet budget while the batch allowance caps how many
  retries a batch spends. Both budgets together stay under the resolver's 5 s round-trip
  timeout. A sample that answers on the first budget never pays the retry.
- **A timeout has its own wire channel.** The sidecar answers `timedOut` instead of
  overloading `compileError` (validate) or `generateError` (generate); Go mirrors it as
  `TestResult.TimedOut` / `GenerateResult.TimedOut` (`ts-go-runtypes/internal/jsengine`).
- **A new diagnostic, FMT007 `CodeFMTPatternTimeout`,** replaces the FMT002 text for that
  verdict. Still Error severity (a genuinely runaway pattern must not ship), but marked
  `Transient: true` in the catalog (`diagnostics.IsTransient`). The enrichment pass records
  a timed-out generate draw as a `formats.PatternGenFailure{TimedOut: true}` so the
  emitter raises FMT007 there too, instead of a permanent FMT005.
- **The disk cache never persists an entry whose walk emitted a transient finding**
  (`writeCachedEntry` in `ts-go-runtypes/internal/cachegen/typefunctions/module.go`). Not
  "the entry without the diagnostic": that would let a real runaway pattern ship silently
  on the next, cached, build. The next build walks the entry again and re-tests. No
  `FormatVersion` bump: the fingerprint already folds the binary stamp, so a new binary
  orphans the old cache dirs.
- **The sidecar's in-session memo skips a timed-out verdict** as well, so a watch-mode
  session re-judges the pattern on the next rebuild instead of replaying the spike until
  the dev server restarts.
- **Stale comments fixed:** every `node_modules/.cache/ts-runtypes` mention in the Go
  tree and `packages/devtools/src/core/unplugin.ts` now names `node_modules/.cache/mion`.

Tests:

- Go, `internal/compiler/resolver/pattern_timeout_cache_test.go`: two sessions share one
  cache dir with a staged engine. A timeout (validate lane and generate lane) is raised as
  FMT007 in the loaded session, is absent from every cache file, and is gone in the quiet
  session; the control lanes stage a compile error / a generator failure for the same
  patterns and prove those DO replay from the cache (the v16 contract, and the proof the
  sessions share the cache). A second test pins the watch-mode rescan within one session.
- Go, `internal/jsengine/sidecar_test.go`: the fuzz lane's real runaway pattern answers
  `TimedOut` on the committed bundle, never `CompileError`, and is not memoized.
- Go, `internal/diagnostics/catalog_test.go`: FMT007 is the one transient FMT code.
- Vitest, `packages/go-be-sidecar/test/jobs.test.ts`: the retry runs once on the larger
  budget, a verdict on the retry wins, a sample that answers first is never retried, and a
  double timeout reports `timedOut` only. The fuzz suite's verdict-shape check and the
  pinned runaway job assert the new field.

Docs: the diagnostics catalog (`pnpm rtx core codegen diag`) carries FMT007's headline and
detail for the website's diagnostics page and the devtools message dictionary. No prose
page changed: the budget and retry are not consumer knobs.
