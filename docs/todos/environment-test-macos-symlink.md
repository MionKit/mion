---
type: fix
spec: guidelines
status: ready
created: 2026-10-03
---

# Environment tests fail on macOS (symlinked temp dir)

## Intent

Two Go tests fail on macOS, on `origin/main` too, while Linux CI passes:

```
--- FAIL: TestEnvironment_DependencyReferenceTypes
    environment_test.go:48: a dependency's `/// <reference types>` loads its target as environment: map[]
--- FAIL: TestEnvironment_TypesListAndReferencePath
    environment_test.go:63: node_modules/@types/runtime/index.d.ts is loaded by the `types` list or its `/// <reference path>`: map[]
```

Repro: `go -C ts-go-runtypes test -count=1 ./internal/compiler/program/` on a Mac.

Likely cause: `environmentProject` in `ts-go-runtypes/internal/compiler/program/environment_test.go` trims `cwd+"/"` from each source file name. On macOS `t.TempDir()` lives under `/var/folders`, a link to `/private/var/folders`, so the file names carry the resolved path, nothing matches `node_modules/`, and the map is empty.

## Direction

- Resolve the temp dir (`filepath.EvalSymlinks`) before building the project, or compare resolved paths.
- Check whether `program.EnvironmentFile` itself is sensitive to a project under a symlinked directory in real use; if so, fix it there and add a test.

## Done when

- `go -C ts-go-runtypes test ./internal/compiler/program/` passes on macOS and Linux.
