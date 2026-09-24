---
type: chore
spec: full-plan
status: done
created: 2026-09-24
---

# Remove binary serialization from runtypes

## Problem

`createBinaryEncoderFn`, `createBinarySizerFn` and `createBinaryDecoderFn` (the `toBinary` / `fromBinary` families, tags `tb` / `fb`) cost a lot and give nothing back:

- Nothing in mion uses them. The router and client dropped binary long ago; only the generated id tables still list the two families.
- They are slower: 2 to 4.5 times slower than every JSON strategy.
- Compact JSON already saves most of the wire size.
- They still cannot send real bytes (`Uint8Array`, `Buffer`), the one case where binary would win.

Remove all of it: public factories, override functions, the runtime serializer, the Go families, the size estimate, the `binarySizing` option, the `respectBinarySize` mock option, the `TB` / `FB` diagnostics and lint rules, tests, fuzz lanes, benchmarks and docs. No alias, no migration message, no deprecation step: breaking changes are fine here.

Never add a test that checks the removed thing is gone or still refused (no "binarySizing is rejected" test, no "createBinaryEncoderFn is not exported" test). Removed code leaves no tests behind.

## Plan

Land Go and JS together: the entry tuple's estimate slot, the CLI flags and several TS files are generated from Go.

### 1. Go resolver (`ts-go-runtypes/`)

- Delete in `internal/cachegen/typefunctions/`: `binary_to.go`, `binary_from.go`, `binary_min_bytes.go`, `binary_size_estimate.go`, `binary_shared.go`, `temporal_binary.go`, `union_flat_binary.go`, and tests `binary_min_bytes_test.go`, `binary_size_estimate_test.go`, `binary_optional_empty_body_test.go`.
- GOTCHA: the typefunctions test package gets its `formats/all` blank import only from the two deleted test files (`:8`); `noop_types_test.go` relies on it. Move the import into a surviving `_test.go` file.
- Dead code left in shared files, delete: `emitter.go:205-216` (`SuppressInlineReserve`), `walker.go:126-128, 208` (`suppressInlineReserve`, `factNoopToBinary`), `union_flat.go:38-61` (the two binary error vars), `kinds.go:141-149` (`hasPatternKeyFlag`), `noop_types.go:834-968` (`isNoopForToBinary` and helpers), `class_serializer.go:147-197` (binary wrappers; keep `sanitizeIdent` and the JSON wrappers), `diag_codes.go:163-213`, `alwaysthrow_message.go:29-32`.
- `families.go:44-46`: drop the two rows; `families_test.go:7-9` count 18 → 16.
- `module.go:87-91` (`RenderOpts.SizeEstimate`) and `:521-527` (tail slots 10 and 11 of every `tb` entry). Fix the comments at `:916-931`. Must land with the TS entry tuple change (section 3).
- KEEP: `bigint_wire.go` (JSON restore and validate use it), `mergedPropSurvivingGuard`, `unionDecodeThrow`, `buildFlatLayout`, `strippedPropertyDrop` and the other shared union helpers; `reflection/subkind.go` `BinaryRootGlobals` / `IsBinaryViewShape` (those are about `ArrayBuffer` as a data type, not the codec).
- Formats: `formats/registry.go:97-123` (four binary interfaces); `numeric/numberformat.go:112-237` (binary emit + int8/16/32 ladder) and `minSafeInteger` / `maxSafeInteger` `:21-24`; `numeric/bigintformat.go:96-150`; `numeric/shared.go:14-25`. Keep every `EmitValidate*`, `ValidateParams`, `readBigIntParam`. In `numeric_test.go` delete `TestNumberBinary_IntegerWidthLadder`, `TestBigIntBinary_RangeSelection`, trim `:287-291`.
- `operations/operations.go:80-81`: delete the `toBinary` / `fromBinary` rows. fnHashes are not positional, no other hash moves. `fnhash_test.go:9-15` count down by 3 (tb, fb, armed tb); `TestRejectCircularForksHash` (`:78-98`) needs another unguarded example op; `:129` `ByFnKey` case.
- `constants/constants.go:97-106` (two `CacheModules`), `:501-518` (`DefaultSize*`). KEEP `Version` / `BinaryStamp` (the executable).
- `diskcache/fingerprint.go:25-30, 48, 67-74`: drop the size inputs and bump the key `"v12"` → `"v13"` (`:56`).
- `diagnostics/codes_runtype.go:77-103, 192-193, 216-217` and every TB / FB entry in `messages.go`. Reword the shared "JSON or binary" detail texts and `codes_override.go:17,41`.
- `cmd/mion/main.go` (help `:70`, fields `:146-149`, flags `:189-196`, copies `:315-318`, `:428-431`), `buildconfig.go:31-34, 55-58, 79-82, 123-135`, `config.go:128-131, 164-177`: delete `--binary-sizing-*` and the `binarySizing` tsconfig key. Do NOT add it to `removedPluginKeys`.
- `resolver/resolver.go:96-102, 289-292`, `render.go:47-52`: size options.
- `cmd/gen-fn-hashes/gen.go:191`: comment text.
- Comment tidy (grep `binary`): `families.go`, `noop_types.go:42`, `walker.go:480,597`, `override.go:13`, `kinds.go:51`, `json_prepare.go:245`, `json_composite.go:20`, `union_flat_layout.go`, `unsafe_keys.go:12,46`, `unknownkeys_shared.go:277`, `jsonsize/jsonsize.go:7-8`.
- `ts-go-runtypes/CLAUDE.md:38`: drop the GC-COUNT oracle line.

