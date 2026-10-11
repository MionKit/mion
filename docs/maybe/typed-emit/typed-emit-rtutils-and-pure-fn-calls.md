---
type: feature
spec: guidelines
status: maybe
created: 2026-10-11
---

# Typed emit: exact types on every rtUtils and pure-fn call

## Intent

In emitMode 'ts', generated factories reach their dependencies through rtUtils with loose types:
`utl.getRT<(v: any, ...rest: any[]) => R>('key')!` and `utl.getPureFn('id' as PureFnId)!`, so a
pure-fn call inside a generated body returns `any`. The generator already knows, at each call site,
which rtUtils function is called, with which key, and what it returns. Every call should carry that
exact type, so a TypeScript-to-native compiler sees a fully typed call graph.

## Direction

- rtUtils call sites in generated code: `registerRTLookup` and `UsePureFn`
  (`ts-go-runtypes/internal/cachegen/typefunctions/emitter.go`), the JSON composites
  (`json_composite.go`), overrides (`override.go`, `utl.usePureFn`), and the runtype bundle `ini`
  (`rtu.useRunType`, `internal/compiler/entrymodules/entrymodules.go`).
- Lookup types today come from `KeyLookupType` (`typefunctions/tsmark.go`): `any` inputs on purpose,
  because bodies hold `any`. Once bodies are typed per node, the lookup can take the child's exact
  input type. Plan the order together with typed bodies.
- `rtUtils` generics (`packages/run-types/src/runtypes/rtUtils.ts`: `getRT`, `getPureFn`, `usePureFn`,
  `useRunType`) should infer from the call or take an exact generic, never need a cast.
- Pure fns: the id is known at compile time, and so is the source node it was extracted from
  (`internal/cachegen/purefunctions`). Resolve its parameter and return types with the checker and
  print them inline, the node-level way the type printer already prints types (`internal/convert`).
  Never import the author's declarations (circular imports, unexported types).
- The implementer plans the details.

## Docs

Existing section "Typed Output" in
`container/website/content/02.runtypes/01.introduction/04.configuration.md`: one line if the shown
example changes.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- No generated call to rtUtils or a pure fn is typed `any` or cast through `unknown`.
- The strictest-tsconfig checks (`compile-cli-ts.test.ts`, the `typedemit` fuzz lane) stay at 0 errors.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched
  source file, each committed on its own.
