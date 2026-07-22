# Remove the @mionjs/run-types + @mionjs/type-formats proxy packages

**Status:** done — commits ffeeeb3 (packages) + bd5ebaa (devtools eslint), branch
`claude/mionjs-remove-proxy-packages-8uk9s4`.
**Created:** 2026-07-22

## What & why

The soft migration left `@mionjs/run-types` and `@mionjs/type-formats` as thin proxies over
`@ts-runtypes/*`. The proxy layer caused more friction than it saved, so it was removed: consumers
now import `@ts-runtypes/core` (+ `/formats`) directly.

## What shipped

- **`@mionjs/run-types` deleted.** Its real glue moved into `@mionjs/core/src/runtypes/`:
  - `mionAdapter.ts` (marker→reflection, builds `JitCompiledFunctions`),
  - `mionPureFns.ts` (mion pure-fn registry under the `mionjs` namespace + `serverMapFrom` transport),
  - `mionClassSerializers.ts` (registers `RpcError`/`TypedError` with the ts-runtypes class-serializer registry),
  - `rtResolver.ts` (new leaf: resolves jit/pure fns from the ts-runtypes cache).
  - The `installJitLookupBackend` **R33 indirection was collapsed** — `jit/jitUtils.ts` resolves
    directly via `rtResolver`; no installable backend, no cross-package side-effect contract.
  - The format-registration (`@ts-runtypes/core/formats`) and class-serializer side effects now fire
    from `core/index.ts`.
- **`@mionjs/type-formats` deleted.** All format/mock functionality lives in `@ts-runtypes/core/formats`.
  Consumers adopt the `@ts-runtypes` names (`FormatEmail`→`Email`, `FormatInteger`→`Integer`, …).
  `FormatNames`/`FormatName` relocated into `@mionjs/core` (`src/constants.ts`); the `Brand*` registry
  stays in core.
  - The type-formats package's own specs tested `@ts-runtypes` format/mock behavior itself, so they
    were removed with the package (verified: `@ts-runtypes` `createMockData` generates format-valid
    values — Email/Url/IPv4/UUIDv7/Integer — so those failures were a proxy-harness artifact, not an
    upstream bug and not a mion adaptation gap).
- **Consumers retargeted** (router, client, drizzle, test-server, examples): markers/factories →
  `@ts-runtypes/core`, mion glue → `@mionjs/core`. The `@mionjs/devtools` vite plugin's **injected**
  server-mapper imports repointed to `@mionjs/core`.
- **Workspace wiring cleaned:** package.json deps, tsconfig references, vite externals/aliases, root
  vitest projects, lockfile. Core's vitest/vite configs gained the `mionVitePlugin` (its `src/runtypes/`
  now has marker call sites needing injection).
- **devtools eslint:** removed the obsolete `type-formats-imports` rule + `formatTypeNames` helper +
  spec; repointed the pure-functions rule's source packages to `@mionjs/core`.

## Verification

776 tests pass across all projects; `pnpm run format` + `pnpm run lint` clean (0 errors).

## Follow-ups (tracked)

- `docs/todos/dewrapper-core-ts-runtypes-proxies.md` — remove core's remaining `@ts-runtypes`
  wrappers (`binary/dataView.ts`, the `DataOnly`/`RunTypeError`/DataView type mirrors). The
  `RunTypeError` mirror is folded into the friendly-errors swap.
- `docs/todos/friendlyerrors-to-friendlytext-feasibility.md` — the friendly-errors swap to
  `createFriendlyText` (Phase 8, verdict REPLACEABLE-WITH-CAVEATS).
- `docs/todos/friendlytext-rtdefault-duplicate-messages-upstream.md` — upstream `@ts-runtypes`
  `rt$default` renderer bug found during the feasibility investigation.
- `docs/todos/adopt-ts-runtypes-eslint-plugin.md` — wire `@ts-runtypes/devtools/eslint` + reconcile
  overlapping mion rules.
- Website content refresh (Format-name + removed-rule doc updates) rides
  `docs/partially/examples-and-website-refresh.md`.
