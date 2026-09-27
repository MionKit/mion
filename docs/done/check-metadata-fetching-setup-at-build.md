---
type: feature
spec: guidelines
status: done
created: 2026-09-27
---

# Two Bundle Modes and a Build Check for Metadata Fetching

## Intent
A client either bundles the API (the default) or fetches its metadata. `bundleApi: 'mixed'` goes away: at runtime it already behaves like `bundled`, and a bundled client that calls `useMethodsMetadata` already fetches a route the build could not see. What `mixed` still adds is only a softer diagnostic, and that follows from whether the client set up fetching.

The build then checks the fetching setup in both modes. Today nothing checks it with `bundleApi: false`: a wrong setup only shows up as `route-metadata-not-found` on the first call at runtime.

| Client build | API has the metadata middleware | API does not |
| --- | --- | --- |
| bundled, no `useMethodsMetadata` | No check; a route the build cannot see is an error (MET003) | Same |
| bundled, with `useMethodsMetadata` | A route the build cannot see is a warning and is fetched (MET004); with no such route, warn that the fetch code is never used | Error: nothing to fetch from |
| `false`, with `useMethodsMetadata` | Fine | Error |
| `false`, no `useMethodsMetadata` | Error | Error |

A server with the middleware next to a bundled client is normal (one server serves several clients) and is never reported.

## Direction
- Remove `'mixed'` wherever the mode is named: the devtools option type and validation (`packages/devtools/src/options.ts`, `src/core/unplugin.ts`, `src/core/resolver-client.ts`), the Go mode (`ts-go-runtypes/internal/constants/constants.go` `BundleApiMixed`, `cmd/mion/main.go`, `cmd/mion/config.go`), the client's `setBundleApiMode` / `BundleApiMode` (`packages/rpc-client/src/lib/bundleApiMode.ts`), the `client-mixed` vitest project and its specs under `packages/rpc-client/test/mixed/` (move what they still prove into the bundled lane; `scripts/core/test-batches.mjs` lists the project), and the examples. Consider whether `bundleApi` becomes a boolean.
- MET003 vs MET004 today switch on the mode in `internal/compiler/apimeta/apimeta.go` (~237); they switch on whether the client sets up `useMethodsMetadata` instead. MET009 / MET010 in `internal/compiler/resolver/apigen.go` (`resolveApiBundle`, `unsetMiddlewareDiags`) follow the table.
- With bundling off the lane does not run today: `apiLaneOn()` in `apigen.go` gates `collectProgramApiSites`. The build still needs to read the API type named at `initClient<Api>` and the client's `middlewares.<name>` reads, without writing a bundle. Keep the cost off builds that never call `initClient`.
- The metadata middleware is recognised by `routerDeclares` in `internal/compiler/apimeta/tree.go`; the reads by `internal/compiler/apimeta/clientreads.go`.
- The lint lane passes `bundleApi: 'off'` today so it reports none of these; decide whether that stays.
- Levels by the two-questions rule in `ts-go-runtypes/CLAUDE.md`. Report at the call sites that fetch, not once per API tree: today MET010 (`apigen.go` ~422) stops a `mixed` build even when no call fetches, which runs exactly like a bundled one.
- Tests the current code lacks: MET010 reported once per tree (the subtest has one call site), `bundleApiKey` refusing a number or object (`cmd/mion/config.go` ~558), and whatever the lint lane decides, pinned by a test on `buildResolverArgs` (`packages/devtools/src/lint/lint-worker.ts` ~69).
- Write the mode union once and derive the rest: `unplugin.ts` ~84 and `resolver-client.ts` ~90 spell it by hand, and `packages/rpc-client/test/bundleSplit.spec.ts` ~34 and `packages/devtools/test/vite/bundledApiBuild.spec.ts` ~117 restate `MionBundleApiMode`. The six-line value check in `packages/devtools/src/options.ts` ~150 becomes one line.
- The implementer plans the details.

## Docs
`01.rpc/03.client/05.bundled-api.md`: section "Choosing a Mode" and its table become two modes; "Typing Call Helpers" loses the `mixed` wording. `01.rpc/03.client/02.metadata-cache.md`: section "Setting Up Metadata Fetching", the tip listing what the build checks. `01.rpc/06.devtools/02.vite.md`, `03.nextjs.md` (its example uses `'mixed'`) and `04.cli.md`: the option values.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when
- `bundleApi` has two modes, bundled (default) and off, and nothing names `mixed`.
- Every row of the table is enforced, with Go tests per row; a `bundleApi: false` build stops on a wrong fetching setup.
- `pnpm test`, `go -C ts-go-runtypes test ./internal/... ./cmd/...` and `pnpm run lint` pass.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file, each committed on its own.

