# Examples + website refresh (deepkit/AOT-era API sources)

**Status:** todo
**Created:** 2026-07-15

## Problem

`packages/examples/src/` still contains example sources written against the old deepkit-era
`@mionjs/run-types` API that no longer exists on `@ts-runtypes/core`. They have been broken
since the migration removed those factories (the `create*Fn` value-level factories were
dropped upstream in ts-runtypes `eb7b618`, already in 0.9.1). CLAUDE.md says the examples
package "should compile", so this is real doc drift.

The four prepareForJson/restoreFromJson examples were fixed in the 0.9.2 adoption
(`serialization-union`, `json-prepare`, `json-restore`, `complete-example` →
`createJsonEncoder`/`createJsonDecoder`/`createValidate`/`createMockData`). The rest remain.

## Evidence

Files under `packages/examples/src/` still importing removed/deepkit-era names
(`createIsTypeFn`, `createTypeErrorsFn`, `createStringifyJsonFn`, `createPrepareForJsonFn`,
`createRestoreFromJsonFn`, `createMockTypeFn`, `reflectFunction`, `runType(`, deepkit
serialize/deserialize):

- `_homepage/home-run-types.ts`
- `run-types/strict-types-example.ts`
- `run-types/advanced-runtype.ts`
- `run-types/reflect-function-note.ts`
- `run-types/validation-is-type.ts`
- `run-types/mock-data.ts`
- `run-types/json-stringify.ts`
- `run-types/comparison-type-first.ts`
- `run-types/validation-type-errors.ts`

Plus deepkit/AOT-era leftovers noted in the migration audit (`src/codegen/aot-*`,
`introduction/pure-functions-examples`, old vite configs), and the website content under
`website/` that still shows deepkit/`mion-build-aot` APIs.

## Fix plan

- Rewrite each example to the public synchronous API: `createValidate` / `createGetValidationErrors`
  / `createJsonEncoder` / `createJsonDecoder` / `createMockData` (and `getRTFunction<'pjs'>/<'rj'>`
  for value-level transforms if a framework-style example is wanted). Remove the erroneous `await`
  (the ts-runtypes factories are synchronous).
- Delete the genuinely-obsolete AOT/pure-fn-extraction examples, or reframe pure functions around
  `registerMionPureFn` / the `mionjs` namespace.
- Refresh the website (`website/`) content + code-import sources to the current API and plugin
  options (drop `mion-build-aot`, deepkit reflection config).
- Verify the examples compile (they are wired to "should compile" per CLAUDE.md).

## Acceptance

- No example under `packages/examples/src/` imports a removed factory; the examples typecheck.
- Website docs no longer reference deepkit / `mion-build-aot` / AOT cache generation.
