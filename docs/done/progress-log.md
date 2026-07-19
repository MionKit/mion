# Progress log

**Status:** done (completed-migration record)
**Created:** 2026-07-11

## 2026-07-19 — serverMapFrom build-time transport + 0.10.0 (session 5) — ✅ ALL GREEN (1126)

Restored the client-orchestration story on local @ts-runtypes 0.10.0: `serverMapFrom`
takes the mapper INLINE in client flow code again; the mion vite plugin harvests it from
the ts-runtypes pure-fn build report into `.mion/server-mappers.json` and the server
bundle registers it through `virtual:mion/server-mappers` — the wire carries only the
content key (`rt::<hash>`), the server executes only mappers its own build baked in. The
name lane (`serverMapFrom(source, 'name')` + `registerMionPureFn`) stays for non-Vite
clients, with the full `mionjs::<name>` key on the wire now. The run-types pure-fn
helpers moved onto the untracked `*ByKey` APIs / raw cache (no more CTA003/PFN001), so
**`failOnError` defaults to TRUE monorepo-wide**. One upstream fix shipped alongside
(ts-run-types): the anonymous pure-fn extractor's marker positions are now discovered,
not hardcoded to slots 0/1, so leading-param wrappers (the serverMapFrom shape) extract;
overloaded wrappers resolve per call site. Full record:
[servermapfrom-build-time-transport.md](servermapfrom-build-time-transport.md).

## 2026-07-15 — upgrade to @ts-runtypes 0.9.2 (session 3) — ✅ ALL GREEN

ts-runtypes shipped **0.9.2** with the upstream follow-ups this migration filed. mion now
consumes it. **Whole suite green again on 0.9.2** (core, run-types, router, type-formats,
drizze, devtools, all platforms, client). What changed:

### Dependency + config

- Bumped `@ts-runtypes/{core,bin,devtools}` `0.9.1 → 0.9.2` (core in core/run-types/type-formats,
  bin+devtools in devtools). Every version bump re-hashes ALL family fn-hashes (the binary
  version is folded into every typeId + fn-hash), so `JIT_FUNCTION_IDS` was refreshed to the
  0.9.2 prefixes: `val→uSW, verr→c2G, pj→IM8, rj→C8G, sj→xPn, huk→IOY, uke→Wia, tb→gY2, fb→pVn`
  (type-independent, discovered from an injected tuple's key, pinned by the adapter spec —
  which fails loudly on the next bump). The value-level transforms themselves are still
  resolved through the public `getRTFunction<'pj'>/<'rj'>/<'sj'>` in `mionAdapter.ts`; the
  prefixes only address the full cache ENTRY (code/isNoop/deps) for the client-metadata lane.
- `mionVitePlugin` gained two passthroughs to the 0.9.2 plugin: `failOnError` and
  `allowUncheckedPatterns`.
  - **`failOnError` now defaults to FALSE in mion.** ts-runtypes' strict `failOnError: true`
    is a 0.9.2-new default mion never had (0.9.1 only warned). mion's run-types ADAPTER
    deliberately wraps the ts-runtypes pure-fn registry APIs (`registerPureFnFactory`,
    `getPureFn`, `getCompiledPureFn`) with **runtime-computed keys**, so the scanner emits
    benign CTA003/PFN001 for those call sites — and since every consumer scans that adapter
    source, a strict default would halt every build. Diagnostics still surface as warnings +
    through the lint lane. A package can opt back in with `failOnError: true`.
  - **`allowUncheckedPatterns: true` on type-formats.** The example name/city formats use
    unicode `\u…` escapes RE2 can't compile; 0.9.2's FMT004 fails such patterns closed when
    they carry mockSamples. The flag delegates the sample check to the JS lint lane
    (`registerFormatPattern` still validates against the real JS RegExp at module load).

### Upstream fixes now consumed (implemented)

- **Generic class serializers** — ONE `registerClassSerializer(RpcError, …)` now covers every
  instantiation via the class-name lane. `mionClassSerializers.spec` updated: a non-registered
  `RpcError<'other', …>` now rebuilds a real instance (was the old "upstream limitation" tripwire).
- **Tuple labels are id-relevant** — `[s: string]` and `[name: string]` get DISTINCT typeIds
  now (they used to dedupe). `mionAdapter.spec` updated; paramNames still come from handler source.
