# Migration review findings — run-types → @ts-runtypes (PR #123)

**Status:** done — review + triage complete 2026-07-20. Blockers and all bucket-1/cheap
bucket-2 items fixed on the PR branch (commit `ec054a42`, PR #123); every remaining
actionable finding is tracked in its own `docs/todos/` spec (see Triage status below);
statement/accepted-by-design items are docs-wave material. This file stays as the review
RECORD — the open work lives in the linked specs, not here.
**Created:** 2026-07-19

## Triage status (2026-07-20)

**Fixed on the PR branch (commit `ec054a42`):**

- **R1** — `@mionjs/run-types` promoted to client `dependencies` (`workspace:*`).
- **R2 (interim)** — root deepkit devDeps + `deepkit-install` script deleted; platform-bun
  README carries a "temporarily unsupported / do not publish" warning; port tracked in
  [platform-bun-runtypes-lane.md](../todos/platform-bun-runtypes-lane.md).
- **R3** — `aotSSR.e2e.test.ts`, the `test:e2e:ssr` script and the vitest exclude deleted;
  `pnpm --filter @mionjs/client run test` works again.
- **R7** — dead `RouterOptions.runTypeOptions` removed (type + default).
- **R8 (partial)** — `MionServerOptions`/`MionServerMappersOptions` exported from the
  barrel; the one-time legacy notice now also covers `include`/`exclude`/`reflectionMode`/
  `reflection`; unsupported `server.runMode` values warn. (Return-shape single→array stays —
  documentation item.)
- **R9** — runtime guard rejects the legacy 3-arg `serverMapFrom(src, mapper, 'name')`
  shape with a migration hint; `MapFromServerFnRef` reshaped to the real runtime ref
  (dead `PureFnDef`/`PureServerFnRef`/`ParsedFactoryFn`/`MapFromRef` bases deleted — the
  phantom required `pureFn` member is gone).
- **R18** — dead class-registry setters (`setSerializableClass`/`setDeserializeFn`) and
  dead jit-cache mutators (`addToJitCache`/`removeFromJitCache`/`findCompiledPureFn`) now
  throw with guidance; core's `registerErrorDeserializers` is a documented no-op (real
  registration lives in run-types' class serializers).
- **R30** — marker payloads fail CLOSED: a present-but-short injected array throws
  (val/verr/pj/rj/sj required; huk/uke/tb/fb stay optional) instead of silently disabling
  validation.
- **R31** — routesFlow mapper resolution is allow-listed: only keys registered through
  `registerMionPureFn`/`registerServerMappers` resolve; wire keys can no longer invoke
  arbitrary ts-runtypes registry entries (unit-pinned).
- **R32 (partial)** — `vite build` inlines the harvested manifest entries INTO the
  generated `virtual:mion/server-mappers` module (no `node:fs`, no absolute build paths in
  production bundles; missing manifests fail the build); dev/serve keeps the runtime read +
  lazy re-reader for the HMR race. Mapper factories build lazily on first use (no eager
  `new Function` at boot).

**Filed as follow-up specs:**

- **R35** (+ R33 fail-loud/doc, R34 paramNames arity, R17 client-side strict) →
  [old-engine-leftover-sweep.md](../todos/old-engine-leftover-sweep.md) and
  [review-hardening-followups.md](../todos/review-hardening-followups.md).
- **R20** (getFriendlyErrors verification + Brand story decision) →
  [engine-consumer-verification.md](../todos/engine-consumer-verification.md).
- **R2** (bun lane port) → [platform-bun-runtypes-lane.md](../todos/platform-bun-runtypes-lane.md).

**Documentation wave** (R4 file lists + R5/R6/R10–R16/R19/R21–R29/R36 notes) → folded into
[examples-and-website-refresh.md](../todos/examples-and-website-refresh.md).

**Statements / accepted by design (no action beyond docs):** R5, R6, R10–R14, R16, R19,
R21–R26, R28 (re-add decision left to the docs wave), R29, R36; upstream candidates (R22,
R5b, R21) already tracked per the bucket-4 list.

Independent review of PR #123 (`claude/mion-ts-runtypes-migration-qywc6z`, head `79513de`, vs
`master` @ `9089d9f`) against its goal — as refined by the maintainer during this review:
**1:1 applies to the mion FRAMEWORK surface** (router, client, devtools plugin shape,
platforms — everything NOT provided by the new engine). The surfaces now PROVIDED BY
ts-runtypes — the `@mionjs/run-types` runtime type API, all of `@mionjs/type-formats`,
and core's engine glue — are intentionally ts-runtypes' surfaces and are NOT parity
targets (their old mion incarnations must be fully gone, leftovers swept in R35).

Method: full-surface export comparison per package (master barrels/`exports` maps vs HEAD,
resolved through the published `@ts-runtypes/core@0.10.0` tarball for the star re-exports),
an audit of every changed/deleted spec file (changed assertions = evidence of changed
behavior), a code/architecture pass over all new adapter/transport code, and targeted
`tsc --strict` probes. Findings are numbered `R1…` for later triage; each should become its
own `docs/todos/` spec (or a wontfix note) when triaged. Severity labels:
**blocker** (breaks a release/publish), **breaking** (compile/import errors for users),
**behavioral** (observable runtime change), **hardening** (robustness/security),
**quality** (architecture/cleanup), **stale** (dead leftovers). Findings resolved during
review carry **[resolved — intentional]** / **[… — accepted by design]** (kept for the
record + docs material); engine-behavior notes that belong to ts-run-types carry
**[upstream]**.

## Verdict (short)

Against the refined scope, the **framework surface is genuinely close to 1:1**: route
registration → dispatch → validation → serialization round-trips, the JSON error
envelope, HeadersSubset semantics, strictTypes accept/reject outcomes, and the route
factory call shapes all match master (see "Verified 1:1" at the bottom). What breaks the
claim is concentrated and fixable: two packages are release-broken (R1, R2), a handful of
framework-surface regressions shipped (R9, R17, R28), mion code that consumes engine
shapes was left unadapted (R20), every wire lane except plain JSON routes lost
cross-version compatibility (R15), and a large body of old-engine references survives in
the tree (R35). None of this is visible from the green test suite because the suite was
migrated alongside the code — the deltas are recorded in the spec diffs themselves.
Engine-surface changes (run-types API, type formats) are catalogued below as
informational/documentation material, not as breaks.

