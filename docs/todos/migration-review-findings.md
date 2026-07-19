# Migration review findings — run-types → @ts-runtypes (PR #123)

**Status:** todo (review record — triage pending, no fixes applied)
**Created:** 2026-07-19

Independent review of PR #123 (`claude/mion-ts-runtypes-migration-qywc6z`, head `79513de`, vs
`master` @ `9089d9f`) against its stated goal: **a 1:1 migration — same public API and same
functionality, only the engine swapped** (`@mionjs/run-types` deepkit runtime → published
`@ts-runtypes/*@0.10.0`).

Method: full-surface export comparison per package (master barrels/`exports` maps vs HEAD,
resolved through the published `@ts-runtypes/core@0.10.0` tarball for the star re-exports),
an audit of every changed/deleted spec file (changed assertions = evidence of changed
behavior), a code/architecture pass over all new adapter/transport code, and targeted
`tsc --strict` probes. Findings are numbered `R1…` for later triage; each should become its
own `docs/todos/` spec (or a wontfix note) when triaged. Severity labels:
**blocker** (breaks a release/publish), **breaking** (compile/import errors for users),
**behavioral** (observable runtime change), **hardening** (robustness/security),
**quality** (architecture/cleanup), **stale** (dead leftovers).

## Verdict (short)

The **request/response core is genuinely 1:1**: route registration → dispatch → validation →
serialization round-trips, the JSON error envelope, HeadersSubset semantics, strictTypes
accept/reject outcomes, and the route factory call shapes all match master (see
"Verified 1:1" at the bottom). The claim does **not** hold at the edges: two packages are
release-broken (R1, R2), the run-types/type-formats public surfaces lost ~150 exports with
no aliasing shim (R10–R14), several silent type-safety/runtime degradations shipped
(R5, R20, R23, R28), and every wire lane except plain JSON routes lost cross-version
compatibility (R15). None of this is visible from the green test suite because the suite
was migrated alongside the code — the deltas are recorded in the spec diffs themselves.

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

- [examples-and-website-refresh.md](examples-and-website-refresh.md) lists 9 files; the
  real count is higher. Additional broken imports found: `binary-serialization.ts`,
  `serialization-any.ts` (removed `create*Fn` factories),
  `run-types/pure-functions.ts` (`registerPureFnClosure` — gone from core),
  `introduction/pure-functions-examples.ts` + `eslint-pure-functions.routes.ts`
  (`pureServerFn`, `registerPureFnFactory` — gone from core),
  `codegen/aot-server-complete.ts`, `aot-cache-order.ts`, `aot-loading-caches.ts`
  (`addAOTCaches` — gone), `codegen/vite-vitest-global-setup.ts` (documents the
  `await serverReady` pattern that now hangs, see R27),
  `type-formats/builtin/domain-custom.ts` (`FormatDomainStrict<{…}>` — generics removed,
  R13) and `type-formats/builtin/custom-strings.ts` (`pattern: {val: RegExp,
errorMessage}` — param shape removed, R14).
- CLAUDE.md states the examples package "should compile"; nothing in CI enforces it
  (no vitest project, no typecheck script), which is why this drifted.
- Fix: extend the existing todo's file list with the above, and add an examples typecheck
  lane to CI so it can't regress silently again.

---

## B. Public API breaks (compile-time, per package)

### R5 [breaking] `TypedError`/`RpcError` are no longer assignable to `Error`; `.message`/`.name` are optional

- Verified with `tsc --strict` probes: `const e: Error = new RpcError({...})` → TS2322 (both
  classes); `rpc.message.length` → TS18048 (possibly undefined).
- Cause: the (correct) wire fix from
  [error-envelope-non-enumerable-props.md](../done/error-envelope-non-enumerable-props.md) —
  `packages/core/src/errors.ts:49` re-types the base via
  `Error as unknown as {new (...): Omit<Error, 'message' | 'name'>}` and re-declares both
  as optional `@nonEnumerable`, because ts-runtypes only honors the enumerability guard on
  OPTIONAL props. Runtime is unchanged (`instanceof Error` holds, constructors identical).
- Impact: every consumer passing mion errors to `Error`-typed APIs (error handlers, loggers,
  `originalError` params) or reading `.message` under `strictNullChecks` gets compile
  errors. This is the single most user-visible break for typed codebases and is not
  mentioned in the PR description.
