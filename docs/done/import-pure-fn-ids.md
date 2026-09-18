---
type: feature
spec: full-plan
status: ready
created: 2026-09-17
---

# Pure functions are identified by an imported id, never by a hand-written name

## Problem

A pure function is registered under a string the author invents, `'ns::name'`, and a body that
uses another pure fn repeats that string: `utl.getPureFn('rt::canonicalJson')`. The registry
(`packages/run-types/src/runtypes/rtUtils.ts`) is an import system, `usePureFn` / `getPureFn` /
`hasPureFn` / `getCompiledPureFn` are its imports, but the specifier carries no location, so the
compiler can verify a key exists and nothing more. Four things follow from that one gap:

- Two registrar families exist for one job: the named lane (`registerPureFn('ns::name', fn)`,
  literal key, slots fixed, cannot be wrapped by a library) and the anonymous lane
  (`registerAnonymousPureFn(fn, hash?)`, content-hash id injected at build time, wrappable).
  `packages/run-types/src/runtypes/pureFn.ts:169-240`.
- Built-ins are a special namespace known by name on both sides: `isBuiltinPureFnNamespace`
  (`pureFn.ts:50`), `builtinPureFnNamespaces` (`purefunctions/index.go:103`),
  `isBuiltinPureFnKey` (`resolver/dispatch.go:744`), `BUILTIN_PURE_FN_NAMESPACES`
  (`packages/router/src/lib/remoteMethods.ts:116`), the hollow script's `BUILTIN_NS` regex, and
  the Go emitters hardcode both the names and a repo-relative source path per built-in
  (`typefunctions/purefn_aliases.go:51-52`, `unknownkeys_shared.go:17`, `validationerrors.go:34`,
  `walker.go:622`, `formats/structural/arrayformat.go:56-57`, the three `formats/*/shared.go`).
- `findCompiledPureFn` (`rtUtils.ts:180`) resolves a bare name by suffix search across every
  namespace, a lookup no import system has, with zero TS callers.
- Mion's batch mapper name lane (`inputFrom(order, 'toUserId')`, `packages/client/src/batch.ts:100`)
  is a second hand-written naming contract, `mionjs::<name>`, layered on the first.

## Plan

### 1. The id

One rule, computed in Go only, by one function:

    <package name>/<path from the package root, extension dropped>#<name>
    @mionjs/run-types/src/runtypes/pure-fns-utils#newRunTypeErr
    @acme/text/src/slug#slugify

- `<package name>` and the root come from the nearest `package.json` carrying a `name`.
  `lookupPackageNameUpward` (`internal/compiler/marker/marker.go:913`) already finds both and
  returns only the name: refactor it into an exported `PackageOfFile(filePath, fs) (name, rootDir)`
  keeping the `packageNameCache`, and keep `packageNameForFile` as a thin wrapper. A file under a
  package.json with no `name` (a private project) keeps that directory as its root and drops the
  package prefix; with no package.json at all, the path is relative to the session working
  directory. Anchoring at the package root rather than the working directory is what keeps a
  server build reading a client project on the same id the client's own build computes.
- `<name>` is the identifier a `const` / `let` / `var` declaration binds the call result to when the
  registrar call (unwrapped through parentheses, `as`, `satisfies`) is that declaration's initializer.
  Any other position (a callback passed straight to a wrapper such as `inputFrom(o => o.id)`) gets
  `CodeHash(code)` (`purefunctions/hash.go:40`), the code-only hash that already keys the
  override lane. A body edit therefore changes a nameless id; both sides of a build regenerate
  together, and a stale id elsewhere is a miss, never a different function.
- `BodyHash(namespace, functionName, code)` (`hash.go:28`) becomes `BodyHash(id, code)`. Every fn
  hash moves once.
- The id is the registry key everywhere. No `::` split survives (grep list in §7).

### 2. The public API (`packages/run-types`)

