---
type: feature
spec: guidelines
status: ready
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
- Levels by the two-questions rule in `ts-go-runtypes/CLAUDE.md`.
- The implementer plans the details.

## Docs
`01.rpc/03.client/05.bundled-api.md`: section "Choosing a Mode" and its table become two modes; "Typing Call Helpers" loses the `mixed` wording. `01.rpc/03.client/02.metadata-cache.md`: section "Setting Up Metadata Fetching", the tip listing what the build checks. `01.rpc/06.devtools/02.vite.md`, `03.nextjs.md` (its example uses `'mixed'`) and `04.cli.md`: the option values.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when
- `bundleApi` has two modes, bundled (default) and off, and nothing names `mixed`.
- Every row of the table is enforced, with Go tests per row; a `bundleApi: false` build stops on a wrong fetching setup.
- `pnpm test`, `go -C ts-go-runtypes test ./internal/... ./cmd/...` and `pnpm run lint` pass.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file, each committed on its own.