- Fix options (needs a decision): (a) upstream ts-runtypes support for
  `@nonEnumerable`-with-required (serialize-if-enumerable + `DataOnly` marking them
  optional), restoring `message: string`; (b) keep as-is and document the break loudly
  as an intended v-next change; (c) module augmentation shim. The current in-between —
  silent break — is the only wrong option.

### R6 [breaking] `@mionjs/core`: pure-fn + AOT surface removed

- Removed from the barrel (master `core/index.ts:39-41`): `registerPureFnFactory`,
  `pureServerFn`, `PURE_SERVER_FN_NAMESPACE`, `quickHash`, `createUniqueHash`,
  `createHashLiteral`, `resetHashes`, `hashDefaultLength`, `defaultLiteralLength`,
  `pureFnHashLength`, `initPureFunction`, `registerPureFnClosure`, `addAOTCaches`,
  `getJitFnCaches`; `addSerializedJitCaches`/`resetJitFnCaches` **moved** to
  `@mionjs/run-types` with a changed signature (`mionAdapter.ts:165,199`).
- Removed subpath exports: `@mionjs/core/aot-caches`, `@mionjs/core/server-pure-fns`
  (resolve-time `ERR_PACKAGE_PATH_NOT_EXPORTED` now).
- `JIT_FUNCTION_IDS` shrank 16 → 9 keys (`toJSCode`, `format`, `stripUnknownKeys`,
  `unknownKeysToUndefined`, `aux`, `mock`, `pureFunction` gone; `hasUnknownKeys`/
  `unknownKeyErrors` new) and every value changed (now derived via `getFnHash`).
- Nearest replacements (`registerMionPureFn` lane) live in a different package with
  different semantics (runtime registration vs build-time extraction). The website's
  pure-functions page still documents the removed API (`website/content/5.devtools/1.pure-functions.md`).
- Fix: intentional removals should be listed in a migration/CHANGELOG note per symbol with
  its replacement; anything meant to survive needs a shim.

### R7 [breaking] `@mionjs/router`: persisted-methods/AOT surface removed; two options are dead

- Removed: `./aot` subpath (+ `emitAOTCaches`, `getSerializedCaches`, `AOTCacheMessage`,
  `PlatformReadyMessage`, `SerializedCaches`), the whole methodsCache export family
  (`persistedMethods`, `addToPersistedMethods`, `getPersistedMethod`,
  `getPersistedMethodMetadata`, `getPersistedMethods`, `setPersistedMethods`,
  `resetPersistedMethods`, `loadCompiledMethods`) with only a partial successor
  (`routesCache.getCache()` in core, evidenced in `platform-node/src/mionHttp.spec.ts`),
  and `RouterOptions.aot` (now an excess-property error).
- **`RouterOptions.runTypeOptions` survives in the type but is a silent no-op** — verified:
  zero readers in router src (master spread it into every JIT compile,
  `reflection.ts:239-240`). Users passing compiler options get no error and no effect.
  Remove the option or wire it to the marker/dispatch equivalents.
- Route defs now carry `rtFns` (breaks deep-equality/serialization of def objects —
  every `handlers.spec.ts` expectation had to add it); factories gained 4–6 trailing
  optional marker params (2-arg calls still compile). `AOTCacheError` survives as a
  deprecated stub that is never thrown.
- Router now **statically** imports `@mionjs/run-types` (`lib/reflection.ts:10`); master
  loaded it lazily so AOT mode never touched it. Bundle-size/dep-graph consequence for
  anyone who relied on that.

### R8 [breaking] `@mionjs/devtools`: option/exports drift in the wrapper

- Removed barrel exports: `VIRTUAL_AOT_JIT_FNS`, `VIRTUAL_AOT_PURE_FNS`,
  `VIRTUAL_AOT_ROUTER_CACHE`, `VIRTUAL_PURE_FUNCTIONS`, `AOTCacheOptions`,
  `MionServerConfig`, `PureFunctionsPluginOptions`, `DeepkitTypeOptions`. New
  `MionServerOptions`/`MionServerMappersOptions` are NOT exported from the barrel (only
  reachable via `MionPluginOptions['server']`) — export them.
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
  typechecks and crashes. Drop the member from the type (or mark optional).

### R10 [breaking] `@mionjs/run-types`: headline runtime API removed with no shim