`packages/run-types/src/runtypes/pureFn.ts`: two registrars, the two anonymous ones deleted.

    export type PureFnId<ID extends string = string> = ID & {readonly __rtPureFnIdBrand: true};

    export function registerPureFn<F extends PureFn, ID extends string = string>(
      fn: PureFunction<F> | null, id?: InjectPureFnId<F> & ID): PureFnId<ID>;
    export function registerPureFnFactory<F extends PureFnFactory, ID extends string = string>(
      createPureFn: PureFunctionFactory<F> | null, id?: InjectPureFnId<F> & ID): PureFnId<ID>;

- The `id` parameter is the slot the transform fills (today's `hash?`). When source passes a
  literal-typed id (the generated built-in constants, §5), `ID` infers the literal and the `.d.ts`
  carries it. When the transform injects, `ID` is `string`.
- `registerCore` returns the id. Rules, in order: an entry tuple registers through `initFromTuple`
  and must register `id` (else the existing loud error); a live function with an id is the
  dev-override / no-transform fallback and registers directly; `null` with an id is a hollowed
  registration for ANY package, inert, nothing cached (the `HOLLOW_PLACEHOLDER` and the
  namespace check go); `id === undefined` throws "the build plugin must process this file" naming
  the caller. `assertValidPureFnId` and `isBuiltinPureFnNamespace` are deleted.
- `markers.ts`: `InjectPureFnHash<F>` (`:282`) becomes `InjectPureFnId<F>`, same
  `string & {brand?: F}` shape, doc rewritten. `PureFunction` / `PureFunctionFactory` docs drop the
  `'ns::id'` wording. `index.ts:108-121` exports follow.
- `rtUtils.ts`: the four tracked lookups take `CompTimeArgs<PureFnId>`; `findCompiledPureFn` is
  deleted; `pureFnKey` (`:312`) is deleted; `addPureFn` asserts a non-empty id only.
  `getPureFnByKey` / `hasPureFnByKey` stay as the untracked door, unchanged.
- `types.ts`: `PureFunctionData` replaces `namespace` + `fnName` with `id`;
  `PureFunctionsCache` doc. `entryTuple.ts:790-808 registerPureFnTuple` stops splitting the key;
  `PureFnRecord` doc.
- Built-in registration files (`runtypes/pure-fns-utils.ts`, `runtypes/circular-pure-fns.ts`,
  `formats/string/string-formats-pure-fns.ts`, `formats/string/credit-card-pure-fns.ts`,
  `formats/datetime/dateTime-pure-fns.ts`): every registration becomes
  `export const newRunTypeErr = registerPureFnFactory(function () {...}, newRunTypeErrId)` with the
  id imported from the generated constants file (§5). Bare-statement registrations get a binding
  (the id needs a name), the `pf_` prefix is dropped so ids read as the fn name, and every
  intra-built-in reference (`utl.getPureFn('rtFormats::isDateString')` and the 24 like it) becomes
  `utl.getPureFn(isDateString)` on the imported binding. The two ordinary-code helpers in
  `credit-card-pure-fns.ts:285-295` use the binding the same way.

### 3. Go extractor: one lane (`internal/cachegen/purefunctions`)

- `walker.go`: delete the named lane (`isNamedPureFnCall`, `firstArgIsPureFnIdLiteral`,
  `extractNamed`, the callee-name constants at `:314-318`). The anonymous lane in `anonymous.go`
  (`isAnonymousPureFnCall` discovering the form-marker and inject-marker parameter positions)
  becomes the only lane; rename it (`isPureFnRegistration`, `extractRegistration`) and rename
  `AnonymousNamespace` out of existence. `Entry` replaces `Namespace` + `FunctionName` with
  `ID`; `Key()` returns it; `Lane` is dropped (`Form` stays).
- `extractRegistration`: extract the function literal as today (`comptimeargs.CheckLiteralFunction`),
  compute `code`, compute the id per §1 (`bindingNameOf(call)` for the name, `CodeHash` otherwise).
  If the id argument is ABSENT: `HashInjectPos` / `HashInjectText` as today
  (`walker.go:590-598`, `TrailingArgText` unchanged, it is shared with the batches lane). If it
  is PRESENT: resolve it to a string (`comptimeargs.ResolveLiteralString`, then the exported
  cross-module const trace, `comptimeargs.go:604 resolveConstInitializerCrossModule`, made
  public) and compare with the computed id; a mismatch is the new `PFE9014` (§7). This is what
  keeps a hand-pasted or stale id from creating a second key.
- `buildPureFnEntry` order becomes: deps (§4) → code with lowering (§4) → `BodyHash(id, code)`
  → purity with the exempt set (§4).
- `ExtractFromProgramCached` dedup and `PFE9004` collision are unchanged, keyed by id: two
  same-named bindings in one file with different bodies collide there.
- `override.go`: `ExtractOverrideFn` builds its id with the nameless rule (`<pkg>/<path>#<CodeHash>`),
  `OverrideNamespace` goes. `typefunctions/override.go:82` uses `entry.Key()`; `AssertOverrideCfn`
  (`:116-140`) stops prefix-scanning `cfn::` and takes the set of override ids from
  `sess.overrideEntries` instead.

### 4. Referencing another pure fn: resolve by import, lower to a literal

`deps.go:162 resolveDepArg` gains one case and returns, per resolved dep, the argument node to lower:

1. A string literal (typed through a cast) resolves as today.
2. A factory-local `const` chain resolves as today (`resolveDeclLocal`).
3. NEW: an identifier (or `as`-wrapped identifier) whose symbol, after
   `comptimeargs.ResolveImportAlias`, declares a `VariableDeclaration` in a SOURCE file of this
   program whose unwrapped initializer is a registrar call (recognised with the same
   `paramHasMarker` / `pureFnFormMarker` brand checks the extractor uses) resolves to the id
   computed from THAT declaration's file and binding name, by the same function as §1. This is
   the `import {slugify} from './slug'` case, in-program only.
4. NEW: an expression whose TYPE is a string-literal type resolves to that literal. This is the
   generated built-in constants through a `.d.ts` (`export declare const newRunTypeErr:
   PureFnId<'@mionjs/run-types/...'>`), and it is the hook the later cross-package step reuses.
5. Anything else is `PFE9013`, reworded (§7). A binding declared only in a `.d.ts` with no literal
   type lands here with a message saying pure fns from a published package are not referenceable
   yet.

The `findCompiledPureFn` branch in `handleCall` (`deps.go:119-126`) is deleted.

Lowering: `striptypes.go`'s `textRange` gains a `Text` field. `spliceRanges` (`:257`) writes `Text`
in place of a replacement range, merges only deletion ranges, and asserts a replacement never
overlaps another range (a dep argument and its `as PureFnId` cast are adjacent, not overlapping).
`pureFnCode(sourceFile, fnNode, wrap, lowerings)` passes the dep-argument spans with their
quoted ids, so `Entry.Code` holds `utl.getPureFn('@acme/text/src/slug#slugify')` and no free
identifier. The hash then covers the lowered body, so identical bodies referencing the same
imports hash the same.

Purity: `checkPurity(sourceFile, fnNode)` (`purity.go:39`) takes an exempt node set; the
`KindIdentifier` arm (`:128-149`) skips identifiers inside an exempt node. `api.go CheckPurity` and
`resolver/scan.go:1762` pass nil. Everything else about `PFE9011` stays: an imported symbol used
anywhere but a tracked lookup argument is still a capture.

### 5. Built-ins on the same rule: a generated ids table on both sides

`cmd/gen-builtin-purefns` (`main.go:66-121`) keeps extracting the five built-in files and now emits
THREE outputs from one run:

- `internal/cachegen/purefnids/ids.generated.go`, a NEW leaf package with no imports: one Go const
  per built-in (`NewRunTypeErr = "@mionjs/run-types/src/runtypes/pure-fns-utils#newRunTypeErr"`),
  `Has(id) bool`, and `ByName(name) (string, bool)` for the format-derived names. Being a leaf, both
  `purefunctions` and `typefunctions` can import it, which removes the "cannot import
  builtinpurefns" cycle noted at `index.go:163`.
- `packages/run-types/src/runtypes/pure-fn-ids.generated.ts`: one `export const <name>Id = '...'
  ;` per built-in (literal type, so the `.d.ts` carries it). Same shape as `cmd/gen-ts-constants`
  (`main.go:70-119`).
- `builtinpurefns/table.generated.go` as today, keyed by id (bodies stay in Go source; moving them
  out is its own work).

The generator verifies every explicit id in the sources equals the computed one and fails with
"regenerate" otherwise, so a moved file or renamed binding fails `codegen all --check` instead of
splitting a key. Register the two new outputs in the `builtinpurefns` row of `scripts/miondevx.mjs:173`.

Emitters: `EmitContext.UsePureFn(namespace, fnName, filePath)` (`typefunctions/emitter.go:449`)
becomes `UsePureFn(id string)`; `Walker.AddPureFnDependency(id)` (`walker.go:517`);
`protocol.PureFnDep` becomes `{ID string}` (`protocol.go:756`, `FilePath` only ever fed the lazy
expansion, which cannot reach a file outside the program, `walker.go:246`). Every call site listed
in the exploration passes a `purefnids` constant: the seven core sites (`unknownkeys_shared.go:208,
211, 286`, `validationerrors.go:602`, `unknownkeys_errors.go:95`, `walker.go:635`,
`arrayformat.go:78`), `formats/emit.go:94 PureFnAlias(ctx, id)`, the three `shared.go` wrappers,
and `dateFormatPureFn` / `timeFormatPureFn` (`datetime/date.go:28`, `time.go:23`) which return a
name today and return `purefnids.ByName(name)` instead. Delete every `*PureFnFilePath` /
`uniqueItemsPureFnPath` constant, `corePureFnNamespace` (both copies), `formatsPureFnNamespace`,
`circularGuardPureFnKey`, and `isBuiltinPureFnDep` (`purefn_aliases.go:58`, replaced by
`purefnids.Has`). `pureFnAliasFor` keys on the `#` suffix of the id.

### 6. Resolver and module layout (`internal/compiler`)

- `resolver/dispatch.go:679 serveBuiltinPureFns`: demand is every soft dep `builtinpurefns.Has`
  knows, plus, on a `KindTypeFn` entry, every soft dep it does not know (type-fn bodies only ever
  reach built-ins through §5 constants, so an unknown one is a stale table). Delete
  `isBuiltinPureFnKey` and `splitBuiltinPureFnKey`; the `PFE9012` args become `[id]`.
- `purefunctions/index.go`: delete `builtinPureFnNamespaces` / `IsBuiltinPureFnNamespace`;
  `ValidatePureFnDependencies` skips ids `purefnids.Has` accepts and builds keys from `dep.ID`.
  `render.go:387` likewise. The five `builtinpurefns.Has` filters (`render.go:249, 278, 296`,
  `apigen.go:348`, `dispatch.go:1369`) keep their meaning, now keyed by id.
- `entrymodules.go:238 ModuleName`: for `KindPureFn` split the id at its last `#`, split the left
  half on `/`, escape each segment (`escapeModuleSegment`, with `@` added to the safe set), and
  append the escaped name: `pf/@mionjs/run-types/src/runtypes/pure-fns-utils/newRunTypeErr`.
  `BindingName` needs no change. `Report`'s `Module` follows.
- `marker.go:67-74, 141-143`: `KindInjectPureFnHash` / `DefaultInjectPureFnHashName` become
  `KindInjectPureFnId` / `DefaultInjectPureFnIdName = "InjectPureFnId"`.
- Batch mapper lane (mion): delete `constants.ServerMapperNamespace` (`constants.go:455-460`), the
  string-overload branch in `requestbatch/mappings.go:175-253`, and the prefix filter in
  `rpcgen.go:212-229 referencedMapperKeys` (every mapping is inline now, so every key needs its
  module). `protocol.go:508` doc.
- `cmd/gen-sourcerewrite-fixtures/main.go:123-126, 155-162, 193-198`: the corpus sources become
  `registerPureFnFactory(() => 1)` bound to a const, with the new binding / `ImportFrom` strings;
  regenerate `sourcerewrite/testdata/*.json`.

### 6b. One transform, in Go, shared by the CLI and every bundler adapter

Nothing in this plan adds a JS-side rewrite. The three source changes a build makes are all
`protocol.Replacement`s the Go extractor produces and `sourcerewrite` applies inside `OpTransform`
(`resolver/dispatch.go:1203-1218`, fed by `purefunctions.Replacements` at `:1374`), which is the
one path both consumers already share: `mion compile` dispatches `OpTransform` on the same session
(`batchcompile/compile.go:152-161`) and `@mionjs/devtools` calls it through the resolver client.

- Factory argument to entry-module binding: unchanged (`module.go:132 Replacements`).
- Id injection into the trailing parameter: the existing `HashInjectPos` / `HashInjectText`
  point insertion (`module.go:159-168`), with the id as its text.
- Lowering of imported ids inside a body: not a source rewrite at all. It happens in `Entry.Code`
  at extraction (§4), which is what both the entry-module emitter and the built-in table read.

So the CLI, the Vite / Rollup / webpack / esbuild / Bun / Next adapters and the in-process vitest
transform get the new behaviour from the one Go change, and `compile-cli-mion.test.ts` gets a case
proving a pure fn with an imported id compiles and runs through `mion compile` (Tests below).

### 7. Diagnostics, protocol, devtools, scripts

- `diagnostics/messages.go:263-302`: reword `PFE9004`-`PFE9013` (no `'ns::fn'`, no
  `registerPureFnFactory('...')` two-arg snippets; say "a pure-fn registrar"). `PFE9012` renders
  `{0}` only. `PFE9013`: "must be a pure-fn id: the value a registrar returned, imported from a file
  in this build, or a string literal". New `PFE9014 CodePureFnIdMismatch` (`LevelError`,
  `codes_purefn.go`): "explicit id `{0}` does not match this registration's location `{1}`; remove
  it or regenerate". `prose.go:206` example updated. Regenerate the catalog (`codegen diag`).
