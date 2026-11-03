---
type: feature
spec: guidelines
status: ready
created: 2026-11-03
---

# Read batch route ids from the route call's type

## Intent

The build reads each `batch([...])` item's route id by walking the code back to `initClient()`
(`ts-go-runtypes/internal/compiler/requestbatch/routes.go`: `resolveRouteRef`, `accessChain`, `resolveRootPath`,
`initializerPath`, `bindingElementPath`). Any client the walk cannot follow fails: Vue `inject()`, composables,
Nuxt `useNuxtApp()`, a helper function that returns a route call.

The client type already names the id. `ClientRoutes` (`packages/rpc-client/src/types.ts`) builds it as a template
literal while it walks the API type, the same path the runtime proxy builds from property names:

    routes.users.getById(1)   // type: RouteSubRequest<H, 'users/getById', Api>

Reading the id from that type argument makes any typed client work, wherever it comes from.

Accepted trade-off (maintainer): a cast that lies about the type is trusted. The server still only runs batches
its build compiled, so a lying cast breaks only that call.

## Direction

The implementer investigates and plans before building. Open questions, none solved today:

1. **Type cost first.** Measure what the template-literal ids in `ClientRoutes` cost on a large API (instantiations,
   check time; `packages/private-type-budget` is the existing budget harness), and what reading type arguments
   costs the Go resolver. Report the numbers before choosing the design.
2. **Reading the id.** Item type → `RouteSubRequest` declared in `@mionjs/client` → its `Id` type argument.
   A single string literal is the id. Anything else (`string`, `any`, a lost literal) cannot be read.
3. **Ternaries and other unions.** An item typed `RouteSubRequest<A,'a'> | RouteSubRequest<B,'b'>` may run either
   route. Maintainer direction: one batch per combination. Open: how several ids reach `batch()` (the
   `InjectBatchId` marker is `string & {brand}`, `packages/run-types/src/markers.ts`), how the client picks one at
   runtime (`packages/rpc-client/src/batch.ts`), a cap on combinations, the server table
   (`internal/compiler/resolver/rpcgen.go`), the report and id-collision check (`requestbatch/report.go`), the
   `BatchSite` wire shape (`packages/devtools/src/core/protocol.ts`).
4. **Wrapper and helper functions.** A helper whose return type is inferred keeps the literal and becomes readable;
   one annotated `RouteSubRequest<any>` loses it. Open: `inputFrom` mappings passed through a helper's arguments,
   and telling a route call from a helper call.
5. **`inputFrom` mappings.** Source and target identity without the code walk (`requestbatch/mappings.go`), and
   whether a union item may be a source or a target.
6. **Error level.** Maintainer direction: an item whose route cannot be read from its type is a RuntimeError
   (lowerable), not an Error; once lowered the build passes and the call throws `batch-missing-id`. Reconcile with
   `ts-go-runtypes/internal/diagnostics/AGENTS.md`, which lists "no batch id" under LevelError.
7. **Remove the walk.** Once the type path replaces it, the code walk and its reasons go, with no trace.
8. **Test fixtures.** The Go and JS fixtures declare `RouteSubRequest<PH>` without the `Id` parameter
   (`requestbatch/batches_test.go`, `packages/devtools/test/batch-diagnostics.test.ts`, `batch-report.test.ts`):
   make them mirror the real client types.

## Docs

`container/website/content/01.rpc/04.client/03.batch.md`, existing section "Writing a Batch the Build Can Read"
(what the build reads now, what still fails) and "Unknown or Missing Batch Ids" (the new error level).

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- The type-cost numbers are recorded in this spec before the design is picked.
- A batch item from any typed client (`inject()`, a composable, `useNuxtApp()`, an inferred helper) compiles,
  pinned by Go and JS tests.
- Unions, helpers and mappings each have a decided, tested behaviour.
- The code walk is gone.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.