- Gone: `runType`, `reflectFunction`, `createIsTypeFn`, `createTypeErrorsFn`,
  `createPrepareForJsonFn`, `createRestoreFromJsonFn`, `createStringifyJsonFn`,
  `createToBinaryFn`, `createFromBinaryFn`, `createToJavascriptFn`, `createMockTypeFn`,
  `mockType`. Successors exist but under different names AND contracts (sync, marker-driven:
  `createValidate`, `createGetValidationErrors`, `createJsonEncoder/Decoder`,
  `createBinaryEncoder/Decoder`, `createMockData`, `getRunType`).
- Decide: accept as intended breaking change (document per-symbol), or add deprecated
  aliasing wrappers for the migration window.

### R11 [breaking] `@mionjs/run-types`: ~130 secondary exports removed

- All 60 `is*RunType` guards, formatter registry (`registerFormatter`,
  `getFormatterParams`, …), JIT compiler classes (`BaseFnCompiler`, `JitFnCompiler`, …),
  base classes (`BaseRunType`, `AtomicRunType`, …), `JitFunctions` + jit constants,
  mocking utils (`mockString`, `random`, …), ~45 type-only node classes
  (`InterfaceRunType`, …), helper types (`RunTypeOptions`, `SrcType`, `Mutable`, …).
- Mostly power-user surface; in-repo consumers were migrated, external ones were not.
  Needs only documentation (the removal is almost certainly intended), but the PR
  description does not mention the scale.

### R12 [breaking] Surviving names with silently different definitions

- `RunType`: methods-bearing interface (`mock()`, `createJitFunction()`, …) → pure data
  node `RunType<T>` (`id`, `kind`, `children`).
- `TypeFormat`: deepkit `TypeAnnotation`+`Brand` encoding → `__rtFormat*` phantom-prop
  encoding (values typed under one don't satisfy the other).
- `FormatAnnotation`: lost `.formatter`/`.options`.
- Same-name types now exported with **divergent shapes** from `@mionjs/core` vs the
  run-types re-export (`TypeFormatParams`, `StringParams`, `TypeFormatError`, …) — core's
  `types/formats/formatsParams.types.ts` still carries the pre-migration shapes. Align or
  delete core's copies (they no longer constrain anything real).

### R13 [breaking] `@mionjs/type-formats`: value surface deleted; format generics de-parameterized

- Every value export removed (barrels are now type-only + a side-effect registration
  import): format classes (`EmailRunTypeFormat`, …), `*_RUN_TYPE_FORMATTER` consts,
  pattern regexes (`EMAIL_PATTERN`, `URL_REGEXP`, …), mock helpers, `cpf_*` pure fns.
- `FormatEmail<EP>`, `FormatDomain<DP>`, `FormatDomainStrict<D>`, `FormatUrl<P>`,
  `FormatIP<P>`, … are now 0-arity aliases; `FormatEmailPattern`, `FormatUrlSocialMedia`
  and all `DEFAULT_*_PARAMS` presets are gone. Custom-parameterized formats must be
  re-spelled as `TypeFormat<string, 'domain', P>`.
- Additions: `FormatCurrency`, `FormatDomainUnicode`, `FormatDomainPunycode`.

### R14 [breaking] Format param shapes changed — per-bound custom error messages gone

- Old: every bound accepted `number | {val, errorMessage}`, `pattern: {val: RegExp,
errorMessage, mockSamples}`. New: scalar bounds only; patterns must go through
  `registerFormatPattern({source, flags, message, mockSamples})` handles
  (`errorMessage` → `message`, RegExp → string source). `allowedChars`/`allowedValues`
  keep the old form.
- Combined with R23 (message degradation) this is the "custom validation UX" loss lane.

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

### R16 [behavioral] Validation-error vocabulary changed

- `errorData.typeErrors[].expected`: `'object'` → `'objectLiteral'` (`dispatch.spec.ts:400`);
  the `'class'` token no longer asserted anywhere (headers lane); headers validation lost
  its single-error guarantee (`headers.spec.ts` now only asserts `length > 0`). `path`
  segment format is UNCHANGED (verified both sides).
- strictTypes unknown-prop violations now surface as a **second** error (after `isType`
  passes) generated by `unknownKeyErrors` — different content generator than master's
  strict-compiled `typeErrors`; exact entry shape is pinned by no spec on either side.
- API consumers matching `expected` strings break. Document the new vocabulary (or map it).

### R17 [behavioral] strictTypes enforcement drifted in two ways

- Client-side: `client/lib/validation.ts:52-57` only calls `isType`/`typeErrors`; on
  master the strict behavior was baked into `isType` (from server-compiled fns), so
  strict violations failed fast client-side. Now they round-trip to the server. The
  `hasUnknownKeys`/`unknownKeyErrors` fns DO ride the metadata lane
  (`core/routerUtils.ts:192-195`) — the client just never calls them. Cheap fix.
- Server-side fail-open: `dispatch.ts:195-198` returns early when `hasUnknownKeys` is
  absent or noop — a build that failed to emit `huk`/`uke` silently stops enforcing
  strictness instead of erroring (part of the R30 fail-open pattern).

### R18 [behavioral] Custom class serialization: old registration lane is silently dead

- `getJitUtils().setDeserializeFn(...)`/`setSerializableClass(...)` still exist and still
  store entries — core `errors.ts:240-244` itself still registers into them — but
  **nothing reads them** (verified: zero readers outside `jitUtils.ts`). Compiled
  ts-runtypes decoders consult only `registerClassSerializer` (only mion's error classes
  are bridged, `run-types/src/mionClassSerializers.ts`).
- Impact: user classes registered the old way silently decode as plain objects
  (no `instanceof`), with zero warning. Either bridge the registries, or make the old
  setters throw with "use registerClassSerializer", and delete core's own dead self-registrations.

### R19 [behavioral] `isAsync` metadata flipped for inference cases

- `route(() => null)` (no return annotation): `true` → `false`; sync handlers returning
  Promises: now `false` (`handler.constructor.name === 'AsyncFunction'`,
  `mionAdapter.ts:378-380`; `router.spec.ts:359`). Dispatch always awaits so behavior is
  safe, but the flag ships in client-visible methods metadata.

### R20 [behavioral] Nominal format branding silently dropped

- All previously-branded formats (`FormatEmail`, `FormatUUIDv4/7`, `FormatUrl*`,
  `FormatDomain*`, `FormatIP*`, date/time strings, all 12 default number formats) now
  alias ts-runtypes types with `BrandName = never` — `const x: FormatEmail = 'anything'`
  **compiles**. Master's brands rejected plain strings.
- Also breaks the documented server↔client brand contract: new `FormatEmail` is no longer
  assignable to core's `BrandEmail` (which still requires `{brand: 'email'}` on HEAD —
  another R12-style stale twin). Website documents the old behavior
  (`website/content/4.run-types/2.type-formats.md:170-186`).
