# `go-generated/` — Go→TS generated mirrors (DO NOT EDIT)

Every file in this directory is **generated from the Go source** and committed so
consumers build without the Go toolchain. **Do not hand-edit anything here** — your
change will be overwritten on the next regenerate, and CI fails the PR (see the drift
gate below).

Files in this directory contain **exclusively generated code**. Anything hand-written
(wrappers, helpers, re-exports) lives in the parent `src/` tree and imports from here —
never mix generated and manual code in one file.

## What's here

| File                       | Generator               | Go source of truth                                                  |
| -------------------------- | ----------------------- | ------------------------------------------------------------------- |
| `runTypeKind.generated.ts` | `cmd/gen-run-type-kind` | `internal/reflection/runtype.go` + `internal/reflection/subkind.go` |
| `fnHashes.generated.ts`    | `cmd/gen-fn-hashes`     | `internal/cachegen/operations` (registry + fnhash salt)             |

## Regenerate

```bash
pnpm miondevx core codegen kind        # runTypeKind.generated.ts (+ the devtools ReflectionKind mirror)
pnpm miondevx core codegen fnhashes    # fnHashes.generated.ts
pnpm miondevx core codegen all         # every Go→TS mirror in the repo
```

The generator list lives in one place — the `CODEGEN` map in
[`scripts/miondevx.mjs`](../../../../scripts/miondevx.mjs).

## How they stay in sync with Go

- **Drift gate on every PR:** `pnpm miondevx core codegen all --check` regenerates, formats,
  and `git diff`s the outputs — a stale mirror fails CI
  ([`.github/workflows/ci.yml`](../../../../.github/workflows/ci.yml) and
  [`release-gate.yml`](../../../../.github/workflows/release-gate.yml)).
- **Go-level companion tests:** `TestRunTypeKindFileInSync` and `TestFnHashesFileInSync`
  (`ts-go-runtypes/cmd/gen-*`) pin the values directly.