**Intentional-replacement scoping note (maintainer direction, 2026-07-20):** everything
the new engine provides is intentionally ts-runtypes' surface — removals/renames/behavior
of these families are NOT counted as breaks anywhere in this doc:

- **AOT** — never a feature, a workaround for deepkit being a runtime type system.
  ts-runtypes is compile-time only (everything is comp-time generated).
- **The old pure-fn surface** (`pureServerFn`, `registerPureFnFactory`, `quickHash`, …) —
  moved into ts-runtypes; `serverMapFrom` (inline `rt::` harvest + named `mionjs::` lane
  via `registerMionPureFn`) covers the client→server use case, and standalone
  `pureServerFn` is dropped.
- **The `@mionjs/run-types` runtime type API** (old `runType`/`reflectFunction`/
  `create*Fn` factories, guards, node classes, jit compilers, mocking utils) — the
  package is a thin proxy now; its API IS `@ts-runtypes/core`'s API.
- **All of `@mionjs/type-formats`** (format classes/values, `Format*` type shapes and
  params, validation messages/paths, mocking) — moved to `@ts-runtypes/core/formats`;
  the package is a type-alias proxy.
- **Core engine glue** (`JIT_FUNCTION_IDS` families, binary serializer internals,
  deepkit-era format typing) — provided by / proxied to ts-runtypes.

For all of these the defect class is the opposite one: **references left behind** — the
full repo sweep of AOT/`MION_COMPILE`/deepkit/pure-fn/old-format leftovers lives in R35.
What REMAINS in scope as findings: the framework surface (router/client/devtools/
platforms), packaging, wire/deployment compatibility, and mion code that CONSUMES engine
shapes and was left unadapted.

---

## A. Release blockers

### R1 [blocker] `@mionjs/client` has an undeclared runtime dependency on `@mionjs/run-types`

- HEAD value-imports it from shipped source: `packages/client/src/routesFlow.ts:9`
  (`mionPureFnId`) and `packages/client/src/lib/clientMethodsMetadata.ts:20`
  (`addSerializedJitCaches`), both reachable from the barrel.
- `packages/client/package.json` `dependencies` still lists only `@mionjs/core`
  (run-types sits in devDependencies). Works in-repo via workspace hoisting only.
- Impact: published `@mionjs/client` fails at import with "Cannot find module
  '@mionjs/run-types'". `scripts/pre-publish-test.sh` should have caught this — verify why
  it didn't (or run it before merge).
- Fix: promote `@mionjs/run-types` to `dependencies` (`workspace:*`), or invert the import
  so client depends only on core's backend interface.

### R2 [blocker] `@mionjs/platform-bun` was never migrated — still on the deepkit pipeline

- `packages/platform-bun/loader/runtypes-loader.ts` still imports
  `@deepkit/type-compiler` (`declarationTransformer, transformer`), loaded by
  `bun-preload.ts` via `bunfig.toml` preload. Zero files under `packages/platform-bun`
  changed in the PR.
- It is invisible to CI: its tests are `bun:test` (`src/bunHttp.test.ts`), not part of any
  vitest project or `test:ci` batch; the PR's "1126 green" never exercised it.
- Under the new system its deepkit transform injects metadata nothing consumes; route
  registration throws `MissingRtFnsError` (router `lib/reflection.ts:29`). There is
  currently no ts-runtypes injection lane for `bun build`/`bun test` (the resolver is
  vite/unplugin-driven).
- This is also why `@deepkit/core` + `@deepkit/type-compiler` survive in
  `package.json:64-65` (root) and `packages/platform-bun/package.json:67-68`, plus the
  root `deepkit-install` script.
- Fix: decide the bun story explicitly — port the loader to a ts-runtypes bun plugin,
  or mark the package unsupported/deprecated for now (and delete the deepkit deps either
  way). Silent shipping of a broken package is the worst outcome.

### R3 [blocker] `pnpm --filter @mionjs/client run test` fails on a dead e2e script

- `packages/client/package.json`: `"test": "vitest run && pnpm run test:e2e:ssr"` →
  `src/aotSSR.e2e.test.ts`, which is untouched from master: asserts the deleted
  `virtual:mion-aot/{jit-fns,pure-fns,router-cache,caches}` modules resolve and passes
  `runMode: 'middleware'` (unsupported). Its docblock also points at a path that no longer
  exists (`src/aot/aotSSR.e2e.test.ts`).
- Root `test:ci` dodges it (vitest projects only), so CI is green while the package-level
  test entry is broken.
- Fix: delete the file + `test:e2e:ssr` script, or rewrite it as a serverMapFrom-transport
  e2e (the machinery it tested is gone; `servermapfrom-build-time-transport.md` describes
  the successor).

### R4 [blocker-adjacent] `packages/examples` is broken well beyond the tracked todo

- [examples-and-website-refresh.md](../todos/examples-and-website-refresh.md) lists 9 files; the
  real count is higher. Additional files needing a **port to the new API**:
  `binary-serialization.ts`, `serialization-any.ts` (removed `create*Fn` factories),
  `codegen/vite-vitest-global-setup.ts` (documents the `await serverReady` pattern that
  now hangs, see R27),
  `type-formats/builtin/domain-custom.ts` (`FormatDomainStrict<{…}>` — generics removed,
  R13) and `type-formats/builtin/custom-strings.ts` (`pattern: {val: RegExp,
errorMessage}` — param shape removed, R14).
- Files to **DELETE outright** (AOT-era and old-pure-fn-era examples — both surfaces are
  intentionally gone, do not port):
  the whole `codegen/aot-*.ts` family (`aot-server-complete.ts`, `aot-cache-order.ts`,
  `aot-loading-caches.ts`, `aot-routes-example.ts`, `aot-types-not-compiled.ts`),
  `codegen/vite-client-ipc.config.ts` (IPC/AOT-generation mode),
  `introduction/pure-functions-examples.ts` + `introduction/eslint-pure-functions.routes.ts`
  (`pureServerFn`/`registerPureFnFactory` demos — rewrite the topic around
  `registerMionPureFn` + `serverMapFrom` instead),
  `run-types/pure-functions.ts` (`registerPureFnClosure` — gone), plus
  `cloudflare/cloudflare-config.ts:5` and `cloudflare/cloudflare-handler.ts:5` which still
  pass the removed `{aot: true}` router option (rewrite these two to the current
  Cloudflare story instead — see R32). `codegen/client-no-vite.ts` imports
  `./aot-routes-example.ts` and needs re-pointing.
- CLAUDE.md states the examples package "should compile"; nothing in CI enforces it
  (no vitest project, no typecheck script), which is why this drifted.