- This is a silent type-safety regression with zero compile errors flagging it. Needs an
  upstream decision (brand support in ts-runtypes formats) or explicit deprecation of the
  brand story.

### R21 [behavioral] Format validation degraded in granularity, count and messages

- Sub-part paths flattened: email `['localPart','maxLength']` → `['maxLength']`, domain
  `['names', i, 'pattern']` → `['pattern']` (failing part index lost), dateTime `val` now
  carries the splitChar instead of the failing sub-format. Error count short-circuits
  (email missing `@`: 2 errors → 1; dateTime missing splitChar: 3 → 1).
- Built-in human-readable messages collapsed to generic `'pattern'` / `'Invalid pattern'`
  (`'Invalid email format'`, `'invalid URL format'`, `'top level domain can only contain
letters and dots'`, …). Custom messages survive only via `registerFormatPattern({message})`.
- Number formats: invalid param combos (min>max, non-integer multipleOf, …) no longer
  throw at runtime — they are build-time FMT002 diagnostics only; a misconfigured format
  whose diagnostic is ignored **silently validates** (7 deleted tests in
  `numberFormat.runtype.spec.ts`).

### R22 [behavioral] Mock-data regressions (flagged "KNOWN REGRESSION" in-spec)

- Case transforms (lowercase/uppercase/capitalize) not applied by `createMockData`
  (cache-key mismatch; specs post-apply `createFormatTransform` manually,
  `defaultStringFormats.runtype.spec.ts`), domain mocking ignores `allowedValues`
  (falls back to `'example.com'` which fails its own validation,
  `domain.runtype.spec.ts`), and the mock-sample cross-constraint sanity check was
  deleted (`stringFormat.runtype.spec.ts`). File these upstream (ts-run-types) if not
  already; track the mion-side expectation here either way.

