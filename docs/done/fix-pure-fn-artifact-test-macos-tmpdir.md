---
type: fix
spec: guidelines
status: done
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
  Vite root. Vite keeps that root as given but resolves the HTML entry, so the emitted HTML name walks up out of the root.
- Proven: wrapping the `mkdtempSync` result in `fs.realpathSync` makes all 9 tests in the file pass.
- Predates the class accessor work that exposed it.

## Direction

Resolve the temp dir in the test's `BASE`.

## Done when

- `pure-fn-artifact.test.ts` passes on a Mac.
- Comment simplification pass done.

## What shipped

- `BASE` goes through `realpathSync`. The other tests running Vite on an unresolved tmpdir root pass on a Mac, so they stayed.
  `package-pure-fns-e2e.test.ts` got the same line: on a Mac its esbuild fixture hit the new error below.
- Review showed the plugin quietly skips the same setup: with a symlinked `cwd`, hosts load real paths, the program holds link
  paths, and marker calls shipped unrewritten with no error. `src/core/unplugin.ts` now fails with an error naming the symlink,
  only when the site set proves the file has marker calls. Supporting symlinked projects was tried and cut: it took about 30
  lines plus three redesigns for a rare setup that Vite itself refuses for HTML apps and in dev.
