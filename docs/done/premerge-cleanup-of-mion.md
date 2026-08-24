# Pre-merge cleanup of mion (merge master plan, step 1)

**Status:** done
**Created:** 2026-08-23
**Completed:** 2026-08-23

Step 1 of [../todos/merge-ts-runtypes-into-mion-master-plan.md](../todos/merge-ts-runtypes-into-mion-master-plan.md).
Goal: shrink the merge surface and stop dead weight from traveling through the
upcoming unrelated-histories join with ts-run-types.

The default-branch reference updates this spec originally carried did NOT ship — they are
blocked on an owner action that has not happened yet, and are now tracked on their own in
[default-branch-rename-references.md](default-branch-rename-references.md).

## What shipped

### Dead files deleted

- `setup.sh` (npm-workspaces/jest/apt era), `jest.config.js`, `AGENTS.md`,
  `.augment-guidelines.md`, `.augment/`.
- Also found during the sweep and deleted, same lineage, all verified zero-reference:
  `scripts/rename-casing.mjs` (a one-shot `useFn → linkedFn` codemod for a rename that already
  shipped), `screenshots/` (one orphan PNG), `.vscode/launch.json` (both configs were "Debug
  Jest Tests" invoking a jest binary that is not installed), `website/AGENTS.md`,
  `website/test-results/.last-run.json` (committed Playwright artifact; `test-results` added to
  `website/.gitignore`), and `website/.vscode-extension/` (a self-contained side project with
  committed build output and an npm `package-lock.json` inside a pnpm-only monorepo).
- `plans/` was NOT touched (master plan decision 6). `assets/` design sources were NOT touched
  (owner's call).

### test-publish remnants

- `test-publish/pnpm-workspace.yaml`: removed the `@mionjs/run-types` and
  `@mionjs/type-formats` overrides (their tarballs are never produced by
  `scripts/pack-packages.sh`) and the `@deepkit/type-compiler` allowBuilds entry plus its
  comment block.
- `test-publish/pnpm-lock.yaml`: regenerated with a real build + pack + install. The only stale
  content the spec predicted was 2 mirrored override lines (there were zero deepkit entries),
  but the regen also surfaced something a hand-edit would have missed: the lockfile pinned
  `@ts-runtypes/*@0.12.1` while every package depends on `0.12.2`. Both are fixed. The
  `@mionjs/*` `file:` integrity hashes churn on every pack, so per this repo's standing policy
  they were left at their previous values rather than committed as noise.

### Config fixes

- `eslint.config.js`: `packages/test-publish/**` → `test-publish/**` (the real, root-level
  location). Also dropped the ignore entries for `mion-aot-template`, `xyzSpec` and
  `xyz-Template`, none of which exist.
- `packages/examples/eslint.config.js`: dropped a second stale `**/jest.config.js` ignore.
- `.prettierignore`: dropped `_deepkit` (path does not exist), `old-website` (does not exist),
  and the `.augment-*` / `**/AGENTS.md` entries left dead by the deletions above.
- `.vscode/settings.json`: dropped the `files.associations` entries for the deleted
  `.augment-*` / `AGENTS.md` files.
- `.claude/settings.local.json`: the 4 entries hardcoding `/Users/majerez/Projects/mion/...`
  are gone — two became relative, the two one-off `sourceMap` debugging greps were dropped.
- Root `package.json`: removed `main: index.js` (no such file), added `private: true` (the root
  manifest was otherwise publishable by accident), fixed `bugs.url` (pointed at
  `github.com/MionKit/issues`, a repo that does not exist) and a malformed `repository.url`
  (`github.com:MionKit/mion` with a colon).
- `CLAUDE.md`: dropped `@mionjs/run-types` from the caret-range peerDeps line, and added a
  paragraph documenting `plans/` as a loose-ideas folder exempt from the `todos/`/`done/`
  workflow, so it stops being flagged as stale.
- `docs/done/migration-overview.md`: version status corrected to 0.12.2, and the "Open
  follow-ups" section fixed — all three specs it listed as open had already shipped into
  `docs/done/`.

### Unused dependencies and dead scripts

- Root devDependencies removed: `@playwright/mcp`, `ts-node`, `tsconfig-paths` (zero usage
  anywhere — configs, scripts and imports all checked).
- `packages/client`: removed the `jest-environment-jsdom` devDependency (the last jest trace
  inside `packages/`; client runs on vitest with `environment: 'node'`, no spec needs a DOM,
  and nothing referenced the package but the line declaring it) and the `run-test-server`
  script, which pointed at a `packages/client/test/` directory that does not exist. Removing
  the jsdom dependency dropped ~700 lines of transitive tree from `pnpm-lock.yaml`.
- `packages/test-server`: removed the inert `"ts-node": {"esm": true}` tsconfig block and
  corrected the README line describing a ts-node/tsconfig-paths dev flow that no longer exists.

### Dead code inside the published packages

This was the largest find and is not in the original spec. Every symbol below was verified as
definition-only or referenced solely by other symbols in the same dead cluster.

`@mionjs/core`:

- The whole "JIT SRC CODE" section of `src/types/general.types.ts` (`SrcCodeJitCompiledFn`,
  `SrcCodeCompiledPureFunction`, their two cache types and the four `ClientSrcCode*` variants),
  plus `PersistedJitFn`, `PersistedJitFunctionsCache`, `JitFunctionsCache`,
  `SerializableJITFunctions` and `ToCodeFn` — all describing the deleted persisted-cache format.
- The deepkit class-serializer trio `AnyClass` / `SerializableClass` / `DeserializeClassFn`,
  superseded by `registerClassSerializer` from `@ts-runtypes/core`.
- The `MimeTypes` type (live code uses the `MIME_TYPES` const) and a 28-line commented-out
  `PlainObject` test block for a type that has not existed since deepkit.
- `src/types/pureFunctions.types.ts`: `PureFunction` and `PureFunctionFactory`. Nothing imported
  either from `@mionjs/core`; the real consumer imports the differently-shaped upstream
  `PureFunction` brand from `@ts-runtypes/core`. See the superseded note appended to
  [jitutils-dead-residue.md](jitutils-dead-residue.md).
- `src/routerUtils.ts`: `methodOptsCache`, its backing `methodsOptionsCache` global and
  `getMethodOptions` / `setMethodOptions` — never read or written; options ride
  `MethodWithOptions` inside `methodsCache`.
- `src/constants.ts`: `MAX_UNKNOWN_KEYS` (the cap lives upstream in the compiled
  `unknownKeyErrors` fn).
- `src/errors.ts`: `registerErrorDeserializers()`, an empty `@deprecated` function, plus its one
  caller in `packages/client/src/client.ts`. The class-serializer registration it documented is
  a side effect of loading `@mionjs/core`, which the client still does through a value import.

`@mionjs/router`:

- `src/defaultRoutes.ts` deleted entirely — not imported, not exported from `index.ts`, and its
  docblock's claim that the Vite plugin uses it as a `startScript` fallback is false.
- `src/lib/reflection.ts`: `resetRunTypesCache()` (a literally empty function) and
  `resetReflectionCaches()`. Their comment claimed they were "kept so existing specs/utilities
  keep working"; nothing in any package called either.
- `src/constants.ts`: `ROUTE_DEFAULT_PARAMS`, `HEADER_HOOK_DEFAULT_PARAMS` (deepkit-era
  "skip these param names when reflecting" lists), `NOT_FOUND_HOOK_NAME` (old obfuscated-hook
  naming scheme) and `NOT_FOUND_PATH`.
- `IS_TEST_ENV` was checking `JEST_WORKER_ID`, which nothing ever sets — repointed at
  `VITEST_WORKER_ID`, the runner actually in use. Behaviour was already covered by the
  `NODE_ENV === 'test'` half, so this is a faithfulness fix, not a behaviour change.

These are re-exported through each package's `export *`, so this changes the published type
surface. That is acceptable because `@mionjs/*` jumps to a new unified version at the first
joint release (master plan decision 2).

### Orphaned examples and fixtures

- Ten unreferenced files under `packages/examples/src/` (`router/api-spec.routes.ts`,
  `router/get-user-request.routes.ts`, `router/query-mutation-full.routes.ts`,
  `router/invalid-definition-order.routes.ts`, `router/don-not-store-context.ts`,
  `http/node-types.ts`, `gcloud/gcloud-types.ts`, `client/register-client-routes.ts`,
  `client/client-record.ts` and `client/server-record.routes.ts`, the last orphaned by the
  removal of its only importer). None was imported, pulled in by a `<code-import>`, or
  referenced in `docs/`; they only cost `check-types-examples` time.
- `packages/router/examples/` removed entirely (`eslint-rule-test.routes.ts` and its `models.ts`)
  — a stale near-duplicate of the copy in `packages/examples/src/introduction/`, which is the one
  the website actually renders. The now-dead `examples/eslint-rule-test.routes.ts` exclude in
  `packages/router/tsconfig.json` and the matching `--ignore-pattern` in the root
  `lint-pre-committ` script went with it.

## Defects found and fixed along the way

Both predate this change and were confirmed by bisecting to the pre-change commit.

1. **The publish gate was red on master.** Four tests in `test-publish` failed because the
   specs still destructured the client's old 4-tuple call result. The contract is a 5-tuple,
   `[routeResult, routeError, fatal, middleFnResults, middleFnErrors]`, so `middleFnResults` was
   binding to the `fatal` slot and reading `undefined`. The monorepo's own client specs were
   updated when the contract changed; `test-publish` is excluded from the workspace and only runs
   via the publish gate, so it rotted unnoticed. Verified against a live probe of the returned
   tuple rather than by inference. A missing prefilled middleFn also fails request-scoped, so
   that assertion moved to the `fatal` slot too.
2. **A second failure hidden behind the first.** `verify` is `test && build && test:build-output`,
   so `test:build-output` never ran while the above was failing. Its serverMapFrom assertion
   looked for `registerServerMappers` in the bundle, but the generator only emits that call for
   mappers with no module; every mapper in the fixture resolves to a generated pure-fn module and
   registers through `registerServerMapperTuple`, so rollup tree-shook the unused import. The
   transport itself was fine (the mapper body and no `virtual:` residue were both verified in the
   artifact) — only the assertion named the wrong lane.
3. **A latent type error in `packages/core`.** `errors.spec.ts` called
   `setErrorOptions({autoGenerateErrorId: ...})` with a partial object, but the function replaces
   the whole `CoreRouterOptions`. Nothing in CI typechecks that package, so it never surfaced.
   The spec now passes a complete options object.

## Verification

The full `pull-requests.yml` gate green: `pnpm install --frozen-lockfile`, `check-format`,
`lint`, `check-code-imports`, `check-types-examples`, `test:ci`, `test:bun` — plus
`bash scripts/pre-publish-test.sh` end to end, which exercises the regenerated test-publish
lockfile.

A repo-wide grep for `run-types` returns only deliberate mentions (migration records, the
devtools removed-options guard, spec files and `plans/`), with no config or lockfile entries.

## Not done here

- Every `master` → `main` reference — see
  [default-branch-rename-references.md](default-branch-rename-references.md).
- `@mionjs/run-types` on npm stays live and undeprecated (master plan decision 1: it may become
  the future home of `@ts-runtypes/core`).
- `pages-build` / `copy-benchmarks` — owned by master plan steps 4 and 8, which delete them
  along with the website and benchmark moves.