- Fix: extend the existing todo's file list with the above (port list + delete list), and
  add an examples typecheck lane to CI so it can't regress silently again.

---

## B. Public API (per package) — framework-surface breaks + resolved engine-surface notes

### R5 [breaking — accepted by design] `TypedError`/`RpcError`: `.message`/`.name` now optional; no longer assignable to `Error` in strict TS

- **Maintainer decision (2026-07-20): the optional typing is the intended model.** The
  fields stay on the error object but are never transmitted — `publicMessage` is and
  always was the public lane. This finding is downgraded from decision-needed to a
  documentation task; the facts below stay recorded because the type-level consequences
  are real and user-visible.
- The wire contract did NOT change — verified on both sides:
  - master: `message`/`name` were **type-required** (inherited from `Error`; deliberately
    NOT re-declared so deepkit reflection would not see them) but **never transmitted** —
    the constructor defines them non-enumerable and the old
    `run-types/src/nodes/collection/classRpcError.spec.ts:38-62` pinned the wire to
    exactly `{'mion@isΣrrθr', type, publicMessage, id, errorData}`.
  - HEAD: identical wire, re-pinned by `mionClassSerializers.spec` (after in-migration fix
    `4246025`). The optional+`@nonEnumerable` declaration
    (`packages/core/src/errors.ts:49,68-72`) is the ts-runtypes-era encoding of the SAME
    intent: the checker reflects inherited lib-`Error` members, and ts-runtypes only
    honors the enumerability guard on OPTIONAL props — master's hide-by-not-declaring
    trick is not expressible anymore.
- Type-level consequences (verified with `tsc --strict` probes; runtime unaffected —
  the constructor always assigns both, `instanceof Error` holds):
  `const e: Error = new RpcError({...})` → TS2322 (both classes); `rpc.message.length` →
  TS18048 (possibly undefined).
- Remaining actions: (a) document the new typing in the migration notes/website (users
  hitting TS2322/TS18048 need the story: fields exist at runtime, use `instanceof` or
  narrow); (b) optional future improvement, non-blocking: upstream
  `@nonEnumerable`-on-required support (serialize-if-enumerable + `DataOnly` marking them
  optional) would allow restoring required typing without putting them back on the wire.

### R6 [resolved — intentional] `@mionjs/core` pure-fn surface moved to ts-runtypes; standalone `pureServerFn` dropped

- **Maintainer decisions (2026-07-20):** the pure-fn machinery moving into ts-runtypes is
  intentional (same treatment as AOT — removals not counted as breaks), and **standalone
  `pureServerFn` is dropped**: its only shipped application on master was routesFlow
  mapping resolution (master `router/routesFlow.ts:245,300`), and that use case is fully
  replaced by `serverMapFrom`'s two lanes (inline `rt::<hash>` build harvest + named
  `mionjs::<name>` via `registerMionPureFn`). The client→server security model is
  unchanged (only keys ride the wire; the server executes only what its own build/
  registration provided).
- Remaining migration-note items (the only user-relevant residue):
  - `addSerializedJitCaches`/`resetJitFnCaches` **moved** core → `@mionjs/run-types` with
    a changed signature (`mionAdapter.ts:165,199`).
  - `JIT_FUNCTION_IDS` shrank 16 → 9 keys and every value changed (now derived via
    `getFnHash`) — matters only to consumers matching persisted hash strings.
- All remaining references to the old surface (live types, vestigial eslint rules,
  examples, website pages) are leftovers to purge — swept in **R35**.

### R7 [breaking] `@mionjs/router`: dead option + def-shape changes

- (AOT-era surface — the `./aot` subpath/aotEmitter, the methodsCache/persisted-methods
  family, `RouterOptions.aot` — is intentionally gone and NOT counted here; the record of
  registered method ids is now `routesCache.getCache()` in core, as
  `platform-node/src/mionHttp.spec.ts` shows. Leftover references in R35.)
- **`RouterOptions.runTypeOptions` survives in the type but is a silent no-op** — verified:
  zero readers in router src (master spread it into every JIT compile,
  `reflection.ts:239-240`). Users passing compiler options get no error and no effect.
  Remove the option or wire it to the marker/dispatch equivalents.
- Route defs now carry `rtFns` (breaks deep-equality/serialization of def objects —
  every `handlers.spec.ts` expectation had to add it); factories gained 4–6 trailing
  optional marker params (2-arg calls still compile).

### R8 [breaking] `@mionjs/devtools`: option/exports drift in the wrapper

- New `MionServerOptions`/`MionServerMappersOptions` are NOT exported from the barrel
  (only reachable via `MionPluginOptions['server']`) — export them. (The deepkit/AOT-era
  barrel exports — `VIRTUAL_AOT_*`, `AOTCacheOptions`, `MionServerConfig`,
  `PureFunctionsPluginOptions`, `DeepkitTypeOptions` — are intentionally gone, not
  counted.)
- Master's `runTypes.reflection` field is now an excess-property **error** (the legacy
  alias kept is `reflectionMode`); `include`/`exclude`/`reflectionMode` are ignored
  **silently** (no warn, unlike `serverPureFunctions`/`aotCaches` which warn once);
  `server.args` was deleted; `server.runMode: 'middleware' | 'buildOnly'` remain in the
  type but are ignored — a `buildOnly` config now silently spawns a long-running child
  (`mionVitePlugin.ts:69,273`). Warn (or type-error) on every ignored/unsupported value.
- Return shape changed single plugin → array (fine in `plugins: []`, breaks
  `Plugin`-typed direct usage).

### R9 [breaking] `serverMapFrom`: the old named lane still typechecks but is silently broken

- Master shape `serverMapFrom(src, mapper, 'name')` (3rd-arg name) still compiles on HEAD —
  the 3rd param is string-typed `InjectPureFnHash` — but at runtime the name goes through
  `bodyHash.indexOf('::') === -1` parsing (`client/src/routesFlow.ts:101-105`), producing
  `namespace = name.slice(0, -1)` garbage and a key no server resolves. Every call fails
  with `routesFlow-mapping-missing-pure-fn`.
- The only guard is the updated `no-vite-client` eslint rule — lint-optional.
- Fix: runtime-reject refs whose `bodyHash` lacks `::` when a 3rd arg was user-supplied
  (i.e. detect the legacy shape and throw with the migration hint at call time), and/or
  make the 3rd param un-typeable for strings.
