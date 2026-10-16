---
type: chore
spec: guidelines
status: ready
created: 2026-10-16
---

# Router Tests Build Their Router When the File Loads

## Intent

`packages/rpc-router/AGENTS.md` says tests call `createMionRouter` in `beforeEach` / `beforeAll` next to the reset,
never where the file is evaluated: bun runs a package's test files in one process, so a router built at load
throws on a flag a sibling file set, and that whole file is skipped while the run still reports `0 fail`.

20 files under `packages/rpc-router/test/` still build it at module level, e.g.
`test/lib/remoteMethods.spec.ts:21`, `test/mionRouter.spec.ts:22`, `test/fatalDispatch.spec.ts:31`.
List them with `grep -rln "^const \w* = createMionRouter" packages/rpc-router/test`.

## Direction

- Move each router into the file's `beforeEach` / `beforeAll`, next to `resetRouter()`.
- Route definitions that read the router (`mion.route(...)` in a describe body) move with it, or into a helper the
  hook calls. The implementer plans the shape per file.
- Prove it under bun: run the package's tests with bun and check no file is skipped.

## Docs

None, because only tests change.

## Done when

- No file under `packages/rpc-router/test/` builds a router at module level or in a describe body.
- The package's tests pass under vitest and bun, every file run.
- The simplify-comments pass ran on every touched source file, committed on its own.