- `internal/protocol/protocol.go`: `PureFnDep{ID}`; `PureFnSite` drops `Lane`, `Key` doc. Mirror
  in `packages/devtools/src/core/protocol.ts:245-292` (`PureFnSite.lane` removed, `key` and
  `BatchMapping.mapperKey` docs).
- `packages/devtools/src/core/unplugin.ts:1216`: the textual gate keeps `registerPureFn` and
  drops `registerAnonymousPureFn`. `lint/prefilter.ts:34` and `vite/sfcTransform.ts:53` are
  already correct.
- `scripts/core/hollow-builtin-purefns.mjs`: match `registerPureFnFactory(<factory>, <id>)`, null
  the FIRST argument and keep the id; drop `BUILTIN_NS` (every registration in a listed file is a
  built-in). `BUILTIN_FILES` (`:34-39`) lists four files while the generator lists five: keep
  `credit-card-pure-fns.js` un-hollowed on purpose (its ordinary-code helpers at `:285-295` read
  the registry at import time, which the demand lane never serves) and say so in the comment that
  today claims the two lists are in sync.
- Every `::` split outside the untracked door goes: `entryTuple.ts:793`, `rtUtils.ts:181, 313`,
  `pureFn.ts:51, 58, 118`, `mionAdapter.ts:154, 190`, `remoteMethods.ts:123-150`,
  `clientMethodsMetadata.ts:27, 192-195`, `client/src/batch.ts:124, 131`, and the Go list in the
  exploration (`quote.go:46`, `typefunctions/module.go:796`, `requestbatch/mappings.go:253`,
  `rpcgen.go:218`, `entrymodules.go:248`, `dispatch.go:755`, `index.go:156`, `render.go:387`).