- Related type bug: `MapFromServerFnRef.pureFn` is required via
  `PureServerFnRef extends Required<PureFnDef>` (`core/src/types/pureFunctions.types.ts:60-102`)
  but HEAD never sets it (force-cast at `routesFlow.ts:106-113`) — `ref.pureFn(...)`
  typechecks and crashes. Root cause: the live `MapFromServerFnRef` type still extends
  the dead `pureServerFn`-era base types (`PureFnDef`/`PureServerFnRef`) — reshape it to
  what the runtime actually builds instead of patching the member (see R35 pure-fn
  leftovers).

### R10–R14 [resolved — intentional] run-types & type-formats surfaces are ts-runtypes' surfaces now

Per the scoping note, none of this is counted as a break — the old surfaces must be gone.
Kept here in compressed form ONLY as source material for the migration notes/website
rewrite (upgrading users need the old→new mapping spelled out once):

- **R10 — runtime factories renamed + de-asynced:** `runType`/`reflectFunction`/
  `createIsTypeFn`/`createTypeErrorsFn`/`create{PrepareFor,RestoreFrom,Stringify}JsonFn`/
  `createTo/FromBinaryFn`/`createMockTypeFn`/`mockType` → sync, marker-driven
  `createValidate`/`createGetValidationErrors`/`createJsonEncoder/Decoder`/
  `createBinaryEncoder/Decoder`/`createMockData`/`getRunType`.
- **R11 — ~130 secondary exports gone** (guards, formatter registry, JIT compiler/base
  classes, mocking utils, ~45 node classes, helper types) — power-user surface, now
  upstream's problem space.
- **R12 — surviving names redefined:** `RunType` is a pure data node (no methods);
  `TypeFormat` uses the `__rtFormat*` phantom encoding; `FormatAnnotation` lost
  `.formatter`/`.options`. Core still exports pre-migration twins of several of these
  (`TypeFormatParams`, `StringParams`, …) — that is a core LEFTOVER, swept in R35.
- **R13 — type-formats is a type-only proxy:** all value exports gone (format classes,
  regexes, mock helpers, `cpf_*` pure fns); format generics de-parameterized
  (`FormatDomainStrict<D>` → 0-arity; custom params re-spelled as
  `TypeFormat<string, 'domain', P>`); `FormatEmailPattern`/`FormatUrlSocialMedia`/
  `DEFAULT_*_PARAMS` gone; new `FormatCurrency`/`FormatDomainUnicode`/
  `FormatDomainPunycode` added.
- **R14 — param shapes changed:** per-bound `{val, errorMessage}` metas gone (scalar
  bounds only; patterns via `registerFormatPattern({source, flags, message, mockSamples})`).

Residue tracked elsewhere: broken examples → R4; core's stale twin types + the
`formatTypeNames` eslint list → R35; mion consumers of the changed format error shapes → R20.

---

## C. Behavioral changes (runtime observable)

### R15 [behavioral] Cross-version wire compatibility: only plain JSON routes survive

| Lane                                   | old client ↔ new server                                                                                  | Evidence                                                                            |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| JSON routes + error envelope           | ✅ compatible                                                                                            | dispatch/serializer specs unchanged; envelope pinned by `mionClassSerializers.spec` |
| Binary bodies (`serializer: 'binary'`) | ❌ protocol replaced (varint; bigint>64bit e.g. 6 bytes vs >8)                                           | `defaultBigNumberBinary.spec.ts`; `core/binary/dataView.ts` proxy swap              |
| routesFlow mappings                    | ❌ `bodyHash` bare-hash/name → full `rt::<hash>`/`mionjs::<name>` key                                    | router `routesFlow.ts:247`; client `routesFlow.spec.ts`                             |
| Client methods-metadata (jit deps)     | ❌ hash keys + `JitCompiledFnData` fields changed; noop entries ship no code; closures need `getRTUtils` | `remoteMethods.spec.ts:100-108`; `general.types.ts` diff                            |

- If rolling deploys/cached clients matter, this needs a version handshake or at least a
  documented "upgrade client+server in lockstep" requirement. Currently undocumented.

### R16 [intentional — document] Validation-error vocabulary is the engine's now

- The tokens inside `errorData.typeErrors[]` come from ts-runtypes, so the vocabulary
  changed by design: `expected` `'object'` → `'objectLiteral'` (`dispatch.spec.ts:400`),
  the `'class'` token gone, headers validation no longer single-error
  (`headers.spec.ts` asserts `length > 0`). `path` segment format is UNCHANGED (verified
  both sides), and the envelope (`{expected, path, format?}`) is 1:1.
- Residue: (a) document the new token vocabulary for API consumers who match on
  `expected` strings (docs wave); (b) the strictTypes unknown-prop violation entry shape
  (generated by `unknownKeyErrors` as a **second** error after `isType` passes) is pinned
  by no spec on either side — pin it once in a router spec so the wire contract is
  recorded.

### R17 [behavioral] strictTypes enforcement drifted in two ways

- Client-side: `client/lib/validation.ts:52-57` only calls `isType`/`typeErrors`; on
  master the strict behavior was baked into `isType` (from server-compiled fns), so
  strict violations failed fast client-side. Now they round-trip to the server. The
  `hasUnknownKeys`/`unknownKeyErrors` fns DO ride the metadata lane
  (`core/routerUtils.ts:192-195`) — the client just never calls them. Cheap fix.
- Server-side fail-open: `dispatch.ts:195-198` returns early when `hasUnknownKeys` is
  absent or noop — a build that failed to emit `huk`/`uke` silently stops enforcing
  strictness instead of erroring (part of the R30 fail-open pattern).

### R18 [behavioral] Custom class serialization: dead old-lane registries still exposed with zero warning

- The old lane's replacement is `registerClassSerializer` (ts-runtypes) — intentional per
  the scoping note. The finding is the LEFTOVER: `getJitUtils().setDeserializeFn(...)`/
  `setSerializableClass(...)` still exist, still silently store entries — core
  `errors.ts:240-244` itself still self-registers into them — but **nothing reads them**
  (verified: zero readers outside `jitUtils.ts`). Classes registered the old way silently
  decode as plain objects (no `instanceof`), no warning anywhere.
- Fix: make the dead setters throw with "use registerClassSerializer", delete core's own
  dead self-registrations (cleanup itemized in R35).

### R19 [behavioral] `isAsync` metadata flipped for inference cases