### 2. Regenerate the Go mirrors (never hand-edit)

`pnpm miondevx core codegen all`, then `--check` clean. It rewrites `run-types/src/go-generated/fnHashes.generated.ts`, `core/src/go-generated/jitFunctionIds.generated.ts`, devtools `runtypes-constants`, `tsconfig-plugin-keys`, `diagnosticCatalog` generated files, and the website `functions-catalog.json`. `scripts/core/gen-diagnostics-catalog.mjs:54-55`: drop the `'TB','FB'` prefixes and their description, then regenerate `diagnostics-catalog.json`.

### 3. `packages/run-types/src`

- Delete `createRTFBinary.ts` and `runtypes/dataView.ts`. FIRST move `UNSAFE_PROPERTY_NAME_MESSAGE` (`dataView.ts:34`) to a surviving module and keep exporting it: the router imports it (`router/src/dispatch.ts:15,255`) and Go emits the same string (`unsafe_keys.go:14`).
- `index.ts:159-184` (binary re-exports, two override exports), `:230` comment, `:236-251` (the whole `dataView.ts` block: serializer factories, `BinaryDecodeError`, `MAX_ZERO_BYTE_ITEMS`, `setSerializationOptions`, `SerializationOptions`, `StrictArrayBuffer`, `BinaryInput` ...).
- `createRTFunctions.ts:15-17, 380, 400-402`; `overrideRTFunctions.ts:28, 72-82`; `runtypes/types.ts:21, 182-185, 213-214`.
- `runtypes/entryTuple.ts`: `:157-159`, `:208`, `:212-213` (`FN_TYPE_ESTIMATE_SLOT`), `:329-335`, `:359-360` (noop fns), `:397-408` (`tb` / `fb` in `familyMeta`, same commit as the regenerated `FAMILY_TAG_TO_FN_KEY`), `:587-589`.
- Mocking: delete `mocking/binarySize.ts` and `mocking/mockOversized.ts`; `mockTypes.ts:65-75, 90-97` (`respectBinarySize`, `binarySizingOptions`, `BinarySizingOptions`); `createMockData.ts:17-18, 70-75`.
- Comments only: `fnHash.ts:24`, `classSerializerRegistry.ts:9`, `circular.ts:1`, `formats/numberFormats.ts:1,16,57`, `formats/bigintFormats.ts:38-39`. KEEP the Int8/UInt16 min/max (validation).

### 4. `packages/devtools`

- `src/core/unplugin.ts:95-102, 349-352` (`binarySizing`), `plugin-option-keys.ts:14`, `resolver-client.ts:38-44, 476-479`.
- `src/lint/diagnosticRouting.ts:24-25, 144-159, 339-340`: the `binary-non-serializable` / `binary-skipped-member` rules and TB / FB routing. `oxlint-recommended.json:16-17`.
- Tests: `runtype-diagnostics.test.ts:39-55, 251-291`, `wrapper-strategy-families.test.ts:84-85, 144-158`, `eslint/routing.test.ts:36-37`, `cli-surface.test.ts.snap`, `fuzz-lane-contracts.test.ts` (lane list), `repo-contracts.test.ts:1341` (bench columns).
- Rebuild the devtools dist.