### 8. Mion (`packages/core`, `router`, `client`, `test-server`)

- `core/src/runtypes/inputMappers.ts`: delete `INPUT_MAPPER_NAMESPACE`, `inputMapperKey`,
  `allowInputMapper` and the name lane paragraphs; keep `allowedMapperKeys` (the gate),
  `registerInputMapperTuple(id, tuple)` (the alias `registerPureFnUntracked` becomes
  `(tuple, id)` order), `getInputMapper`, `hasInputMapper` (fix its doc, there is no manifest
  re-read). `core/src/types/general.types.ts:192 PureFnsDataCache` becomes a flat
  `Record<PureFnId, SerializablePureFunction>`; `mionAdapter.ts:130-165 addSerializedJitCaches`
  loops it flat; `resolveCompiledPureFn(id)`.
- `router/src/lib/remoteMethods.ts:110-152 serializePureDeps(id, ...)`: no split; the built-in skip
  becomes "the id's package is `@mionjs/run-types`" (a prefix test on the id itself, replacing the
  hand-synced namespace set), reason unchanged.
- `client/src/batch.ts:87-146 inputFrom`: only the inline overload, `(source, mapper, id?)`; the
  `'::'` checks go; `InputFromRef` (`core/src/types/pureFunctions.types.ts:15-32`) keeps
  `mapperKey` and drops `namespace` / `fnName`. `client/src/lib/clientMethodsMetadata.ts` stores
  `p <id>` flat.
