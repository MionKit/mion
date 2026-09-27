---
type: feature
spec: guidelines
status: ready
created: 2026-09-27
---

# Check the Metadata Fetching Setup at Build Time

## Intent
A client that fetches route metadata needs two things: `mionMethodsMetadata` in the server's routes and `useMethodsMetadata` on the client. With `bundleApi: 'mixed'` the build already checks both (MET009, MET010). With `bundleApi: false` nothing checks either, and a wrong setup only shows up as `route-metadata-not-found` on the first call at runtime.

The build should catch it for `bundleApi: false` too, and warn a `bundled` client that sets up fetching it will likely never use.

| Client build | API has the metadata middleware | API does not |
| --- | --- | --- |
| `bundled` | No check; warn when the client calls `useMethodsMetadata` (it ships fetch code for routes the build already bundles) | Fine |
| `mixed` | Error when the client never calls `useMethodsMetadata` (MET009, exists) | Error (MET010, exists) |
| `false` | Error when the client never calls `useMethodsMetadata` (new) | Error (new) |

A server with the middleware next to a bundled client is normal (one server serves several clients) and is never reported.

## Direction
- Today the Go apimeta lane runs only when bundling is on: `apiLaneOn()` in `ts-go-runtypes/internal/compiler/resolver/apigen.go` gates `collectProgramApiSites`, and `resolveApiBundle` / `unsetMiddlewareDiags` hold the MET009 / MET010 logic. With bundling off the build still needs to read the API type named at `initClient<Api>` and the client's `middlewares.<name>` reads, without writing any bundle.
- The metadata middleware is recognised by `routerDeclares` in `internal/compiler/apimeta/tree.go`; the reads by `internal/compiler/apimeta/clientreads.go`. How a client "sets up" the middleware is the same read MET009 already uses.
- Keep the cost off builds that never call `initClient`: a pure RunTypes project must not pay for the walk.
- The lint lane passes `bundleApi: 'off'` today so it reports none of these; decide whether that stays.
- Decide the new codes (reuse MET009/MET010 for `false`, or new ones) and the warning's level, using the two-questions rule in `ts-go-runtypes/CLAUDE.md`.
- The implementer plans the details.

## Docs
`01.rpc/03.client/02.metadata-cache.md`: existing section "Setting Up Metadata Fetching", the tip that lists what the build checks. `05.bundled-api.md`: the modes table if a check changes what a mode needs.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when
- A `bundleApi: false` build stops when the API has no metadata middleware, and when the client never calls `useMethodsMetadata`.
- A `bundled` client that calls `useMethodsMetadata` gets a warning.
- Go tests cover every row of the table; `pnpm test`, `go -C ts-go-runtypes test ./internal/... ./cmd/...` and `pnpm run lint` pass.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file, each committed on its own.