- **Pattern `message` surfaces as the error val** — format tests updated: a pattern with a
  registered `message` reports it (`'only letters allowed'`, `'invalid social media URL format'`)
  instead of the generic `'Invalid pattern'` (built-in patterns with no message keep the default).
- **mockSample validation (FMT003/FMT004)** — active; handled via `allowUncheckedPatterns` above.
- **Enumerability guard + `@nonEnumerable`** — 0.9.2 guards OPTIONAL global-inherited props
  (Error `stack?`) and `@nonEnumerable`-tagged optional props by runtime enumerability;
  REQUIRED members (Error `name`/`message`) are ALWAYS serialized. See the error-wire note below.
- **JCP001** (compact-strategy unserializable-leaf) fixed upstream; no mion-visible change.

### Examples

- The four prepareForJson/restoreFromJson examples (`serialization-union`, `json-prepare`,
  `json-restore`, `complete-example`) rewritten to the public API (`createJsonEncoder` /
  `createJsonDecoder` / `createValidate` / `createGetValidationErrors` / `createMockData`, all
  synchronous — the removed `createPrepareForJsonFn`/`createRestoreFromJsonFn`/`create*Fn`
  deepkit-era factories are gone). The remaining ~9 deepkit-era example sources stay part of
  the documented examples+website refresh follow-up.

### RpcError/TypedError wire shape — RESOLVED (internal `message`/`name` kept off the wire)

Before this fix, `createJsonEncoder<RpcError<string>>()(err)` emitted `{"publicMessage":…,
"name":"RpcError","message":"<internal>", …}` — the internal `message` and `name` rode the
wire, where native `JSON.stringify(err)` (which mion's classes target by declaring them
**non-enumerable**) drops them. Cause: `name`/`message` are REQUIRED lib-`Error` members, and
@ts-runtypes always serializes REQUIRED members by name regardless of runtime enumerability;
only OPTIONAL global-inherited props get the enumerability guard (this is deliberate so
`DataOnly<T>` stays consistent with what is serialized). This was PRE-EXISTING (0.9.1 kept
name/message in the projection too), not introduced by the bump.

**Fix (maintainer direction):** override `message`/`name` in `TypedError` as **OPTIONAL +
`@nonEnumerable`** so the resolver emits a runtime enumerability guard for them; the
constructor already defines them non-enumerable, so they are skipped when serializing.
`DataOnly<T>` stays consistent (they are optional in the projected shape). Because TS forbids
widening `Error`'s REQUIRED `message`/`name` to optional (TS2416), the base is re-typed once
via `Omit`: `const ErrorBase = Error as unknown as {new (message?: string): Omit<Error,
'message' | 'name'>}` and `TypedError extends ErrorBase` (runtime is still `Error`, so
`instanceof Error` holds; `stack`/`cause` stay inherited-optional and were already guarded).
`RpcError` inherits the optional declarations. Result: the wire is now the public envelope
only — `{publicMessage, mion@isΣrrθr, type, id?, errorData?, statusCode?}` — matching native
`JSON.stringify`, and round-trip + `instanceof` still hold. Pinned by a new test in
`mionClassSerializers.spec.ts` ("keeps the internal `message` and `name` OFF the wire").

**General rule for error subclasses:** to keep a prop off the wire it must be (1) non-enumerable
at runtime, (2) OPTIONAL in the type, and (3) tagged `@nonEnumerable` (unless it is an
already-optional global-inherited prop like `stack?`, which is guarded automatically). A
REQUIRED `@nonEnumerable` prop has no effect and warns (NE001).

## 2026-07-12 — full-suite campaign (session 2) — ✅ ALL GREEN

