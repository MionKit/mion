# Progress log

## 2026-07-11 — initial spike (session 1)

### Landed

1. **Vendored `@ts-runtypes/*` tarballs** under [vendor/ts-runtypes/](../vendor/ts-runtypes/) built from ts-run-types `main` (`eb7b618` + two fixes below). npm's 0.9.0 predates `getRTFunction` + the multi-slot marker work, so `file:` refs are used until the next publish (see README).
2. **pnpm policy**: `minimumReleaseAgeExclude: [unplugin, '@ts-runtypes/*']` (unplugin@3.3.0 is 12 days old; the scope entry is for the registry switch later).
3. **`@mionjs/run-types` → proxy**: legacy deepkit runtime type system deleted (JIT compilers, nodes, mocking, microbenchs); new surface = `export * from '@ts-runtypes/core'` + [mionAdapter](../packages/run-types/src/mionAdapter.ts) (`getReflectionFromMarkers`, `buildJitFnsFromMarker`, paramNames/hasReturnData/isAsync derivation). Deps: `@deepkit/*` out, `@ts-runtypes/core` in.
4. **Router adapted (minimal)**: factory markers in [lib/handlers.ts](../packages/router/src/lib/handlers.ts) (`'val','verr','pj','rj','sj'` per side + two `InjectRunTypeId`), `rtFns` payload on defs, [lib/reflection.ts](../packages/router/src/lib/reflection.ts) rewritten to consume markers. dispatch/serializer code untouched.
5. **`@mionjs/devtools`**: `mionVitePlugin` is now a wrapper over `@ts-runtypes/devtools/vite` accepting the legacy option shape — **all ~20 existing vite/vitest configs work unmodified**. deepkit/AOT/pure-fn modules deleted; `@deepkit/type-compiler` dep removed; eslint plugin + `cjsPackageJsonPlugin` kept; `serverReady` kept as resolved-promise compat.
6. **Root tsconfig**: `customConditions: ["source"]` (tsgo resolves `@mionjs/*` to sources like vitest does).
7. **Tests**:
   - [router migration.spec.ts](../packages/router/src/migration.spec.ts): **8/8 green** — register+reflection data, dispatch+validate+respond, Date revival both directions, invalid params → validation-error, arity check, async handler, void route, middleFn chain.
   - [run-types mionAdapter.spec.ts](../packages/run-types/src/mionAdapter.spec.ts): **6/6 green**.
   - Full router project: **78 pass / 137 fail** — every failure in an expected deferred/legacy bucket (below).

### Issues found & fixed along the way

