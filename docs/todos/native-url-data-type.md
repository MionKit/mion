---
type: feature
spec: full-plan
status: ready
created: 2026-10-01
---

# Support the native URL class as data, with a NativeUrl<P> format

## Problem

`URL` is a string with a class around it, but every family treats it as non-data today:

- With `lib: dom`, `typeid.NotDataBuiltinOf` (`ts-go-runtypes/internal/cachegen/runtype/typeid/libglobal.go:62`)
  marks it `SubKindNonSerializable`: dropped at a property, refused at a root.
- With only `@types/node`, it is worse. Node declares a global `interface URL extends url.URL {}`
  (`node_modules/@types/node/web-globals/url.d.ts`), outside the bundled lib, so `declaringLibFile`
  (`typeid/typeid.go:282-304`) returns "" and `LibDeclaredGlobalOf` says no. The URL is walked as a plain object
  and gets a validator over its ~forty members. Nothing tests this (`typeid/libatomic_test.go` only uses `lib: esnext,dom`).
- `DataOnly<T>` (`packages/run-types/src/runtypes/dataOnly.ts:34`) keeps only `Date` + `DataOnlyNativeExtra`, so it
  projects `URL` to its member shape, which no decoded value matches.

Goal:

```ts
type Link = {home: URL; api: NativeUrl<{maxLength: 200}>; docs: NativeUrlHttp};
createValidateFn<Link>()(value);      // instanceof URL + href checks
JSON.stringify(link);                 // {"home":"https://a.com/", ...}
createRestoreFromJsonFn<Link>()(raw); // strings become URL instances
type D = DataOnly<Link>;              // keeps URL verbatim
```

## Plan

Precedents to copy: Date (`SubKindDate`, the `nativeDate` format) and the Temporal classes (string on the wire,
rebuilt on decode). There is no binary or equality family in Go, so only validate, validationErrors, the JSON
families, clone, jsonsize, schema doc, convert and the TS mock / DataOnly side are touched.

### 1. Reflection subkind
- `ts-go-runtypes/internal/reflection/subkind.go:15-36`: add `SubKindUrl` (spell it `Url`, `gen.go:319` would turn
  `URL` into `uRL`). Regenerate the TS twins with `pnpm miondevx core codegen kind`
  (`packages/run-types/src/go-generated/runTypeKind.generated.ts`, devtools `reflectionKind.generated.ts`).
- `reflection/must_validate_json.go:31-36`: flag the URL subkind (its restore arm converts a string).
- `reflection/runtype.go:248-252`: doc of `ClassRef.Builtin`. `reflection/nondata.go` needs no change (add a row to `nondata_test.go:33`).