Goal: every mion test green on ts-runtypes (maintainer directive). **Final state: the whole
monorepo passes — 1122 tests / 63 files across every project (core, run-types, router,
type-formats, drizze, devtools, platform-aws/gcloud/node/vercel/cloudflare, client), plus
lint with zero errors.** Baseline at session start was 510 failing / 457 passing (+9 suites
crashing at import). Test updates preserved the original assertions' intent throughout
(details per area below and in the spec files' comments). Work by area:

1. **Barrel fix**: router/index.ts still exported deleted `methodsCache`/`aotEmitter` —
   crashed every platform + drizze suite at import. Removed (plus the `./aot` package export).
2. **jit-hash lane wired to the ts-runtypes cache**: `JIT_FUNCTION_IDS` now hold the
   ts-runtypes per-family fn-hash prefixes (`val→Qgu, verr→yIk, pj→C6W, rj→MWO, sj→rVH,
   huk→y8Q, uke→kuM, tb→iAm, fb→jtJ`, discovered empirically, pinned by an adapter spec), so
   mion jit hashes `<prefix>_<typeId>` ARE the ts-runtypes cache keys. Core jitUtils gained a
   pluggable lookup backend (`installJitLookupBackend`) that @mionjs/run-types installs:
   `getJIT()` returns real entries (code, deps, isNoop) wrapped as JitCompiledFn — the whole
   client-metadata serialization machinery (serializeMethodDeps/getJitFnHashes) works again
   through its ORIGINAL code paths.
3. **paramNames**: now parsed from the handler source (skip ctx), NOT from runtype tuple
   labels — ts-runtypes dedupes `[s: string]`/`[name: string]` into one canonical node and
   the first-interned label wins (upstream todo filed: tuple-labels-unreliable-on-canonical-nodes).
4. **strictTypes restored**: factory markers request `huk`/`uke`; dispatch rejects unknown
   props when the method's resolved strictTypes option is on (global or per-route).
5. **headersFn migrated**: markers for the HeadersSubset param (val/verr + id); header names
   extracted from the runtype graph (class HeadersSubset → headers prop → prop names, which
   ARE id-relevant, unlike tuple labels); HeadersSubset returns from ANY handler populate
   headersReturn (unions included). headers.spec 25/25.
6. **Binary migrated**: markers request `tb`/`fb` (only attached when real cache entries
   exist — identity fallbacks would corrupt streams); core dataView now PROXIES
   @ts-runtypes/core's serializer (the emitted fns target its varint wire protocol; core
   gained the dep); `ensureBinaryJitFns` verifies presence instead of compiling.
7. **RpcError/TypedError round-trips**: registered with ts-runtypes' class-serializer
   registry (`RpcError<string>` projection). Two upstream gaps filed:
   generic-class-serializers-single-instantiation (other instantiations fall back to
   structural data) and error-subclass-projections-leak-stack (inherited name/message/stack
   ride the wire — mion guards now accept those keys; leak itself unmitigated).
8. **type-formats → proxy over @ts-runtypes/core/formats**: mion names re-exported as
   aliases (FormatString=String, FormatEmail=Email, …); old deepkit-era format compiler
   classes deleted; specs migrated to createValidate/createGetValidationErrors/createMockData
   (same error shapes!). @mionjs/run-types side-effect-imports the formats module — type-only
   alias imports get transpiler-erased, so registration must ride a value import.
9. **Client**: devtools wrapper re-grew managed-server orchestration (vite-node child
   process, buildStart-deferred, serverReady port gate); `addSerializedJitCaches` +
   `resetJitFnCaches` reimplemented over the rt cache (lazy materialization from code
   strings); `serverMapFrom` redesigned to reference SERVER-REGISTERED mion pure fns by
   name (the old implicit build-time body extraction is gone — mappers are shared explicit
   code now, registerMionPureFn on the server; wire contract unchanged: bodyHash carries
   the name).
10. **isAsync semantics**: un-annotated handlers are now correctly inferred (checker sees
    everything); dispatch always awaits, so the flag is metadata-only. router.spec updated.
11. **⚠️ Binary-version pin (the big one)**: the sibling ts-run-types checkout's binary was
    0.9.0 while npm ships 0.9.1 — and the binary version folds into every typeId AND
    per-family fn hash. All local caches silently diverged from CI until cold runs exposed
    it (the adapter pin-guard spec caught it exactly as designed). JIT_FUNCTION_IDS
    re-pinned against the published 0.9.1 binary (val→dzd, verr→nnv, pj→Hrx, rj→hxf,
    sj→wS2, huk→Dtr, uke→dRv, tb→fjF, fb→ocw) and mionVitePlugin no longer falls back to a
    sibling checkout binary (env var TS_RUNTYPES_BIN remains for explicit override).
