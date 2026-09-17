---
type: chore
spec: guidelines
status: ready
created: 2026-09-17
---

# Ship the built-in pure-fn table as a build artifact, not Go source

## Intent

`ts-go-runtypes/internal/cachegen/builtinpurefns/table.generated.go` holds the compiled JS bodies
of the 46 package-owned pure fns (`rt::` and `rtFormats::`) as a committed Go file, regenerated
from `packages/run-types/src` by `cmd/gen-builtin-purefns` and drift-checked by
`pnpm miondevx core codegen all --check`.

The table exists for a good reason and must stay: it is how a published consumer, whose program
sees only run-types' `.d.ts`, receives the built-in bodies on demand (`serveBuiltinPureFns` in
`internal/compiler/resolver/dispatch.go`), which is what lets the dist ship hollowed
(`scripts/core/hollow-builtin-purefns.mjs`) and keeps roughly 11 KB out of every consumer bundle.
That saving is not negotiable.

What is wrong is only WHERE the bodies live: compiled JS committed as Go source, baked into the
binary, kept in sync by a codegen lane. A table of extracted bodies is a build output. It belongs
in an artifact the resolver reads at compile time, next to the dist it describes.

## Direction

The implementer plans the details. Verified pointers and constraints:

- **Serving does not change.** Same demand rule, same transitive closure, same PFE9012 for a
  demanded key the table lacks. Only where the rows come from changes. The `builtinpurefns`
  package can keep its `Has` / `Keys` / `Closure` surface and load from the artifact instead of
  the generated slice; every caller is in `internal/compiler/resolver/` (`render.go`,
  `dispatch.go`, `apigen.go`).
- **The generator already produces the rows.** `cmd/gen-builtin-purefns` runs the real extractor
  over the five built-in source files and gets key, bodyHash, paramNames, code and deps, the same
  fields `builtinEntry` holds. Redirect its output to a file (JSON is the natural shape: readable
  by Go with no evaluation) instead of rendering Go source.
- **Make it an output of the run-types build.** run-types builds with tsc; its `build` script in
  `packages/run-types/package.json` already ends with the hollow step. The table and the hollowing
  are two halves of one build: a hollowed dist without its table is broken, so produce both there
  and fail the build if either is missing. Ship the file with the package (`files` in package.json).
- **Locate it from the program, not from a repo path.** The resolver resolves `@mionjs/run-types`
  from the program (every transformed file imports it) to the package root and reads the artifact
  through the program FS. In-repo the package resolves via the `source` condition to
  `packages/run-types/`, where the file sits under `dist/`; `check:builds` should cover it the way
  it covers the marker dist, since Go tests read it too (`builtinpurefns_test.go`, the emitter
  tests that reach built-ins).
- **Load once per session**, not per request. A missing or unreadable artifact must fail the
  build loudly with a message naming the file, never degrade to a runtime "Pure function not
  found".
- **Delete what the move makes redundant**: `table.generated.go`, the `builtinpurefns` codegen row
  in `scripts/miondevx.mjs` and its `codegen` args in `scripts/lib/devx-registry.mjs`, and the
  `--check` drift lane for it (drift is impossible once the table is a build output).
- **The row key is whatever the extractor produces.** A later change to how pure fns are named
  does not touch this work; it only changes the strings in the rows.
- **Docs**: nothing user-facing. Update `ts-go-runtypes/CLAUDE.md` and any comment that says the
  bodies travel through the binary (`builtinpurefns.go` header, `pureFn.ts` hollow lane comment,
  the hollow script header).

## Done when

- No committed source file holds compiled JS bodies; `table.generated.go` and its codegen lane
  are gone.
- A published consumer still receives built-in bodies on demand, and they stay out of its bundle
  (the hollow lane is unchanged, pinned by a test that a hollowed dist ships its table).
- A missing table fails at compile time with a clear message, pinned by a test.
- From a fresh clone, the normal build produces the artifact and `pnpm test`,
  `go -C ts-go-runtypes test ./internal/... ./cmd/...` and `pnpm run check:builds` pass.