- `test-server/src/test-server.ts:20-38` and the `flow/*` batch fixtures: the two named mappers
  become inline mappers at their client call sites.

## Tests

Go (`go -C ts-go-runtypes test ./internal/... ./cmd/...`). Every test that hardcodes `rt::` /
`rtFormats::` / `mionjs::` / `cfn::` (27 files at the time of writing) moves to ids, most through
the `purefnids` constants. New or reshaped, by package:

- `purefunctions/walker_test.go`: one lane; id from a bound const; nameless call gets the
  `CodeHash` id; wrapper and renamed-import call sites still extract (keep
  `TestExtract_BrandedWrapperCallSite`, `_RenamedImport`); explicit id equal to the computed one
  is accepted; explicit mismatch is `PFE9014`; injection text with and without a trailing comma
  (`HashSlotPaddingAcrossOptionalGap` kept); deterministic order.
- `purefunctions/deps_test.go`: imported binding in-program resolves and is lowered in `Code`;
  factory-local const still resolves; string-literal-typed import resolves; a `.d.ts`-only binding
  without a literal type is `PFE9013`; `findCompiledPureFn` cases deleted.
- `purefunctions/purity_test.go`: the lowered argument is not a capture; the same import used
  outside a lookup still is (`TestPurity_ImportedSymbol_StillClosureViolation` kept).