- `route(() => null)` (no return annotation): `true` → `false`; sync handlers returning
  Promises: now `false` (`handler.constructor.name === 'AsyncFunction'`,
  `mionAdapter.ts:378-380`; `router.spec.ts:359`). Dispatch always awaits so behavior is
  safe, but the flag ships in client-visible methods metadata.

### R20 [behavioral] Mion features that CONSUME engine format shapes were left unadapted

The new format typing/error shapes are ts-runtypes' by design — but two live mion (core)
features sit on top of them and were NOT touched by the migration:

- **`getFriendlyErrors` (`core/src/friendlyErrors.ts` — untouched, zero diff):** it keys
  on exactly the fields that changed upstream — `error.format.formatPath[0]` (paths now
  flattened: `['localPart','maxLength']` → `['maxLength']`; part indexes gone),
  `error.format.val` (dateTime now carries the splitChar, not the failing sub-format),
  format `name`s (`'email'` → `'domain'`/`'stringFormat'` in sub-errors) and
  `error.expected` (`'object'` → `'objectLiteral'`). Its spec
  (`friendlyErrors.spec.ts`, also untouched) runs against HAND-BUILT error fixtures, so
  the green suite proves nothing about real ts-runtypes output. **Action: verify
  getFriendlyErrors against real engine errors and update its mapping/spec fixtures.**
- **`core/src/types/formats/formatBrands.types.ts` (`BrandEmail`, … — untouched):** the
  documented server↔client brand contract is broken — ts-runtypes formats carry
  `BrandName = never` (a `FormatEmail` value is a plain `string` now), so
  `FormatEmail` is no longer assignable to `BrandEmail` and brand-narrowing code stops
  matching, silently. Website still documents the old contract
  (`website/content/4.run-types/2.type-formats.md:170-186`). **Action: decide — drop the
  Brand story (delete `formatBrands.types.ts` + docs) or push brand support upstream
  (bucket 4).**

### R21 [upstream — informational] Format validation shape/message changes (engine behavior)

Intentional per the scoping note (formats are ts-runtypes' domain); recorded compressed
because the docs wave and R20's verification need the list: sub-part paths flattened and
short-circuited (fewer errors per invalid value); built-in messages collapsed to generic
`'pattern'`/`'Invalid pattern'` (custom messages via `registerFormatPattern({message})`);
number-format param misconfigurations no longer throw at runtime — build-time FMT002
diagnostics only, so an ignored diagnostic means the format **silently validates**
(7 deleted tests in `numberFormat.runtype.spec.ts`). Anything here deemed a quality loss
belongs upstream (bucket 4), not in mion.

### R22 [upstream] Mock-data regressions (flagged "KNOWN REGRESSION" in-spec)

- Case transforms (lowercase/uppercase/capitalize) not applied by `createMockData`
  (cache-key mismatch; specs post-apply `createFormatTransform` manually,
  `defaultStringFormats.runtype.spec.ts`), domain mocking ignores `allowedValues`
  (falls back to `'example.com'` which fails its own validation,
  `domain.runtype.spec.ts`), and the mock-sample cross-constraint sanity check was
  deleted (`stringFormat.runtype.spec.ts`). Engine defects — file in ts-run-types
  `docs/todos/` if not already there; the in-spec workarounds here are the tracking
  markers.

### R23 [resolved — intentional] `stripUnknownKeys`/`unknownKeysToUndefined` → `createCloneExactShape`

- Old mutating strip ops are engine surface, gone by design; upstream's replacement is
  `createCloneExactShape<T>()` (non-mutating schema-shaped clone, available through the
  run-types re-export). Only residue: record the old→new mapping in the migration notes —
  it was the one renamed capability the spec audit found undocumented.

### R24 [behavioral] Binary middleFn degradation is now warn-and-skip

- Master `ensureBinaryJitFns` retroactively JIT-compiled missing `toBinary`/`fromBinary`;
  HEAD only `console.warn`s and the middleFn's data "will not ride binary bodies"
  (`lib/reflection.ts:135-149`). Deliberate (build-time-only world), but it converts an
  old hard guarantee into a silent degrade — should be in user-facing docs.

### R25 [behavioral] `isTypedError`/`isRpcError` guards widened

- Now accept duck-typed shapes carrying `name`/`stack` keys (`core/errors.ts:186,201-212`);
  master rejected them. Intentional (serialized shapes may carry them) — record as such.

### R26 [behavioral] Import side effects moved

- `import '@mionjs/run-types'` (or anything re-exporting it) now registers all format
  patterns/pure fns, registers TypedError/RpcError class serializers, and installs the
  core jit lookup backend at module scope. Master's index was side-effect-free
  (registrations rode the type-formats subpaths). See also R33.

### R27 [behavioral] `serverReady` + managed-server contract changed

- `serverReady` went from a `globalThis`-symbol-keyed promise (explicitly designed to
  survive vitest module duality) to a **module-local** one; the PR's own
  `client/globalSetup.ts:14-19` documents that under the `source` condition a consumer
  can get a different module instance "whose serverReady promise would then never
  resolve" and switched to raw port polling. The published pattern (`await serverReady`
  in globalSetup) — still shown in `examples/src/codegen/vite-vitest-global-setup.ts` —
  now hangs. It can also reject now (spawn failure/timeout), which is new.
- The child no longer receives `MION_COMPILE` — that env var WAS the AOT-generation
  contract, so with AOT gone the whole contract should be **deleted**, not documented.
  It is currently half-alive (see R35 sweep): core still ships `isMionCompileMode()` +
  `isMionAOTEmitMode()` (`core/src/utils.ts:53-64`), platform adapters still skip
  `listen()` on it, and `router.ts` still sends an IPC message nothing listens to.
  Master-era servers gating `listen()` on it never open the port → `serverReady` rejects
  at `waitTimeout`. New contract is `MION_TEST_SERVER_AUTO_START=true` + accepting HTTP
  on the polled port — document that one.

### R28 [behavioral] SSR `noExternal` auto-injection and Vue SFC support dropped

- Master's plugin unconditionally added `ssr.noExternal: [/@mionjs\//]` (so SSR/vite-node
  users didn't need to) and transformed `.vue?vue&type=script` virtual modules. HEAD's
  wrapper has no `config` hook and `@ts-runtypes/devtools` contains neither. Impacts:
  SSR users without their own `noExternal` get duplicated `@mionjs/core` instances
  (split registries — the exact failure mode `getOrCreateGlobal` exists to soften), and
  typed mion code inside `.vue` script blocks silently stops being transformed
  (Nuxt/Vue was an advertised workflow).

