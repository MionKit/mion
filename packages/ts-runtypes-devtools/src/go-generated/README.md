# `go-generated/` — Go→TS generated mirrors (DO NOT EDIT)

Every file in this directory is **generated from the Go source** and committed so
consumers build without the Go toolchain. **Do not hand-edit anything here** — your
change will be overwritten on the next regenerate, and CI fails the PR (see the drift
gate below).

Files in this directory contain **exclusively generated code**. Anything hand-written
lives in the parent `src/` tree and imports from here — never mix generated and manual
code in one file. For example the hand-written render helpers in
[`../diagnosticCatalog.ts`](../diagnosticCatalog.ts) import the generated dictionary
`diagnosticCatalog.generated.ts` from this directory.

## What's here

| File                                | Generator                                                           | Go source of truth                                                  |
| ----------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `runtypes-constants.generated.ts`   | `cmd/gen-ts-constants`                                              | `internal/constants/constants.go`                                   |
| `reflectionKind.generated.ts`       | `cmd/gen-run-type-kind`                                             | `internal/reflection/runtype.go` + `internal/reflection/subkind.go` |
| `diagnosticCatalog.generated.ts`    | `cmd/gen-diag-catalog` → `scripts/core/gen-diagnostics-catalog.mjs` | `internal/diagnostics/messages.go`                                  |
| `tsconfig-plugin-keys.generated.ts` | `cmd/gen-plugin-keys`                                               | `cmd/mion/config.go` (`tsRuntypesPlugin` json tags)                 |

## Regenerate

```bash
pnpm rtx core codegen constants   # runtypes-constants.generated.ts
pnpm rtx core codegen kind        # reflectionKind.generated.ts (+ the core RunTypeKind mirror)
pnpm rtx core codegen diag        # diagnosticCatalog.generated.ts (+ the website JSON)
pnpm rtx core codegen pluginkeys  # tsconfig-plugin-keys.generated.ts (bundler-option parity)
pnpm rtx core codegen all         # every Go→TS mirror in the repo
```

The generator list lives in one place — the `CODEGEN` map in
[`scripts/rt.mjs`](../../../../scripts/rt.mjs).

## How they stay in sync with Go

- **Drift gate on every PR:** `pnpm rtx core codegen all --check` regenerates, formats,
  and `git diff`s the outputs — a stale mirror fails CI
  ([`.github/workflows/ci.yml`](../../../../.github/workflows/ci.yml) and
  [`release-gate.yml`](../../../../.github/workflows/release-gate.yml)).
- **Go-level companion test:** `TestRunTypeKindFileInSync` (`ts-go-runtypes/cmd/gen-run-type-kind`)
  pins the `reflectionKind` values against the same protocol consts as the core mirror.