- `purefunctions/striptypes_test.go`: replacement splice; replacement adjacent to a deleted `as`.
- `purefunctions/hash_test.go`: id affects the hash (replaces the namespace / fnName pair).
- `purefunctions/module_test.go`, `entrymodules_test.go`: `ModuleName` encoding for a scoped
  package id, `Report.Module`, `Replacements.ImportFrom`.
- `purefunctions/index_test.go`: validation skips `purefnids` ids; user miss still `PFE9012`.
- `purefnids` (new): every table key has a constant and vice versa; `ByName` is unique; ids parse
  back to (package, path, name).
- `resolver`: `builtin_purefns_serving_test.go`, `builtin_purefns_delivery_test.go`,
  `pure_fn_dep_validation_test.go`, `anonymous_purefn_test.go` (renamed), `overrides_test.go`,
  `rpcgen_test.go`, `batch_test.go`: same scenarios, id keys; the name-lane cases in
  `requestbatch/batches_test.go` deleted.
- `sourcerewrite`: regenerate fixtures with `gen-sourcerewrite-fixtures`.
- Marker rule (`ts-go-runtypes/CLAUDE.md`, Marker test coverage): the wrapper tests exercise the
  forwarded-marker shape and the direct shape as paired cases, for both registrars.

JS (`pnpm test`):

