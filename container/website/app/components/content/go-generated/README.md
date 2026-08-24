# `go-generated/` — Go-generated website data (DO NOT EDIT)

The file in this directory is **generated from the Go source** and committed so the
website builds without the Go toolchain. **Do not hand-edit it** — your change will be
overwritten on the next regenerate, and CI fails the PR (see the drift gate below).

Files in this directory contain **exclusively generated data**. The consumer
([`../DiagnosticCatalog.vue`](../DiagnosticCatalog.vue)) imports the JSON from here — never
mix generated and hand-written data in one file.

## What's here

| File | Generator | Go source of truth |
| --- | --- | --- |
| `diagnostics-catalog.json` | `cmd/gen-diag-catalog` → `scripts/core/gen-diagnostics-catalog.mjs` | `internal/diagnostics` (messages + prose) |

This is the same generator run that emits the devtools front-end dictionary
(`packages/ts-runtypes-devtools/src/go-generated/diagnosticCatalog.generated.ts`); it fans
one Go dump out into both artifacts.

## Regenerate

```bash
pnpm rtx core codegen diag        # diagnostics-catalog.json (+ the devtools TS dictionary)
pnpm rtx core codegen all         # every Go→TS mirror in the repo
```

## How it stays in sync with Go

`pnpm rtx core codegen all --check` regenerates and `git diff`s the outputs on every PR —
a stale file fails CI (`.github/workflows/ci.yml` and `release-gate.yml`).