### 2. Detection (before `NotDataBuiltinOf`)
One predicate, e.g. `typeid.IsNativeUrl(tsType)`: symbol name `URL` AND (global, i.e. no module parent, which covers
lib.dom and @types/node's global) OR the class exported by `node:url` / `url`. A user's own module-scoped
`class URL` stays a user class. Use it in:
- `typeid/typeid.go:512-556` (structural id, before the `NotDataBuiltinOf` branch at `:556`) and `:1176-1191`
  (`objectKind` → `KindClass`).
- `typeid/intersection_collapse.go:279` and `cachegen/runtype/intersection_collapse.go:363`: add `URL` to
  `builtinClassNames(ID)` so `URL & {brand}` lifts the `nativeUrl` brand onto the class node (`splitBuiltinClassBrand`).
- `cachegen/runtype/serialize.go:792-821` (route to `projectClass` before `NotDataBuiltinOf`) and `:916-952`
  (`ClassRef{Builtin: "URL"}`, the subkind).
- `typeid/libglobal.go:9-21,59`: comments that list the natives dispatched first.

### 3. Emitters (`ts-go-runtypes/internal/cachegen/typefunctions/`)
- Supported sets: `validate.go:63-71`, `json_shared.go:49-56`, `unknownkeys_shared.go:392-399`.
- Validate: `validate.go:414-426` arm `v instanceof URL`; inline leaf lists `json_prepare.go:430-452`, `inlining.go:53`.
- validationErrors: `validationerrors.go:341-356` arm, and `baseKindGuard` (`:199-224`) MUST get a URL case: its
  `KindClass` fallthrough returns the Date guard, so format errors would never run.
- JSON encode: `json_prepare.go:83-90` no-op (`URL#toJSON()` is href); `json_prepare_clone.go:101-107` and
  `json_compact.go:88-93` emit `v.href`.
- JSON decode: `json_restore.go:80-87` and `json_compact_restore.go:85-91`:
  `v = typeof v === 'string' && URL.canParse(v) ? new URL(v) : v`. `new URL(bad)` THROWS (unlike `new Date(bad)`),
  so the `canParse` guard is required; a bad string is left for validate to refuse. `json_restore_clone.go` delegates, no change.
- No-op / compat: `noop_types.go:277-298` (prepare no-op, like Date), `json_compat.go:145-158` (false).
- Clone: `remove_unknown_keys.go:85-100` (`new URL(v.href)`), `:574-581` (not a no-op).
- jsonsize: `jsonsize/jsonsize.go:497-531` reuse `stringBytes` so `maxLength` bounds it.
- Schema doc: `schemadoc/render.go:283-318` → `{type: 'string', format: 'uri', jsType: 'URL'}`; `keywords.go:92-103`,
  `leaf.go:43-61` (add `nativeUrl`, distinct from the string `url` family); `docs/json-schema-2020-12-javascript.md:108-139` jsType rule.
- Convert: `convert/printtype.go:236-271` (`URL`), `convert/printbuilder.go:126-165` (`nativeUrl()`), golden `convert/testdata/schemadoc_corpus.golden`.

### 4. The `nativeUrl` format (pairs with the string `url` format)
- Go emitter `nativeUrl`, `Kind() = KindClass`, registered in `formats/all/all.go`. Live in `formats/string` so it
  can call the unexported `namedPatternValidate` / `namedPatternErrors` (`string/pattern.go:62-88`) on
  `vλl + ".href"` (an expression is fine). Give the errors helper an `expected` parameter (hard-coded `"string"` at `:85`).
  Reuse the url param checks (pattern safety, samples, bounds); add the `length` vs min/max check from
  `stringformat.go:296-334`. No `transform` (fmt never rewrites class nodes).
- Composes like nativeDate (`datetime/nativeDate.go:32-45`): base `instanceof URL` ANDed with the href checks (`validate.go:131-138`).
- Error keys: `"nativeUrl"` row in `formats/errorkeys_samples.go`, `pnpm miondevx core codegen errorkeys`, and the
  `ParamsByFormat` row in `packages/run-types/test/types/formatErrorKeysCoverage.test.ts`. `cmd/gen-type-formats` regenerates `typeFormats.generated.ts`.
- TS types, new file `packages/run-types/src/formats/url/nativeUrlFormats.ts`, exported from the root `formats` surface
  (URL exists in both dom and @types/node, so no opt-in subpath):
  - `type NativeUrlParams = Omit<UrlParams, 'transform'>` (`stringFormats.ts:546`).
  - `NativeUrl<P = {}, BrandName = never>`: no default pattern (any URL `new URL` accepts).
    Presets `NativeUrlHttp<P>` / `NativeUrlFile<P>` default to `URL_HTTP_PATTERN` / `URL_FILE_PATTERN` (`string-patterns.ts:50-63`), like `UrlHttp` / `UrlFile`.
  - Written as an INLINE intersection `UrlInstance & FormatBrand<'nativeUrl', P>` (+ optional `NominalBrand`), NOT
    `TypeFormat<URL,…>`: `TypeFormatBase` (`runtypes/typeFormat.ts:9`) would have to name `URL` in a root module.
    `UrlInstance` is a `typeof globalThis extends {URL: {prototype: infer I}} ? I : unknown` probe, as
    `temporalFormats.ts:32-47` does. Check the probe for circularity against @types/node's own conditional `var URL`.
  - Builders `nativeUrl(P?, brand?)`, `nativeUrlHttp`, `nativeUrlFile`, copying the `date` builder overloads (`formats/scalars.ts:104-123`), not `presetFormatBuilder`.
  - Rows: `builderTypes.ts:34-46` (`LeafTypeByFormatName`), `refineFormat.ts:16-43` (`RefinableParamsByFamily`, `FormatBaseOf`).
  - No `TransformParamsByFormat` row, so `Transform<NativeUrl>` stays an error.

### 5. TS type-level projections
- `dataOnly.ts:30-34`: add a `never`-fallback URL probe to `DataOnlyNative`; rewrite the comment calling URL "the one known gap".
  Budget test harness `test/types/dataonlyHarness.ts:32-67` needs an ambient URL stub (it compiles with `lib.es2023`
  only, `compileHarness.ts:5,46`); re-measure every ceiling in `dataonly.compile.test.ts`.
- `jsonShape.ts:49-50,111-112` (URL → `string`), `stripRunTypeMeta.ts:191-192`, `enrich/mockData.ts:42-43`,
  `enrich/friendlyText.ts:68`, optionally `builders/static.ts:290-358` (leaf fast path).
- Published `.d.ts` must still compile for a consumer with neither dom nor @types/node (URL just becomes `never` /
  `unknown`), pinned like `test/types/dataonlyTemporalPosture.test.ts`.

### 6. Runtime TS
- Mock: `src/mocking/mockType.ts:252-296` class arm → `new URL(mockUrl(params))` (reuse `mockStringFormat.ts:317-321`,
  exporting it). `href` normalises (`https://a.com` → `https://a.com/`, host lowercased), so mocks must check
  `maxLength` / pattern against the normalised href.
- `packages/rpc-client/src/lib/serializer.ts:98-107`: no arm needed (`toJSON` is href); fix the comment only.

### 7. Diagnostics prose
`ts-go-runtypes/internal/diagnostics/prose.go`: every line that lists the supported natives or uses URL as the
non-data example (`:83,154,172,227,792-915,951,987-992`). The RUK example (`:987-992`, `url: URL`) must switch to
another non-data class (e.g. `Blob`), checking the lib `diag_examples_test.go:87` compiles with. Regenerate the
diagnostics catalog (`cmd/gen-diag-catalog`).

## Tests

Paired static / value-first shapes per the Marker test coverage rule.
- Go, rewrite (they pin URL as non-data): `typeid/libatomic_test.go:29,53,131`, `compiler/resolver/libdrop_test.go:50,103`.
- Go, new twins: scan + emit like `temporal_scan_test.go` / `temporal_emit_test.go` (validate, restore, cache class
  type, user `class URL` not detected); format like `native_date_format_test.go` (brand lifted, href check, param
  validation, structural id ignores brand); `atomic_test.go:752-780` paired form; an @types/node-only URL case
  (stub pattern `nodeDTS`, `typeid/esnext_lib_test.go:128`) AND a `lib: dom` case; `tsconfig_parity_test.go:52-64`.
- Go, table rows: `must_validate_json_test.go` (`transformCalls` gets `new URL\((\w+)\)`, `flaggedDumps`),
  `nondata_agreement_test.go:71`, `noop_types_test.go`, `noop_predicate_test.go`, `union_inline_leaf_test.go`,
  `jsonsize_test.go`, `formats/errorkeys_test.go`, `gen-run-type-kind/gen_test.go`, convert `roundtrip_test.go:440`,
  `fuzz_atoms_test.go`. Do NOT add URL to `TestNestedDiagCorpus` (non-data triggers only).
- JS suites: `test/suites/validation/Native.ts`, `format-validation/` (new URL file next to `DateTime.ts`),
  `serialization/`, `format-serialization/`, `cloning/`, `mocking/mockData.test.ts`, `test/features/typeFormats.test.ts`,
  `kindConstants.test.ts`, `value-first-define`, `jsonShapeWire.test.ts`, `jsonSchemaDialectSpec.test.ts`,
  `jsonSchemaOutput.proto.ts`, `enrich/cases/Native.ts`.
- JS static: `dataonly.compile.test.ts`, a URL posture test, `stripmeta`, `mockData`, `friendlyText`,
  `refineFormat`, `jsonShape`, `decodeReturnType`, `formatErrorKeysCoverage`.
- Restore edge cases: invalid string (`'not a url'`) is left as-is and validate fails (no throw); non-string left as-is;
  relative string (`'/a'`) rejected; round trip `restore(JSON.parse(JSON.stringify(x))).href === x.href`.

## Docs

`container/website/content/02.runtypes/`:
- `03.type-formats/02.string.md`, section "Named String Formats" (URLs row): point to the native form.
- `03.type-formats/` new section "URL Objects" (`NativeUrl`, presets, `nativeUrl()` builder), on the string page next
  to the URLs row or a short own page, modelled on "Date Representations" in `05.date-time.md`; `01.overview.md:16` table row.
- `02.guide/03.validation.md:10` (drop URL from the skipped built-ins).
- `02.guide/04.json-round-trip.md`: "What the JSON Looks Like", "Values That Are Not Data", the "Classes" note at `:100`.
- `02.guide/02.reflection.md:46,60` (builtin class lists), `02.guide/08.json-schemas.md:88-111` (jsType `URL` row),
  `01.introduction/01.about-mion-runtypes.md:147`.
- Diagnostics page regenerates from prose (step 7).
- Examples via `<code-import>` from `packages/private-examples/src/guide/` (a new `type-formats-native-url.ts`, and
  `json-wire-format.ts` gains a URL member).

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Fuzzing

Good candidate, cheap oracle (round trip by href, D4 DataOnly agreement):
- `test/fuzz/core/typeGen.ts`: APPEND a `url` leaf to the serial pool (`:1222-1232`, appending keeps seed-pinned
  types stable), render (`:1494`), and a `nativeUrl` format leaf (`:95-115`, `:273`). `shapeValue.ts:94,244,288`, `runTypeGen.ts:42-50`.
- `test/fuzz/type/dataOnlyOracle.ts:1-3,128-130`: URL is now drawn and must pass D4.
- `test/fuzz/security/generatedCodeOracle.ts`: `URL` in `BUILTIN_CONSTRUCTORS` (`:188-195`), `/new URL\((\w+)\)/g` in `WIRE_TRANSFORMS` (`:207-215`).
- Comparators compare `href` (URL has no own keys): `roundtripOracle.ts`, `referenceClone.ts`, `cloneOracle.ts`,
  `extrasValue.ts`, `fuzzOracle.ts`, `test/util/equalsHelpers.ts`, `serializationAsserts.ts`; `test/fuzz/README.md`.

## Out of scope

- Other standard-library classes (`URLSearchParams`, `Headers`, `Error`, `Blob`, the DOM geometry types): they stay non-data.
- A `transform` param on `NativeUrl` (a URL object is not rewritten).
- A URL-specific lib guard like TMP001: an unresolved `URL` is already caught by MKR013 / CNV008.
- Binary and equality families: they do not exist in the Go emitter.

## Done when

- `URL` validates, round trips through every JSON road, clones and mocks, under `lib: dom` AND under @types/node only;
  a module-scoped user `class URL` is still a user class.
- `NativeUrl<P>`, `NativeUrlHttp`, `NativeUrlFile` and their builders check `href` with the string url params, with errors under `nativeUrl` keys.
- `DataOnly<T>` keeps `URL`; the published `.d.ts` still compiles with neither dom nor @types/node.
- No diagnostic or page still calls URL non-data.
- Go tests, `pnpm test`, `pnpm run lint`, the fuzz suites and the codegen `--check` pass; PR labelled `website` and `pre-publish-e2e`.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file, each committed on its own.
