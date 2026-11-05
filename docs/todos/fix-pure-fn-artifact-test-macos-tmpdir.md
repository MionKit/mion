---
type: fix
spec: guidelines
status: ready
created: 2026-11-05
---

# Fix the pure-fn artifact test on macOS

## Intent

`pnpm test` fails on a Mac in `packages/devtools/test/pure-fn-artifact.test.ts`, case
`vite app build: not in the client output, which is served as is`. The test should pass on every host.

## Evidence

```text
[plugin vite:build-html]
Error: The "fileName" or "name" properties of emitted chunks and assets must be strings that are neither absolute nor
relative paths, received "../../../../../../../private/var/folders/.../rt-pure-fn-artifact-...
```

- On macOS `os.tmpdir()` is `/var/folders/...`, a symlink to `/private/var/folders/...`. The test uses the link as the
  Vite root, Vite resolves it, and the emitted HTML name walks up out of the root.
- Proven: wrapping the `mkdtempSync` result in `fs.realpathSync` makes all 9 tests in the file pass.
- Test-only and predates the class accessor work that exposed it. It does not touch emitted code.

## Direction

Resolve the temp dir in the test's `BASE`. Check the other devtools tests that build a Vite app under `os.tmpdir()` for the
same shape, and fix them the same way.