### R29 [behavioral] `failOnError` defaults to `true` (new strictness for user builds)

- No master equivalent; Error-severity ts-runtypes diagnostics now halt user builds by
  default (`mionVitePlugin.ts:172`). Right default long-term, but it is a behavior change
  for existing projects (their own scanner-tripping patterns now fail the build) and
  deserves a prominent docs/release note alongside the opt-outs
  (`failOnError: false`, `allowUncheckedPatterns`).

---

## D. Architecture / hardening / quality (second pass)

### R30 [hardening] Fail-open per-key fallbacks in the marker adapter

- `buildJitFnsFromMarker` (`mionAdapter.ts:230-243`): a missing/short marker payload entry
  silently falls back to `alwaysTrue` (isType), `noErrors` (typeErrors), `identity`
  (pj/rj), `JSON.stringify` (sj) — i.e. **validation silently disabled** on partial
  injection — while `tb`/`fb` deliberately fail closed ("identity fallback would corrupt
  streams"). The same reasoning applies to validation: a wrong-length payload (plugin
  version skew, marker drift) should throw like the missing-array case does, not
  fail open. Recommend: throw when the payload array is present but an expected entry is
  missing (keep fallbacks only for the genuinely-optional huk/uke lane).

### R31 [hardening] routesFlow mapper gate accepts ANY pure-fn registry key

- `hasServerMapper(mapping.bodyHash)` (router `routesFlow.ts:247,303`) is an existence
  check against the **shared** ts-runtypes pure-fn registry. The wire key selects the fn;
  nothing restricts it to mion's lanes — any registry entry (ts-runtypes' own `rt::` pure
  fns, format `cpf`-style fns, entries registered by unrelated libraries in-process) is
  invocable with attacker-chosen input, its result spliced into another route's params
  (then re-validated, which bounds but does not eliminate the surface). Master scoped
  lookups to mion's own `serverPureFnsCache`.
- Recommend: allow-list namespaces (`rt::` only for manifest-registered keys, `mionjs::`
  for registerMionPureFn) — e.g. track keys registered through `registerServerMappers`/
  `registerMionPureFn` and gate on that set, not on the whole registry.

### R32 [quality] serverMappers manifest transport is deploy-fragile

- The `virtual:mion/server-mappers` module bakes **absolute build-machine paths** into the
  server bundle (`path.resolve` at config time, `mionVitePlugin.ts:227`) and reads them
  with `node:fs` **at runtime** (`installServerMapperReader` eagerly reads at boot,
  `mionPureFns.ts:129-132`; lazy re-read on miss). Missing files are tolerated silently →
  inline mappings fail at runtime with `routesFlow-mapping-missing-pure-fn`.
- Consequences: (a) lambda/docker/deployed bundles need the manifest present at the SAME
  absolute path as on the build machine; (b) `node:fs` in the module rules out
  edge/workerd runtimes entirely — and it is at odds with the compile-time-only
  principle: every other artifact is baked into the bundle at build time, the mapper
  manifest is the one runtime file-read left. The edge (Cloudflare/Vercel) deployment
  story needs its ts-runtypes-era answer — the website still documents the deleted
  AOT-based flow (`website/content/6.platforms/5.cloudflare.md`, see R35); (c) split
  client/server build pipelines must share a file.
- Recommend: inline the harvested entries INTO the generated virtual module at build time
  (the manifest as build artifact, not runtime artifact), keeping the fs re-reader as a
  dev-mode-only fallback for the HMR race it exists to cover.
- Minor, same file: `registerServerMappers` eagerly `new Function`s every entry at boot
  (`mionPureFns.ts:122`) — a malformed entry crashes server boot and unused mappers are
  compiled anyway; the harvest filter requires `calleeModule === '@mionjs/client'`
  exactly (`mionVitePlugin.ts:148`), so a re-exported `serverMapFrom` silently never
  harvests (lint/document).

### R33 [quality] Core↔run-types coupling rides an import side effect

- `installJitLookupBackend` runs at `@mionjs/run-types` module scope
  (`mionAdapter.ts:145`); core's `getJIT`/pure-fn lookups return `undefined` until then.
  No package declares `sideEffects` today so bundlers keep the import — but the contract
  is implicit: a future `sideEffects: false`, aggressive tree-shaking, or a consumer
  importing only core APIs silently yields empty lookups (metadata serialization returns
  nothing rather than erroring). Document the contract in core, or fail loud when
  `getJIT` is called with no backend installed.
- Related inconsistency in the compat stub (`core/jit/jitUtils.ts:65-87`):
  `addToJitCache`/`removeFromJitCache` are silent no-ops and `findCompiledPureFn` always
  returns `undefined`, while `addPureFn` throws with guidance. Make the dead ones throw
  (or warn) too — silent no-ops mask consumer bugs.

### R34 [quality] paramNames via `Function.prototype.toString()` parsing

- `getParamNamesFromHandler` (`mionAdapter.ts:290-368`) hand-parses handler source.
  Known-degraded: minified names (admitted in-code), destructured params → `param0…`.
  Un-flagged sharp edge: an **empty** `paramNames` disables client-side validation and
  param serialization entirely (`client/lib/validation.ts:54`,
  `client/lib/serializer.ts:131` both early-return on empty) — so any transpilation that
  changes source arity (ES5 default-param rewriting, some decorator/async downlevels)
  silently kills client pre-validation for that method. Master read names from compile-time
  type metadata and was immune.
- Options: derive the param COUNT from the params runtype (arity is id-relevant and
  build-time-known) and use source parsing only for display names; or pin a test that the
  count survives the supported build matrix.

### R35 [stale] Old-engine leftover sweep — AOT / `MION_COMPILE` / deepkit / pure-fn / type-format surfaces still in the tree

Everything the engine now provides is intentionally replaced (see the scoping note at the
top). The defect is therefore every reference LEFT BEHIND. Full sweep (`grep -ri aot`,
`MION_COMPILE`, deepkit, `pureServerFn|registerPureFnFactory|serverPureFnsCache|quickHash|purityRules`,
`RunTypeFormat|RUN_TYPE_FORMATTER|registerFormatter|getFormatterParams`, excluding
`docs/done/` which is legitimately historical):

**Live code still wired to the AOT/`MION_COMPILE` contract:**