### 5. Examples (`packages/examples/src`)

- Delete `guide/binary-basics.ts`, `binary-decode-errors.ts`, `binary-number-formats.ts`, `binary-size-strategies.ts`, `binary-options.ts`, `run-types/binary-serialization.ts`, `run-types/serialization-any.ts` (nothing imports the last one).
- Edit `guide/serialization-overview.ts` (drop `start-binary` region), `_homepage/showcase.ts` (drop `start-binary` region), `_homepage/home-run-types.ts:4,17`, `suites/realworld.ts`, `guide/all-factories.ts`.

### 6. Benchmarks, e2e, scripts, CI

- The `serialization-formats` bench exists only to show format constraints shrinking the binary payload: delete the suite, its page and its entry in `scripts/website/bench-data/gen-serialization.mjs:80`. Drop the `binary` round trip and fields (`:127-132, 162, 166, 343, 383`) and the `binary` column in `columns.mjs:22-23`. `container/benchmarks/README.md:333-341`, comment `format-validation/NumberFormat.ts:42`.
- `container/pre-publish-e2e`: delete `apps/shared/src/binary.ts`; edit `apps/shared/src/index.ts:13,27,43`, `serialization-edge.ts:2,30,59`, `test/rewrite-evidence.test.mjs:46`, `apps/build-vite/oxlintrc.e2e.json:15-16`.
- Fuzz lanes `size` and `secbinary`: `scripts/miondevx.mjs:96,101`, `scripts/lib/env.mjs:153,159` (`MION_FUZZ_SIZE_SOAK_MS`, `MION_FUZZ_SECBINARY_SOAK_MS`, and `.env.sample` if listed), `.github/workflows/fuzz-soak.yml:46,50`, `.github/workflows/ci.yml:187` exclude glob.
- Website app playground: `app/playground/operations.ts:10,138-161`, `engine.ts:59-60,445,507-517`, `PlaygroundStage.client.vue:585-587`, `RuntypesPlayground.vue:16`, `utils/subsites.ts:43`, `BenchTable.vue:527`; `packages/run-types/test/playground/engine.test.ts:147`.

## Tests

No new feature tests; this removes one. The work is keeping JSON coverage that currently leans on binary.

**Delete (binary only)** in `packages/run-types/test/`:
- `features/`: `binaryDecodeBounds`, `binarySizeEstimateOnEntry`, `binarySizingModes`, `binaryUnionFunctionMemberArm`, `binaryWire`, `emptyClassBinaryBound`, `temporalWireSize`, `zeroByteMembers`.
- `fuzz/binary/` (whole dir), `suites/mocking/respectBinarySize.test.ts`, `fuzz/value/crossWireOracle.unit.test.ts`.
- secbinary lane: `fuzz/security/binaryDecodeFuzz.integration.test.ts`, `binaryDecodeRunner.ts`, `securityWorker.ts`, `securityWorkerHost.ts`, `abortWorker.ts`, `wireMap.ts`, `wireMutations.ts` (+ unit test), `prefixReader.ts`, and the `checkBinaryDecode` parts of `securityOracle.ts` / `securityOracle.unit.test.ts` (check nothing JSON uses them first).
- Go: the binary arms in typefunctions tests (`union_inline_leaf_test.go`, `noop_types_test.go`, `property_dataonly_test.go`, `unsafe_keys_test.go`, `cross_family_deps_test.go`, `regexp_not_data_test.go`, `callable_interface_dataonly_test.go`, `union_dataonly_test.go`, `alwaysthrow_message_test.go`, `union_flat_stripped_prop_test.go`, `pattern_props_codec_test.go`, `symbol_literal_not_data_test.go`, `union_class_subclass_test.go`, `index_sig_sibling_json_test.go`) and resolver tests (`temporal_emit_test.go`, `demand_scope_test.go`, `diagnostics_test.go`, `regexp_drop_test.go`, `unsafe_names_test.go`, `circular_guard_inline_test.go`, `modulemode_test.go`, `inlinemode_test.go`, `bench_test.go`, `purefn_recording_tripwire_test.go`). Where a test checks a cross-family rule (for example "every family drops the same member"), keep it on the remaining families; never drop the JSON half. `typeid/overrides_test.go:41,48`: swap in another op name.