## Plan: two modes and the fetching check (approved 2026-09-27)

### Context
Spec `docs/todos/check-metadata-fetching-setup-at-build.md` (feature, guidelines). `bundleApi: 'mixed'` already runs like `bundled` at runtime; its only extra is a softer diagnostic. And with `bundleApi: false` nothing checks the fetching setup, so a wrong setup only shows at runtime as `route-metadata-not-found`. Goal: two modes, and the build enforces the spec's table in both.

User decisions: `bundleApi` becomes a **boolean** (default `true`); **no** "fetch code never used" warning (a bundled client's `useMethodsMetadata` still serves version-mismatch recovery and `client.execute`).

### 1. Remove `mixed`, make the option boolean
- **devtools**: `packages/devtools/src/core/unplugin.ts` `bundleApi?: boolean` (true -> CLI `bundled`, false -> `off`). `src/options.ts`: `MionBundleApiMode` goes; the six-line check becomes one `typeof !== 'boolean'` line. `resolver-client.ts` keeps the CLI spelling `'bundled' | 'off'` written once as an exported type (`ResolverBundleApi`) and reused. Test files that restate the union (`rpc-client/test/bundleSplit.spec.ts`, `devtools/test/vite/bundledApiBuild.spec.ts`) import/derive it.
- **Go**: drop `BundleApiMixed` (`internal/constants/constants.go`); CLI `--bundle-api bundled|off` (`cmd/mion/main.go`); tsconfig key `bundleApi` accepts `true | false` only (`cmd/mion/config.go` `bundleApiKey`; a string, number or object is refused with a clear message).
- **Runtime client**: `setBundleApiMode(mode)` -> `setApiBundled()` (no arg, generated `api/lane.js` calls it); `client.bundleApiMode` -> `client.isApiBundled: boolean`; drop `BundleApiMode` type and the `bundle-api-invalid-mode` error. Manifest `Mode` keeps writing `"bundled"`.
- **Tests lane**: delete `vitest.mixed.config.ts`, `tsconfig.mixed.json`, the `client-mixed` entry in root `vitest.config.ts` and `scripts/core/test-batches.mjs`. Move what `test/mixed/` still proves into `test/bundled/`: the wide-helper fetch + store tests of `mixed.spec.ts` into `bundled.spec.ts`, `routeDrift.spec.ts` moved as-is; `mixed/apiVersion.spec.ts` is a subset of `bundled/apiVersion.spec.ts` and goes.
- Examples: `private-examples/src/codegen/*` (`'mixed'` -> `true`, `'bundled'` -> `true`/omitted). mion-next e2e `MION_E2E_BUNDLE_API` value mapping checked.

### 2. The build check (Go)
Two new program-wide facts, memoised per Program next to `apiFileCache` (`resolver.go`, reset where it is):
- **fetching set up** = the program calls `useMethodsMetadata(...)` declared by `@mionjs/client` (new detector in `apimeta/`, twin of `callsInitClient` in `clientinit.go`, text pre-filtered, keeps the first call's site).
- **client APIs** = the API type named at each `initClient<Api>` call (read off its InjectBuildVersion marker param, as `apiVersionSiteOf` does), walked with `WalkApi` (peer tree under `apiTsconfig`, like today's MET010). Unreadable -> skipped (MET001 stays the bundle's job). Only runs when the program calls `initClient`, so server-only builds pay nothing.

Rules (one function, called on generate in both modes; the widened part also on scan):
| Build | API has middleware | API has none |
| --- | --- | --- |
| bundled, not fetching | widened call -> MET003 | same |
| bundled, fetching | widened call -> MET004 (warning) | widened call -> MET010; no widened call -> MET010 at the `useMethodsMetadata` call |
| off, fetching | fine | MET010 at `initClient`, once per API |
| off, not fetching | new MET011 at `initClient`, once per API | MET010 at `initClient` |

- MET003/MET004 stop switching on mode: the extractor (`apimeta.go` ~237) returns a widened call as a `Site{Widened: true}` carrying its API type and no diag; the session picks MET003/MET004/MET010 per site (fetching is a program fact, so it cannot sit in the per-file cache). Widened sites are filtered before `Replacements` and `resolveApiBundle`.
- Today's once-per-tree MET010 in `resolveApiBundle` (~422) goes: bundled reports only at calls that fetch.
- `unsetMiddlewareDiags`: always skip mion's metadata middleware; the new check owns it.
- Levels (two-questions rule): MET010 and MET011 are `LevelRuntimeError` (code is built, every fetch fails). MET004 stays a warning. Messages rewritten without `mixed`; `ts-go-runtypes/CLAUDE.md` bullet about `mixed` updated.
- **Lint lane stays `bundleApi: 'off'`**: lint scans one file, and these checks are program-wide on generate, which lint never runs. Pinned by a test on `buildResolverArgs`.

### 3. Tests
- Go (`internal/compiler/resolver/apigen_test.go`, `apimeta_test.go`, `cmd/mion/config_test.go`): one subtest per table row (bundled x fetching x middleware, off x fetching x middleware), MET010/MET011 once per API with two `initClient` calls, off-mode build with no `initClient` runs no walk, `bundleApiKey` refusing a string / number / object and accepting `true` / `false`, MET010 at a fetching call only.
- JS: bundled lane gains the moved mixed specs; `mion-presets.test.ts` boolean mapping + refusal; lint `buildResolverArgs` test; `bundledApiBuild.spec.ts` / `compile-cli-mion.test.ts` lane.js text `setApiBundled()`.
- Any existing off-mode test program that inits a client against an API without the metadata middleware on purpose gets `// @mion-expect-error MET010` (found by running the suite).
- Not a fuzz candidate: diagnostic selection logic has no cheap oracle.

### 4. Docs
- `01.rpc/03.client/05.bundled-api.md`: "Choosing a Mode" table -> two rows; "Typing Call Helpers" loses `mixed` (the fix becomes "set up `useMethodsMetadata`").
- `01.rpc/03.client/02.metadata-cache.md` "Setting Up Metadata Fetching": the tip lists what the build now checks.
- `01.rpc/06.devtools/02.vite.md`, `03.nextjs.md`, `04.cli.md`: option values (`true`/`false`, `--bundle-api bundled|off`).

### 5. Finish
Rebuild `mion-bin/mion` + devtools dist; `go -C ts-go-runtypes test ./internal/... ./cmd/...`; `pnpm test` (or `test:ci`); `pnpm run lint`, `pnpm run format`. Backfill nothing (header exists); append this plan to the todo, reconcile, `git mv` to `docs/done/`. Then the `docs-simplifier` and `comments-simplifier` subagents in parallel, each committed on its own. Push to `claude/sharp-knuth-7ovdaa`.

### Done when (from the spec)
- `bundleApi` has two modes (boolean, default on) and nothing names `mixed`.
- Every table row enforced with a Go test per row; a `bundleApi: false` build stops on a wrong fetching setup.
- `pnpm test`, Go tests and `pnpm run lint` pass.
- Both simplification passes ran and are committed on their own.

## What shipped

- `bundleApi` is a boolean (default `true`) in the Vite and Next options and the tsconfig key; the CLI keeps `--bundle-api bundled|off`. A string or any non-boolean value is refused. The runtime flag is `setApiBundled()` / `client.isApiBundled`.
- The table's "warn that the fetch code is never used" cell was dropped on purpose: a bundled client's `useMethodsMetadata` still serves the version-mismatch recovery and `client.execute`, so the warning would fire on correct code.
- A widened call (`RouteSubRequest<any>`) erases the API type too, so its API is read from the `initClient<Api>` calls instead: MET010 only when none of them places the metadata middleware.
- Bundled, fetching set up, no widened call, and no client API serving metadata: MET010 once, at the `useMethodsMetadata` call.
- New MET011 for a `bundleApi: false` client that never calls `useMethodsMetadata`, reported once per API at its first `initClient`.
- Two related fixes landed in their own commits: a diagnostic now starts at the node's first token (a call opening its line was reported on the line above, out of a directive's reach), and the `initClient` and middleware-read caches are dropped with the Program (an edit in watch mode kept stale MET008 / MET009 results).
- The lint lane stays on `bundleApi: 'off'`: lint scans one file, and these checks read the whole program on generate. Its options moved to `session-protocol.ts` so a test pins them.