### R23 [behavioral] `stripUnknownKeys` / `unknownKeysToUndefined` dropped, replacement undocumented

- Master JIT families `sk`/`ku` (mutating strip ops) are gone; upstream replaced them
  with `createCloneExactShape<T>()` (non-mutating schema-shaped clone,
  `@ts-runtypes/core/src/createRTFunctions.ts:143`). The capability survives under a new
  name/semantics via the star re-export, but nothing in mion docs/specs records the
  mapping — the only silently-dropped operation pair the spec audit found uncommented.

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
- The child no longer receives `MION_COMPILE` (master's contract; core still ships
  `isMionCompileMode()`, now a dead switch — `core/src/utils.ts:53-64`); master-era
  servers gating `listen()` on it never open the port → `serverReady` rejects at
  `waitTimeout`. New contract is `MION_TEST_SERVER_AUTO_START=true` + accepting HTTP on
  the polled port. Document it; delete or repurpose `isMionCompileMode`.

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
  edge/workerd runtimes entirely — master's AOT lane **bundled** the fn code via virtual
  modules, and the documented Cloudflare `aotCaches + buildOnly` deployment flow
  (`website/content/6.platforms/5.cloudflare.md`) has no HEAD equivalent; (c) split
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

### R35 [stale] Dead artifacts to delete (single cleanup sweep)

- `client/src/aotSSR.e2e.test.ts` + `test:e2e:ssr` script (R3).
- `devtools/src/vite-plugin/virtual-modules.d.ts` still declares all deleted
  `virtual:mion-aot/*` + `virtual:mion-server-pure-fns` modules (typechecks then fails at
  build); shipped via the unchanged `./virtual-modules` export. Replace with a
  `virtual:mion/server-mappers` declaration.
- Root `package.json`: `@deepkit/core` + `@deepkit/type-compiler` devDeps, `deepkit-install`
  script. `platform-bun/package.json`: deepkit devDeps (pending R2 decision).
- run-types `package.json`: `browser: {"./persist/jitFnCacheCompiler": false}` maps a
  deleted file; `"deepkit"` keyword.
- Root + core `tsconfig.json`: `"reflection": true`, `emitDecoratorMetadata`,
  `experimentalDecorators` — deepkit-era flags (verify nothing reads `reflection` before
  deleting; ts-runtypes does not).
- `core/src/utils.ts` `isMionCompileMode()` — dead switch (R27).
- eslint rules still validating removed APIs: `no-vite-client`'s `pureServerFn` branch and
  the `pure-functions` rule target `registerPureFnFactory`/`pureServerFn` which no longer
  exist anywhere.
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
  [progress-log.md](../done/progress-log.md) issue #10.

## Verified 1:1 (for fairness)

Package `exports` subpaths of run-types/type-formats unchanged; `FormatNames`/`FormatName`
constants string-identical; validation-error struct (`{expected, path, format?}`) and path
segment format unchanged; email/punycode regex sources byte-identical; router barrel
otherwise identical (`dispatchRoute`, `getExecutableFrom*`, guards, queryBody, context
types); `HeadersSubset` semantics incl. `headersReturn` unions; `hasReturnData`
(void/never/undefined) semantics; 2-arg factory calls; strictTypes accept/reject outcomes
(four dispatch specs byte-identical); RpcError JSON wire envelope (after in-migration fix
`4246025`); client barrel byte-identical.

## Suggested triage buckets

1. **Before merge/publish:** R1, R3, R9 (runtime guard), R2 (decision at minimum), R5
   (decision: accept+document vs upstream fix), R31 (allow-list — small change).
2. **Fast follow:** R35 (cleanup sweep), R7 (`runTypeOptions` removal), R8 (option
   warnings + barrel exports), R17 (client-side strict check), R18 (dead registries),
   R30 (fail-closed markers), R32 (inline manifest entries).
3. **Documentation wave** (extends [examples-and-website-refresh.md](examples-and-website-refresh.md)):
   R4, R6, R10–R14 removal notes + replacements, R15 lockstep-upgrade note, R16 vocabulary,
   R21 format-error changes, R24, R26–R29, R36.
4. **Upstream (ts-run-types) candidates:** R5(a) `@nonEnumerable`-on-required,
   R20 (format brands), R21 (sub-part paths/messages), R22 (mock regressions — some
   already filed per progress log).