**Rewrite (binary is the second opinion for JSON)**:
- Fuzz oracles in `fuzz/value/fuzzOracle.ts`: drop O6 `checkBinaryStable`. Port O12 `checkCrossWire` and O14 (`type/typeFuzzRunner.ts:444-455`, "two codecs agree on serialize vs fail") to plain JSON vs compact JSON if the harness can build both; otherwise drop them. Keep the other oracle ids unchanged (no renumbering).
- `fuzz/type/typeFuzzHarness.ts`: remove `binaryEncode` / `binaryDecode` / `binarySizer` wiring and the `--binary-sizing-*` args in `openClient`.
- Smoke tests using `jsonEncode(binaryDecode(binaryEncode(v)))`: `type/mapSetUnionEnvelope`, `indexSigDroppedProp`, `indexSigFunctionProp` switch to a JSON round trip against the expected value. `unionStrippedSibling`: delete G3, keep G4's JSON half. `nonDataMock:71-73`: drop the binary block.
- `features/indexSigNamedSibling.test.ts:30-39`, `classSerializer.test.ts:453-460`, `classSerializerUnion.test.ts:218-228`: keep the JSON assertion alone.
- `suites/serialization/LargeObjects.test.ts`: its stress cases run only through binary today; pair them with the JSON encoder / decoder so they still run.
- `security/generatedCodeOracle.ts:148` GC-COUNT (`fb` only) and its unit test `:46-63`: delete.

**Edit (mixed)**:
- `suites/serialization/types.ts:93-132`: drop `binaryEncoder` / `binaryDecoder` / `getBinaryTestData` / `binaryFactoryThrows` / `getBinaryByteSizes` / `schemaBinary*`; then every data file in `suites/serialization/` and `suites/format-serialization/` loses those fields, and every `*.test.ts` there loses its `binary -` and `schema - binary -` cases. `RecordUnionEncoding.test.ts:10-13, 50-52`. Suite `CLAUDE.md:8,15,48`.
- Helpers: `util/serializationAsserts.ts:147-268`, `util/circularGuardAsserts.ts:18, 58-86`, `util/idIntegrityAsserts.ts:112-167`, `suites/id-integrity/serializers.test.ts:3-4`.
- Overrides suite: the binary case in `overrides/{Arrays,Atomic,Circular,Interface,Tuples,Unions}.ts`, `types.ts:33-36`, `overrideAsserts.ts:38-50`.
- Features: drop the binary `it`s in `classSerializer`, `classSerializerUnion`, `classSerializerGenerics`, `classSerializerSubclass`, `compiledFnDataWire`, `dataonly-union-drop`, `errorSubclassWire`, `external-module`, `generatedCodeAudit`, `nonEnumerableGuard`, `patternPropsCodecs`, `prototypeKeys`, `regexpNotData`, `symbolLiteralWire`, `temporal`; fn-name lists in `getFnHash.test.ts`, `injectTypeFnArgs-arity.test.ts`; `types/decodeReturnType.test.ts:17-78`.
- Fuzz harnesses: the `binary` lane in `roundtrip/roundtripHarness.ts` and `roundtripOracle.ts:225`; `security/securityHarness.ts`, SB-PROTO in `securityOracle.ts`, `laneShared.ts:93`, `attackDictionary.ts` comments; the 9 binary targets in `value/fuzz.integration.test.ts`; comment `value/shapeValue.ts:169`.

Guard (a check the implementer runs, not a committed test): `grep -rniE "tobinary|frombinary|createBinary|BinaryEncod|BinaryDecod|BinarySiz|binarySizing|respectBinarySize|DataViewSerializ|BinaryDecodeError|'tb'|'fb'|\bTB0|\bFB0|secbinary"` over `packages/ ts-go-runtypes/{cmd,internal} container/ scripts/ .github/ SETUP.md` returns nothing (ignore hits that mean the `mion` executable or the Drizzle `binary()` column).

## Docs

