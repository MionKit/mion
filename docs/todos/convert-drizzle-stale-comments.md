---
type: chore
spec: guidelines
status: ready
created: 2026-09-25
---

# Stale comments and a dead constant in the drizzle convert code

## Intent

Comments in `ts-go-runtypes/internal/convert/` describe behaviour the code no longer has, and one constant is unused.

## Direction

- `drizzle.go:13-14` says "a backward reference refuses with a reorder message", and the `CodeDrizzleUnsupported` comment at `convert.go:57-58` lists "backward references". The code now thunks a reference to a table declared later (`drizzle.go:1709-1716`, pinned by `TestDrizzle_ForwardReferenceThunk`), so neither refuses. Rewrite both to match.
- `drizzle_test.go:507-510` is an orphan doc comment for `TestDrizzle_BackwardReferenceRefusal`, a test that no longer exists. Delete it.
- `sentinelColumn = "@rtColumnKey"` (`drizzle.go:45`) is declared and never used. Delete it.
- Check the rest of the package for other text that still says backward or forward references refuse.
- Follow the repo comment rules (one-line comments that say what the code cannot). The implementer plans the details.

## Docs

None, because only code comments and a dead constant change.

## Done when

- The comments match the code, the orphan comment and the dead constant are gone.
- `go -C ts-go-runtypes test ./internal/... ./cmd/...` passes and `gofmt` is clean.
- The simplify-comments pass ran on every touched source file, committed on its own.