- `core/src/utils.ts:53-64` — `isMionCompileMode()` + `isMionAOTEmitMode()` still exported
  and still READ: platform adapters skip `listen()` on `MION_COMPILE`
  (`platform-node/src/mionHttp.ts:43`, `platform-bun/src/bunHttp.ts:46`) and
  `router.ts:241` forces `getPublicRoutesData` in compile mode. Nothing on HEAD sets
  `MION_COMPILE` outside tests. Delete the fns, the adapter branches, and the pinning
  specs (`mionHttp.spec.ts:173-195` "skip server initialization",
  `bunHttp.test.ts:156-174`), unless skip-listen is re-justified on its own merits under
  a non-AOT name.
- `router/src/router.ts:106-113` — `setPlatformConfig` still sends the
  `{type: 'mion-platform-ready'}` IPC message gated on `isMionAOTEmitMode()`; **no
  listener exists anywhere on HEAD** (the new managed server polls the port). Dead
  protocol — delete both ends.
- `router/src/lib/reflection.ts:40-46` — `AOTCacheError` deprecated stub, exported but
  never thrown. Delete (all AOT APIs should be gone, not stubbed).
- `router/src/defaultRoutes.ts:9-35` — docblock and comments still describe AOT cache
  generation / `MION_COMPILE=buildOnly` / `emitAOTCaches()`; the file is live (managed
  test-server start script) — rewrite the comments.
- `test-server/src/test-server-cloudflare.ts:43-73` + `test-server-edge.ts:43-73` —
  "AOT Compilation" auto-init blocks reading `MION_COMPILE`, and `aot: true` passed to a
  RouterOptions that no longer has the field (dead config; only compiles because nothing
  typechecks these files).
- `test-server/vite.cloudflare.config.ts:18-36` + `vite.edge.config.ts:18-36` — legacy
  `aotCaches:` plugin option (accepted-and-ignored, triggers the one-time warn) and
  "AOT child process" alias comments.
- `client/src/aotSSR.e2e.test.ts` + `test:e2e:ssr` script + the
  `client/vitest.config.ts:33` exclude line (R3).
- `devtools/src/vite-plugin/virtual-modules.d.ts:9-53` — still declares all deleted
  `virtual:mion-aot/*` + `virtual:mion-server-pure-fns` modules (typechecks then fails at
  build); shipped via the unchanged `./virtual-modules` export. Replace with a
  `virtual:mion/server-mappers` declaration. (The committed `devtools/build/` output
  mirrors whatever source says — regenerate after cleanup.)
- `devtools/src/vite-plugin/mionVitePlugin.ts` — the legacy `aotCaches`/
  `serverPureFunctions` accepted-and-ignored options: fine as a transition courtesy, but
  set a sunset (one minor version?) so the option surface stops advertising AOT.

**Packaging / config leftovers:**

- Root `package.json`: `@deepkit/core` + `@deepkit/type-compiler` devDeps and the
  `deepkit-install` script. `platform-bun/package.json`: deepkit devDeps (pending R2
  decision — they exist solely for the un-migrated bun loader).
- `devtools/package.json`: `"AOT"` keyword, and the `clean:aot-caches` script (hunts
  `mion-aot-cache.json` files that nothing generates anymore) chained into both `build`
  and `clean`.
- run-types `package.json`: `browser: {"./persist/jitFnCacheCompiler": false}` maps a
  deleted file; `"deepkit"` keyword.
- Root + core `tsconfig.json`: `"reflection": true`, `emitDecoratorMetadata`,
  `experimentalDecorators` — deepkit-era flags (verify nothing reads `reflection` before
  deleting; ts-runtypes does not).

**Examples / website (fold into R4 / [examples-and-website-refresh.md](../todos/examples-and-website-refresh.md)):**

- `examples/src/codegen/aot-*.ts` (5 files), `vite-client-ipc.config.ts`,
  `client-no-vite.ts` (imports `aot-routes-example.ts`),
  `cloudflare/cloudflare-config.ts` + `cloudflare-handler.ts` (`{aot: true}`).
- `website/content/5.devtools/0.aot-compilation.md` (whole page),
  `6.platforms/5.cloudflare.md` (aotCaches workflow), quick-start `aotCaches: true`
  snippets — the entire AOT docs surface.

**Comment-only mentions (grep hygiene, low priority):** `router/src/router.ts:144`
("test AOT cache loading behavior" — the note itself is now wrong),
`router/src/migration.spec.ts:10`, `platform-cloudflare/src/cloudflareHandler.workers.spec.ts:14`,
`platform-vercel/src/vercelHandler.edge.spec.ts:14` ("+ AOT caches" in bundle docstrings),
`platform-node/src/mionHttp.spec.ts:192` (historical note — fine to keep),
`run-types` `lib/reflection.ts:20-21` ("ARE the AOT artifacts" — explanatory, fine to keep).

**Old pure-fn surface leftovers (`pureServerFn`/`registerPureFnFactory` era — dropped per
the 2026-07-20 decision, R6):**

