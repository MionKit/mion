# Examples pre-compile debt — path to a green `check-types` CI gate

**Status:** todo — split out of [examples-and-website-refresh.md](examples-and-website-refresh.md)
while wiring the examples typecheck lane.
**Created:** 2026-07-21

## Context

The migration-drift in `packages/examples/src` (removed factories/options) was fixed and the
self-contained examples now compile. A `check-types` script + `tsconfig.check.json` (source-resolution,
no build needed) was added, but it is NOT yet a blocking CI gate: typechecking the examples against
SOURCE also re-typechecks the imported `@mionjs/*` source under one config, and a set of example files
are intentionally-incomplete doc snippets. This spec inventories what remains before the gate can go green.

## Blockers

### 1. Pre-existing "doc snippet" examples (placeholder imports / incomplete context)

These were never standalone-compilable; they exist to be sliced by the website `code-import` component.
They import bogus modules (`Logger`, `MyAuth`, `MyModels`) or reference context props that the shared
app type doesn't declare (`cloudLogs`, `db`), or names defined only in a doc snippet (`Pet`, `myApp`,
`Data`, `RpcError`):

- `client/server.routes.ts`, `client/server-record.routes.ts`, `client/workflow-mapFrom.ts`
- `router/don-not-store-context.ts`, `router/get-user-request.routes.ts`,
  `router/middleFns-header-definition.routes.ts`, `router/sharing-data.ts`,
  `router/extending-routes-and-middleFns.routes.ts`, `router/middleFns-definition.routes.ts`,
  `router/error-handling.routes.ts`, `router/routes-definition.routes.ts`,
  `router/using-context.routes.ts`, `router/overview-runtypes-example.ts`
- `introduction/serve-{node,bun,aws-lambda,google-cf}.ts` — side-effect `import './myApi.routes'`
  is missing the `.ts` extension (NodeNext + allowImportingTsExtensions).
- `_homepage/home-client.ts` (string passed where number expected), `client/cancellation-timeout.ts`
  (unreachable comparison) — genuine small bugs.

Fix: give each a self-contained, compiling form (define the referenced types/app inline or import the
shared `router/full-example.app.ts`), and add the `.ts` extension to the serve-* side-effect imports.

### 2. friendly-errors examples — format-param field rework (migration drift)

`client/friendly-errors-map.ts` / `friendly-errors-others.ts` / `friendly-errors-advanced-client.ts`
access format-param fields (`date`, `time`, `splitChar`, `localPart`, `domain`) on `StringErrorParams`.
Under the migrated engine those live on the SPECIFIC param types (DateTime carries `format`/`splitChar`;
email sub-errors report via `pattern`/`minLength`/…), and the fields resolve only when the SERVER type
(`friendly-errors-server.ts`) declares the specific formats (`FormatStringDateTime`, `FormatEmail`).
Fix: align `friendly-errors-server.ts`'s type with the specific formats and update the handlers to the
current param field names (cross-check `packages/type-formats/**/*.runtype.spec.ts`).

### 3. External-dep comparison + deliberate-error demos (keep excluded)

`run-types/comparison-typia.ts` imports `hono`/`typia`/`@hono/typia-validator` (not workspace deps);
`twoslash-test/basic-example.ts` contains DELIBERATE type errors for a twoslash rendering test. These
stay excluded in `tsconfig.check.json` (add the external deps as examples devDeps only if the comparison
must compile).

### 4. Source-package strict issues surfaced by source-resolution

Typechecking examples against `@mionjs/*` SOURCE (rather than built `.d.ts`) re-checks those packages
under the examples config and surfaces latent issues the packages' own builds don't (looser per-package
configs): `type-formats/constants.ts` (isolatedModules `export type`), `router/lib/reflection.ts`
(`rtFns` on `AnyHandlerDef` under this config), `platform-{bun,cloudflare,vercel}` (`Bun` namespace /
`Uint8Array` → `BodyInit`), `drizze/src/mappers/base.mapper.ts` (`FormatName`).

## Recommended CI-gating shape

Prefer a **build-then-check** lane over source-resolution for the gate: `pnpm -r build` the workspace,
then `tsc --noEmit -p packages/examples/tsconfig.json` (project references → consumes built `.d.ts`,
`skipLibCheck` hides source internals). That checks examples exactly as a published-package consumer
would and sidesteps blocker #4 entirely. Keep `tsconfig.check.json` as the fast no-build dev aid. Enable
the gate once #1 and #2 are cleared.