| # | Issue | Resolution |
| --- | --- | --- |
| 1 | npm `@ts-runtypes/*@0.9.0` predates `getRTFunction`/multi-slot markers | vendor tarballs from ts-run-types main; publish checklist in README |
| 2 | `ERR_PNPM_MISSING_TIME` on install | known pnpm metadata-cache issue; cleared `~/.cache/pnpm/metadata*` |
| 3 | **Marker type aliases are not recognized** by the scanner (`type SideFns<T> = InjectTypeFnArgs<T,...>` never injects) | verified empirically; mion factories spell markers out verbatim. Re-export barrels ARE fine (`@mionjs/run-types` re-exports work) — known upstream design note |
| 4 | Single-key marker injects the entry tuple **bare**, multi-key injects an array | adapter/factories use ≥2 keys per marker (array shape); documented in 01 |
| 5 | **Plugin crash on foreign `registerPureFnFactory`**: mion core's own function shares the name of a ts-runtypes API probed by the plugin's textual fallback; the resolver hard-failed (`source file not in program`) on a file outside its program | fixed upstream (ts-run-types `unplugin.ts`): textual-fallback false positives skip instead of crashing (+ regression test). Site-set files still fail loud |
| 6 | pnpm does NOT refresh re-packed `file:` tarballs (same name → stale content served from store, even with `--force`) | tarballs get a `-local.N` suffix bumped on every repack |
| 7 | **`@ts-runtypes/core` published without `src/` while its exports declare a `source` condition** → unresolvable under mion's `resolve.conditions: ['source']` | fixed upstream: `src` added to the package `files` |
| 8 | **tsconfig project `references` silently kill the scan**: references redirect `@mionjs/*` to never-built `.dist` declaration outputs → resolver finds **0 marker sites program-wide**, no diagnostics | **FIXED UPSTREAM** (ts-run-types PR #216): the resolver now drops project references when building its scan program (they're a `tsc --build` concept bundlers never honor) + Go & JS regression tests; spec moved to ts-run-types `docs/done/`. mion's interim twin-tsconfig shim was removed — the plugin takes the real tsconfigs |
| 9 | vitest error traces show `src/…` paths for dist-running packages (source maps) — cosmetic, but confusing while debugging | noted here so nobody chases ghosts |
| 10 | `stringifyBody` line 175 in serializer.routes.ts: `if (prepareForJson.isNoop) JSON.stringify(returnValue);` discards its result (pre-existing oddity, unrelated to migration) | left as-is; flagged for maintainer |

### Remaining failure buckets (full router suite) — all expected

- **binary serializer** (48): `tb`/`fb` fn keys not wired yet (`ensureBinaryJitFns` throws a clear message). Next session: add `'tb','fb'` to the factory markers behind the serializer option, or a second marker.
- **headersFn** (~54 incl. specs registering an `auth` headers middleFn): header-name extraction from `HeadersSubset<Required, Optional>` type args needs a design (runtype graph exposes class type args? TBD). `getHandlerReflection` throws a clear not-supported error.
- **legacy AOT-era specs** (36): `reflection-aot`, `reflection-optimization`, `aotEmitter`, `aotCacheLoader` test deleted machinery (raw def objects without factories, jit hash caches). Delete or rewrite.
- **strictTypes / ValidateOptions** (2): compile-time options need `CompTimeFnArgs` plumbing through the factories (call-site literal constraint!) — router options like `strictTypes` can no longer be per-router runtime config; they become per-call-site literals. Needs an API decision.
- **typeErrors payload shape** (few): new `RTValidationError` path segments are `(string|number)[]` (e.g. `[0,'name']`); old expectations embedded the deepkit-era format. Reconcile when rewriting specs.
- `handlers.spec` def-shape equality (5): defs now carry `rtFns` — trivial spec updates.

### Follow-ups queued (next sessions)

1. Wire binary (`tb`/`fb`) + decide strictTypes/options story (`CompTimeFnArgs`).
2. headersFn support.
3. Delete core's now-unused `jit/`, `pureFns/`, `aot/` dirs (+ `routerUtils`/`routesCache` audit) — "maybe full core is not required anymore".
4. Client package migration (compiled client consumed jit caches; ts-runtypes `emitMode: 'code'` should map well).
5. type-formats → `@ts-runtypes/core/formats`.
6. routesFlow pure-fn mappings → ts-runtypes `PureFunction` marker.
7. Rewrite/delete legacy specs; update `handlers.spec` expectations.
8. Website/docs refresh (mion-build-aot removal, new plugin options).

## 2026-07-11 — session 1 addendum 2 (pure fns + core cleanup)

Per maintainer direction: audited core feature-by-feature vs ts-runtypes
([05-core-audit.md](05-core-audit.md)) and removed everything that existed only to support the
old run-types:

- **core**: deleted `src/pureFns/` (registerPureFnFactory — the name that collided with the
  ts-runtypes probe — pureServerFn, quickHash, restoreJitFns), `src/aot/` (+ `./aot-caches`,
  `./server-pure-fns` subpath exports), the jit/pure caches (jitUtils.ts is now a slim compat
  stub: class registries functional, jit/pure lookups inert), `initPureFunction`.
- **router**: deleted `src/aot/`, `lib/aotEmitter.ts`, `lib/methodsCache.ts` and the AOT-era
  specs (reflection-aot, reflection-optimization, aotEmitter, aotCacheLoader); pruned
  router.ts persisted-method/AOT-cache paths and the `aot` RouterOptions flag.
- **pure functions** now live in the ts-runtypes registry under the **`mionjs` namespace**:
  `registerMionPureFn` / `getMionPureFn` / `hasMionPureFn` / `mionPureFnId` in
  `@mionjs/run-types` (src/mionPureFns.ts); routesFlow mapping validation/execution rewired to
  it (`RoutesFlowMapping.bodyHash` = fn name under `mionjs::`).
- **Upstream gap found + filed** (ts-run-types `docs/todos/purefn-extraction-skips-reexports-and-wrappers.md`):
  pure-fn build extraction only happens for DIRECT `@ts-runtypes/core` imports with literal
  ids — re-export barrels and branded wrappers silently fall back to runtime registration
  (works, but no bodyHash/purity checks/client code). mion helpers documented as runtime-lane.
- Tests: core 56/56, run-types 9/9 (incl. direct-literal extraction with real bodyHash),
  router migration 8/8 + routesFlow 19/19; full router suite failures reduced to the known
  deferred buckets (binary, headersFn, handlers def-shape, strictTypes, legacy metadata).

## 2026-07-11 — session 1 addendum (references fix upstreamed)

The project-references issue (#8 above) got a REAL fix in ts-run-types (PR #216, commit
`803aa04`): `program.New` drops tsconfig `references` before building the scan program,
with Go (`references_test.go`) and JS e2e (`references-unbuilt.test.ts`) regressions, and
the todo spec moved to `docs/done/`. mion's `deriveRuntypesTsconfig` workaround was removed
from `mionVitePlugin` in the same change; router migration spec (8/8) and run-types adapter
spec (6/6) re-verified against the original tsconfigs (references intact) + rebuilt binary.