12. **CI**: tests run in four batches (`pnpm run test:ci`) — each project boots its own
    ~200MB resolver at init and the single all-projects run OOM-killed resolvers on the
    7GB runner. The client batch runs alone (it spawns the managed test server).
13. **Managed test server**: mionVitePlugin's `server` option is back (vite-node child
    process, port-poll readiness, unref'd so vitest can exit); client globalSetup polls
    the port directly (module-instance duality under the `source` condition made the
    serverReady-promise handshake deadlock).
14. **Upstream findings filed in ts-run-types docs/todos this session**: tuple labels
    unreliable on canonical nodes; generic-class serializers cover one instantiation;
    Error-subclass projections leak stack; format-pattern samples dedup + length
    soundness; FMT002 errors don't halt the test lane; unresolved import degrades marker
    type to any silently; RunTypeSubKind not exported from index; mocking gaps (fmt
    transforms never applied, domain allowedValues ignored, pattern message not surfaced).

## 2026-07-11 — initial spike (session 1)

### Landed

1. **Vendored `@ts-runtypes/*` tarballs** under `vendor/ts-runtypes/` (since removed) built from ts-run-types `main` (`eb7b618` + two fixes below). npm's 0.9.0 predates `getRTFunction` + the multi-slot marker work, so `file:` refs are used until the next publish (see README).
2. **pnpm policy**: `minimumReleaseAgeExclude: [unplugin, '@ts-runtypes/*']` (unplugin@3.3.0 is 12 days old; the scope entry is for the registry switch later).
3. **`@mionjs/run-types` → proxy**: legacy deepkit runtime type system deleted (JIT compilers, nodes, mocking, microbenchs); new surface = `export * from '@ts-runtypes/core'` + [mionAdapter](../../packages/run-types/src/mionAdapter.ts) (`getReflectionFromMarkers`, `buildJitFnsFromMarker`, paramNames/hasReturnData/isAsync derivation). Deps: `@deepkit/*` out, `@ts-runtypes/core` in.
4. **Router adapted (minimal)**: factory markers in [lib/handlers.ts](../../packages/router/src/lib/handlers.ts) (`'val','verr','pj','rj','sj'` per side + two `InjectRunTypeId`), `rtFns` payload on defs, [lib/reflection.ts](../../packages/router/src/lib/reflection.ts) rewritten to consume markers. dispatch/serializer code untouched.
5. **`@mionjs/devtools`**: `mionVitePlugin` is now a wrapper over `@ts-runtypes/devtools/vite` accepting the legacy option shape — **all ~20 existing vite/vitest configs work unmodified**. deepkit/AOT/pure-fn modules deleted; `@deepkit/type-compiler` dep removed; eslint plugin + `cjsPackageJsonPlugin` kept; `serverReady` kept as resolved-promise compat.
6. **Root tsconfig**: `customConditions: ["source"]` (tsgo resolves `@mionjs/*` to sources like vitest does).
7. **Tests**:
   - [router migration.spec.ts](../../packages/router/src/migration.spec.ts): **8/8 green** — register+reflection data, dispatch+validate+respond, Date revival both directions, invalid params → validation-error, arity check, async handler, void route, middleFn chain.
   - [run-types mionAdapter.spec.ts](../../packages/run-types/src/mionAdapter.spec.ts): **6/6 green**.
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

## 2026-07-12 — registry swap (@ts-runtypes 0.9.1)

`@ts-runtypes/*@0.9.1` published to npm (from ts-run-types `main`, PR #216 fixes included).
mion swapped the vendored tarballs for registry deps: `@ts-runtypes/core@0.9.1` (run-types),
`@ts-runtypes/{devtools,bin}@0.9.1` (devtools); `vendor/` and the `.gitignore` exception
deleted. Verified against the REGISTRY-resolved platform binary (sibling checkout hidden so
`getExePath()` took over — the CI path): router migration+routesFlow 27/27, run-types 9/9,
core 56/56. PR #123 CI can now resolve `@ts-runtypes/binary-linux-x64`.

## 2026-07-11 — session 1 addendum 2 (pure fns + core cleanup)

Per maintainer direction: audited core feature-by-feature vs ts-runtypes
([05-core-audit.md](core-audit.md)) and removed everything that existed only to support the
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