- `core/src/types/pureFunctions.types.ts` — `PureFnDef` (required `pureFn` member +
  `pureServerFn((jitUtils)…)` doc comment, lines 60-77) and `PureServerFnRef` ("Reference
  object returned by pureServerFn() at runtime", line 89) survive only as the base of the
  LIVE `MapFromServerFnRef` (line 102) — which is how the R9 type bug happened. Reshape
  `MapFromServerFnRef` to the actual runtime ref shape and delete the dead bases.
- `devtools/src/pureFns/purityRules.ts` — whole module; its only consumer is the
  vestigial eslint lane below.
- eslint: the `pure-functions` rule (lints `pureServerFn`/`registerPureFnFactory` calls
  that can no longer exist) + `no-vite-client`'s `pureServerFn`/
  `registerPureFnFactoryNotAllowed` branches (`no-vite-client.ts:11-28,51-78` — keep only
  the `serverMapFrom` branch) + both rules' spec files.
- `devtools/src/vite-plugin/virtual-modules.d.ts` — `virtual:mion-server-pure-fns`
  declaration (also in the AOT list above).
- Examples: `introduction/pure-functions-examples.ts`,
  `introduction/eslint-pure-functions.routes.ts`, `run-types/pure-functions.ts`
  (delete/rewrite — see R4), plus the `pureServerFn` mention in
  `codegen/vite-server-no-vite-client.config.ts:6`.
- Website: `5.devtools/1.pure-functions.md` (rewrite around `registerMionPureFn` +
  `serverMapFrom`), `2.eslint-rules.md` (pure-functions rule section),
  `3.vite-config.md` (`serverPureFunctions` option).
- NOT a leftover (name collision, don't purge): `registerPureFnFactory` in
  `run-types/src/mionPureFns.spec.ts:9` is the NEW `@ts-runtypes/core` API that happens
  to share the old mion core fn's name (the collision that crashed the plugin in
  migration session 1, issue #5).

**Old type-format surface leftovers (formats are `@ts-runtypes/core/formats` now):**

- `core/src/types/formats/formats.types.ts` + `formatsParams.types.ts` — both still
  barrel-exported from core (`core/index.ts:24-25`) and both carry the deepkit-era
  encodings: `FormatParamMeta` `{val, errorMessage, desc}` param metas,
  `AliasTypeAnnotation`, old `TypeFormatParams`/`StringParams` shapes that no longer
  satisfy the new engine's constraints (the R12 "divergent twins"). Align with
  ts-runtypes' types or delete and re-export upstream's.
- `core/src/types/formats/formatBrands.types.ts` — the `Brand*` contract broken against
  unbranded engine formats: R20 decision (delete or upstream).
- `core/src/friendlyErrors.ts` + `friendlyErrors.types.ts` — LIVE feature keying on
  pre-migration format error shapes: R20 verification.
- `devtools/src/eslint/rules/formatTypeNames.ts` — the "single source of truth" list for
  the `enforce-type-imports` rule still contains REMOVED names (`FormatEmailPattern:54`,
  `FormatUrlSocialMedia:65`), is MISSING the new ones (`FormatCurrency`,
  `FormatDomainUnicode`, `FormatDomainPunycode` — so the rule will not stop `import type`
  on them, which silently breaks the side-effect registration lane CLAUDE.md warns
  about), and its docblock still says "Deepkit's type compiler needs actual imports".
- Website: `4.run-types/2.type-formats.md` (brand-mapping table references removed
  `FormatUrlSocialMedia`, old param shapes) and every run-types docs page still on the
  old API — tracked in
  [examples-and-website-refresh.md](../todos/examples-and-website-refresh.md).

**Other stale items (same cleanup sweep):**

- The dead class-serializer registries + core's self-registrations into them
  (`errors.ts:240-244`) — see R18.
- Stale comments: `router/lib/handlers.ts:30` says marker keys are `val…uke` but the
  markers request `tb`/`fb` too; `run-types/src/mionClassSerializers.ts:17-21` still
  claims non-registered generic instantiations "decode structurally" while the 0.9.2
  class-name lane (pinned by `mionClassSerializers.spec`) rebuilds real instances —
  align the comment with the spec.

### R36 [quality] Operational notes worth documenting

- Resolver memory: each vitest project boots a ~200MB resolver; `pnpm run test`
  (all 12 projects at once) OOMs a 7GB machine — that is why `test:ci` runs 4 batches.
  CLAUDE.md still tells developers to use `pnpm run test`; add the caveat.
- New toolchain surface: platform-native resolver binary from `@ts-runtypes/bin`
  (`TS_RUNTYPES_BIN` override), generated modules under `<genDir>/__runtypes/`, manifest
  default path `.mion/server-mappers.json` (both gitignored in this PR).
- Client localStorage from master (`mion-client:jit-fn:*`) is never read nor cleaned —
  harmless bloat; consider a one-time purge in the client.

---

## Needs verification (could not be concluded from source review)

1. Wrapper/indirection patterns around `route()` (user-written generic factories): master's
   per-handler deepkit metadata tolerated them; call-site marker injection may not. Needs a
   build experiment; if unsupported, it belongs in the docs as a hard rule.
2. `instanceof RpcError` after decode for generic instantiations in return unions
   (`RpcError<'x', Data>`): the 0.9.2 class-name lane should cover it (spec pins one case);
   the registration comment claims otherwise (R35 comment fix depends on the answer).
3. What the vite build does with an explicit string 3rd arg to `serverMapFrom` (does marker
   injection override the literal?) — determines how bad R9 is in practice.
4. Whether `pre-publish-test.sh` would catch R1 (undeclared dep) — run it before any publish.

## Explicitly NOT migration defects (for the record)

- `core/src/errors.spec.ts` fails plain `tsc --strict` (partial `CoreRouterOptions` args) —
  pre-existing on master; specs are never type-checked.
- `stringifyBody` discarding a `JSON.stringify` result
  (`router/src/routes/serializer.routes.ts:175`) — pre-existing; already flagged in
  [progress-log.md](progress-log.md) issue #10.

## Verified 1:1 (for fairness)

The framework-surface parity that was checked and HOLDS:
Package `exports` subpaths of run-types/type-formats unchanged; `FormatNames`/`FormatName`
constants string-identical; validation-error struct (`{expected, path, format?}`) and path
segment format unchanged; email/punycode regex sources byte-identical; router barrel
otherwise identical (`dispatchRoute`, `getExecutableFrom*`, guards, queryBody, context
types); `HeadersSubset` semantics incl. `headersReturn` unions; `hasReturnData`
(void/never/undefined) semantics; 2-arg factory calls; strictTypes accept/reject outcomes
(four dispatch specs byte-identical); RpcError JSON wire envelope (after in-migration fix
`4246025`); client barrel byte-identical.

## Suggested triage buckets

1. **Before merge/publish:** R1, R3, R9 (runtime guard), R2 (decision at minimum),
   R31 (allow-list — small change).
2. **Fast follow:** R35 (the AOT/`MION_COMPILE`/deepkit/pure-fn/type-format leftover
   sweep — full list above; the live-but-dead code paths in core/router/adapters first),
   R20 (verify `getFriendlyErrors` against real engine errors; decide the Brand story),
   R7 (`runTypeOptions` removal), R8 (option warnings + barrel exports), R17 (client-side
   strict check), R18 (dead registries), R30 (fail-closed markers), R32 (inline manifest
   entries).
3. **Documentation wave** (extends [examples-and-website-refresh.md](../todos/examples-and-website-refresh.md)):
   R4, R5 (accepted typing — migration note), R6 moved-API notes, R10–R14 old→new
   mapping notes, R15 lockstep-upgrade note, R16 vocabulary, R21 format-error changes,
   R23 (`createCloneExactShape` mapping), R24, R26–R29, R36.
4. **Upstream (ts-run-types) candidates:** R5(b) `@nonEnumerable`-on-required
   (optional, would restore required `message` typing), R20 (format brand support, if
   the Brand story is kept), R21 (sub-part paths/messages, if deemed a quality loss),
   R22 (mock regressions — some already filed per progress log).