- Delete `container/website/content/02.runtypes/02.guide/06.binary-serialization.md` and the whole `02.runtypes/06.articles/` dir (the binary article is its only page).
- Delete `03.benchmarks/03.runtypes/06.serialization-formats.md` (see section 6). Fix links to it, including `03.type-formats/01.overview.md:63-65` ("Smaller Binary Payloads" section, delete).
- One-line or section edits:
  - `02.guide/04.serialization.md:2,7,44,61`: JSON only.
  - `01.introduction/01.about-mion-runtypes.md:7` and the "Binary serialization" card `:191-198`.
  - `01.introduction/02.built-on-typescript-go.md:15`.
  - `01.introduction/04.configuration.md:22` (`binarySizing` row) and the "Binary Buffer Sizing" section `:35-44`.
  - `02.guide/03.validation.md:10`, `07.mocking.md:46` (`respectBinarySize` row), `09.pure-functions.md:135`.
  - `03.type-formats/03.number.md:16`.
  - `04.tooling/01.linting.md:23-24,29` and `01.rpc/06.devtools/01.linter.md:203-204,210`: drop the two lint rules.
  - `index.md:70,135`, `03.benchmarks/01.introduction/01.mion-benchmarks.md:89`.
  - `11.all-compiled-functions.md`: no text edit; check it renders with the regenerated catalog and `all-factories.ts`.
- Leave alone: security, aws-lambda and drizzle pages (their "binary" is not this feature).
- Repo docs: `SETUP.md:144`, `packages/run-types/README.md:7`, `docs/FUZZING.md` (O6 / O12 / O14 / O-SIZE, size lane), `packages/run-types/test/fuzz/README.md` (`binary/` section and oracle rows), `docs/AI_ENRICHMENT.md:38,57,1056`, `.claude/skills/fuzzy-testing/framework-fuzzy-testing.md` (swap the O12 example), `.claude/skills/implement-todo/SKILL.md:68` (swap the "binary codec oracles the JSON codec" example).
- `docs/maybe/binary-as-opt-in-data.md`: delete (moot). Fix `docs/maybe/data-only-standard-library-globals.md:56-60` and `support-circular-refs-validation.md:18,46`.
- Leave `CHANGELOG.md` and `docs/done/*` (history).

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Out of scope

- Sending real bytes (`Uint8Array`, `Buffer`) over JSON (base64 or similar).
- A new compact binary format.
- The `mion` executable, `BinaryStamp`, `constants.Version`, `IsBinaryViewShape` / `BinaryRootGlobals`, the Drizzle `binary()` column, the router's `'binary'` parser-strategy rejection test (`router/test/parser.spec.ts:490-506`): same word, different thing.
- Renumbering fuzz oracle ids.

## Done when

- The guard grep is empty and no `Binary*` factory, type or override is exported.
- `go -C ts-go-runtypes test ./internal/... ./cmd/...`, `pnpm test`, `pnpm run test:bun`, `pnpm run typecheck`, `pnpm run lint`, `pnpm run check-format`, `pnpm run check:env` and `pnpm miondevx core codegen all --check` pass.
- JSON coverage did not shrink: every test that used binary as the second check still checks JSON.
- The website builds and the serialization, configuration, mocking, linting and all-compiled-functions pages render with no binary mention and no broken link.
- PR labelled `pre-publish-e2e` (public API and e2e apps), `website` (pages, examples, playground) and `bench` (benchmark suite removed).
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file, each committed on its own.

## What shipped

Everything above, with these choices made during the build:

- `UNSAFE_PROPERTY_NAME_MESSAGE` moved to `packages/run-types/src/runtypes/unsafeKeys.ts`, still exported from the package root for the router.
- Fuzz oracles: O6 dropped. O12 and O14 were ported, not dropped: O12 checks `jsonEncode(compactDecode(compactEncode v)) == jsonEncode(v)` (skipping types whose optional can hold a present `null`), O14 checks the clone and compact encoders agree on serialize vs throw. The SB-* and GC-COUNT oracles went with the binary lane.
- Tests that covered the value-first call shape only through binary were moved to the JSON factories, so both marker call shapes stay covered.
- Go tests that proved a cross-family rule through binary now prove it through the JSON families (a `bigint` member keeps the union from being a no-op).
- `gen-serialization.mjs` now runs one fixed suite (no `--suite` flag); `docs/WEBSITE-DOCGEN.md` updated to match.
- Redirects added in `container/website/public/_redirects` for the deleted guide page, the articles section and the serialization-formats benchmark page.
- About page: the mocking card now spans the full row, since it lost its binary neighbour.
- pre-publish-e2e: 13 feature families became 12 (`build-outputs.test.mjs`), and the family header numbers now follow the list order.