- `packages/run-types/test/features/pureFn.test.ts`: both registrars return the id; injected id
  round-trips through `getPureFn(id)`; `null` with an id is inert for a user package too;
  `undefined` id throws the plugin message; a factory referencing an imported id runs at runtime.
  `anonymousPureFn.test.ts` folds in: nameless callback gets a hash id, identical bodies in one
  file dedup, `getPureFnByKey` untracked. `entryTuplePureFn.test.ts` on the flat record.
  `countEnumKeys.test.ts` on the renamed binding. `test/third_party/*` on `InjectPureFnId` wrappers.
  `test/fuzz/type/creditCardLuhn.unit.test.ts` and `suites/mocking/mockCreditCard.test.ts` import
  the ids.
- `packages/devtools/test`: `pure-fns-cache.test.ts` (module layout, replacements, deps from an
  import, `PFE9013` / `PFE9014`), `pure-fns-anonymous.test.ts` folded in, `pure-fn-report.test.ts`
  (no `lane`), `hollow-builtin-purefns.test.ts` (new call shape, id preserved, credit-card
  exception), `transform-modes.test.ts:185`, `hmr-signals.test.ts:62-90`, `batch-report` /
  `batch-diagnostics` (`mapperKey` matches the id shape), `bench-lane-contracts.test.ts:379`.
  `compile-cli-mion.test.ts`: a server pure fn referencing an imported id compiles through
  `mion compile` with no bundler, the emitted module carries the literal, and the compiled server
  answers; this pins that the CLI and the plugin share the one Go transform.
- Mion: `core/src/runtypes/inputMappers.spec.ts` (tuple lane, allow-list negatives, no name lane),
  `mionAdapter.spec.ts`, `router/src/batches.spec.ts:761-886` (name cases removed, unregistered id
  error message), `remoteMethods.spec.ts` / `formats.spec.ts` (flat cache), `client/src/batch.spec.ts`
  (`mapperKey` shape, name overload gone), `router/src/batches.spec.ts` publicMessage check.

## Docs

- `container/website/content/02.runtypes/02.guide/09.pure-functions.md`: "Registering a Pure
  Function" shows the two registrars with no id, the returned id, and `utl.getPureFn(slugify)`
  from an import; "Anonymous Pure Functions" becomes a short note inside it (a helper you do not
  assign to a name is identified by its body); the wrapper example stays; the untracked-door block
  stays. `08.compiler-markers.md:55-89`: the `InjectPureFnId` card, marker count checked.
  `01.rpc/03.client/03.batch.md:30-40`: the by-name table row and its code-import go, the prose
  says the mapper is written inline.
- `packages/examples/src`: `guide/custom-pure-fn.ts`, `custom-pure-fn-direct.ts` (no id),
  `guide/anonymous-pure-fn*.ts` merged into a "wrapper" example on `InjectPureFnId`,
  `run-types/pure-functions.ts`, `introduction/pure-functions-examples.ts` (name-lane block
  removed). The root `typecheck` compiles them, so drift fails CI.
- Source comments that describe the old shape: `pure-fns-utils.ts:8-13`, `pureFn.ts` header,
  `markers.ts` marker docs, `rtUtils.ts:162-168`, the hollow script header, `builtinpurefns.go`
  header, `purefunctions/api.go`, `ts-go-runtypes/CLAUDE.md` and `packages/devtools/CLAUDE.md`
  where they name `rt::` / `rtFormats::` or the anonymous lane.
- `CHANGELOG.md`: breaking, listed per package: run-types (`registerAnonymousPureFn*` and
  `findCompiledPureFn` removed, `PureFnId` shape, `InjectPureFnHash` renamed,
  `CompiledPureFunction.id`), core (`allowInputMapper`, `inputMapperKey`,
  `INPUT_MAPPER_NAMESPACE` removed, flat `PureFnsDataCache`), client (`inputFrom` name overload
  removed). PR labels: `pre-publish-e2e` (public API) and `website` (docs and examples).

## Fuzzing

Two cheap oracles, Go side, seeded loops in the packages they test:

- Id and module-name injectivity: random (package, path, name) triples, including `@scope/name`
  and names that are hashes, must give distinct `ModuleName` results that round-trip and
  `BindingName` results that are valid identifiers.
