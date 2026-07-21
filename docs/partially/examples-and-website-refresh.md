# Examples + website refresh (deepkit/AOT-era API sources)

**Status:** partially done (PR #125). Examples ported off the removed factories and website
refreshed off the deepkit/AOT surface; residual pre-existing example-compilation debt is tracked
separately in [examples-precompile-debt.md](examples-precompile-debt.md). See "What shipped" below.
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

### Extended inventory from the migration review (R4/R35 of [migration-review-findings.md](../done/migration-review-findings.md), 2026-07-20)

**PORT to the new API** (in addition to the list above): `binary-serialization.ts`,
`serialization-any.ts` (removed `create*Fn` factories); `codegen/vite-vitest-global-setup.ts`
(documents the `await serverReady` globalSetup pattern that now hangs under the `source`
condition — document port polling / the new contract instead, see R27);
`type-formats/builtin/domain-custom.ts` (`FormatDomainStrict<{…}>` generics removed) and
`type-formats/builtin/custom-strings.ts` (`{val, errorMessage}` param metas removed —
patterns go through `registerFormatPattern({source, flags, message, mockSamples})`).

**DELETE outright** (AOT-era + old-pure-fn-era, do not port): the whole `codegen/aot-*.ts`
family (5 files),
`introduction/pure-functions-examples.ts`, `introduction/eslint-pure-functions.routes.ts`
(rewrite the topic around `registerMionPureFn` + `serverMapFrom`),
`run-types/pure-functions.ts` (`registerPureFnClosure` gone); re-point
`codegen/client-no-vite.ts` (imports `aot-routes-example.ts`); rewrite
`cloudflare/cloudflare-config.ts` + `cloudflare-handler.ts` off the removed `{aot: true}`
option to the current Cloudflare story (the edge deployment answer now rides the
build-inlined `virtual:mion/server-mappers` module — no runtime fs).

**Website (same wave):** delete `5.devtools/0.aot-compilation.md`; rewrite
`5.devtools/1.pure-functions.md` around `registerMionPureFn` + `serverMapFrom`,
`2.eslint-rules.md` (drop the pure-functions rule section), `3.vite-config.md` (drop
`serverPureFunctions`, add `serverMappers` + `failOnError`), `6.platforms/5.cloudflare.md`
(drop the aotCaches workflow), quick-start `aotCaches: true` snippets, and
`4.run-types/2.type-formats.md` (brand table references removed names — pending the R20
Brand decision in [engine-consumer-verification.md](engine-consumer-verification.md)).

**Migration-notes material to fold into the docs** (statements accepted by design in the
review): the R5 error typing story (`message`/`name` optional — use `instanceof`/narrowing),
the R6/R10–R14 old→new API mapping tables, R15 lockstep-upgrade requirement (binary bodies,
routesFlow mappings, methods-metadata are NOT cross-version compatible; plain JSON routes
are), R16 validation-token vocabulary (`objectLiteral` etc.), R23 `createCloneExactShape`
mapping, R24 binary middleFn warn-and-skip, R26 import side effects, R27 managed-server
contract (`MION_TEST_SERVER_AUTO_START` + port polling), R28 SSR `noExternal` + Vue SFC
support no longer auto-injected (users add `ssr.noExternal: [/@mionjs\//]` themselves;
decide whether to re-add in the wrapper), R29 `failOnError: true` default + opt-outs, and
the R36 operational notes (test batching/resolver memory, new toolchain surface).

**CI enforcement:** add an examples typecheck lane (vitest project or `tsc --noEmit` script
wired into lint) so the "should compile" promise stops drifting silently.

## What shipped (PR #125)

- Examples ported off every removed factory to the sync API; obsolete AOT/pure-fn examples deleted;
  website refreshed off the deepkit/AOT surface (AOT page deleted; pure-functions/vite-config/
  cloudflare/type-formats pages rewritten; all `code-import` paths re-pointed).
- **`codegen/vite-client-ipc.config.ts` was NOT deleted — it was renamed to `vite-client.config.ts`.**
  Its old IPC/AOT-metadata rationale is gone, but the file was already rewritten to the current
  `server: {runMode: 'childProcess'}` managed server (spawn + TCP port-poll → `serverReady`), which is
  a live plugin feature for client e2e/dev (NOT metadata — that comes from router types). The "ipc"
  name and framing were corrected and the website vite-config page now scopes it as optional/e2e.
- A `check-types` script + `tsconfig.check.json` were added, but a fully-green typecheck GATE is NOT
  wired: the examples carry substantial pre-existing, non-migration debt (placeholder-import doc
  snippets, friendly-errors format-param rework, source-package strict-check issues). That debt +
  the remaining CI-enforcement item are tracked in [examples-precompile-debt.md](examples-precompile-debt.md).

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
