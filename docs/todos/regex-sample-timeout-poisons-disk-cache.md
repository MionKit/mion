---
type: fix
spec: guidelines
status: ready
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