- Lowering round-trip: random factory bodies with N tracked lookups on imported ids (and noise:
  the same identifiers inside strings, comments, and property names) must produce `Code` that
  parses as JS (`parseCheckEntries` in `cmd/gen-builtin-purefns/main.go:135` is the parser to
  reuse), contains exactly N quoted ids, and no remaining reference to the imported identifiers.

## Out of scope

- Delivering a package's pure-fn bodies to consumers through a shipped table, and hollowing any
  package other than run-types. Resolution case 4 in §4 is the hook it will use.
- Moving the bodies table out of Go source into a build artifact.
- The untracked `getPureFnByKey` / `hasPureFnByKey` door and the batch security gate, unchanged.
- The fetched-metadata lane beyond the flat cache shape.

## Done when

- `registerPureFn` and `registerPureFnFactory` are the only registrars, take no name, and return a
  `PureFnId`; the anonymous registrars, `findCompiledPureFn`, every `::` split, every "built-in
  namespace" set (TS, Go, router) and every hardcoded built-in source path in the emitters are gone.
- A pure fn in one file references a pure fn from another file of the same build by importing its
  id, the emitted body carries the literal, and purity still rejects any other captured import.
  Proven by Go extractor tests and by a devtools acceptance test that runs the emitted module.
- Built-ins register with generated ids, the emitters use generated constants, and
  `pnpm miondevx core codegen all --check` fails on a moved built-in file until regenerated.
- The batch mapper name lane is gone; inline mappers work end to end (`test-server` fixtures).
- Consumer bundles still receive built-in bodies on demand and the dist stays hollowed.
- No JS-side rewrite exists: every source change is a Go `Replacement` applied by `OpTransform`,
  and `mion compile` produces the same output as the bundler adapters for the same source.
- Docs, examples and the breaking-change record match; `pnpm run lint`, `pnpm run format`, `pnpm test`,
  `go -C ts-go-runtypes test ./internal/... ./cmd/...`, `pnpm run check:builds` and
  `pnpm miondevx core codegen all --check` pass.

## What shipped

Built as planned. Seven things the plan did not spell out, each decided while building:

- **An unnamed package still anchors the id.** The plan sent every file under no NAMED package to
  a path relative to the working directory. That makes one pure function two ids when two builds
  read one project from different directories (a mion server build reading its client project is
  exactly that shape). A `package.json` with no `name` now anchors the path at its own directory;
  only a file with no `package.json` above it falls back to the working directory.
- **`PFE9004` is an in-file collision now.** With ids naming a location, two files can no longer
  claim one id, so the duplicate-registration diagnostic fires where it still can: one file, one
  binding name, two scopes, two bodies.
- **Two identical batches in two files get two ids when they carry an inline mapper.** The mapper
  belongs to the file it is written in, so the two batches genuinely reference different mappers.
  A batch with no mapper still collapses to one id, as before.
- **A hollowed registration drops its id with its body.** The dist hollow step replaces the whole
  argument list with `null`, so the generated ids module has no used export left and tree-shakes
  out of a consumer bundle. That is what keeps the ~11 KB saving whole.
- **`inputFrom` rejects a string mapper by name.** The retired name lane gets its own message
  ("takes the mapper itself, written inline") instead of a confusing one, since that is the one
  migration a caller will hit.
- **Two test files renamed, three folded in.** `third-party-anonymous-*.test.ts` became
  `third-party-wrapper-*.test.ts` (the lane they covered is now the only lane),
  `anonymousPureFn.test.ts` folded into `pureFn.test.ts`, and `pure-fns-anonymous.test.ts` into
  `pure-fns-cache.test.ts`.
- **The breaking change is recorded in the commit, not in `CHANGELOG.md`.** That file is generated
  by git-cliff from commit messages, so the per-package list of removals rides the feature commit's
  `BREAKING CHANGE:` footer and reaches the changelog on the next release cut.

Both fuzz loops shipped in `internal/cachegen/purefunctions/fuzz_ids_test.go`, and the seeding
policy they share with the convert sweeps moved into `internal/testfixtures/fuzzseed.go` so the two
packages derive a seed from one place.
