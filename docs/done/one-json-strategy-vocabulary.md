---
type: chore
spec: guidelines
status: done
created: 2026-09-24
---

# Remove the direct JSON encoder and give the JSON decoder the clone / mutate / compact names

## Intent

Two leftovers keep the JSON string functions out of step with the rest of the library:

- `createJsonEncoderFn` still offers `strategy: 'direct'`, backed by the `stringifyJson` (`sj`) family
  and the public `createStringifyJsonFn`. It walks the value and writes the JSON string by hand. It
  loses to `clone` in every benchmark group except single values, and nothing in mion uses it.
- `createJsonDecoderFn` uses its own words, `strip` / `preserve` / `compact`, while the encoder,
  `createPrepareForJsonFn` / `createRestoreFromJsonFn` and the router's `parser` option all use
  `clone` / `mutate` / `compact`. `preserve` is `mutate` under another name. `strip` blanks undeclared
  keys with the `stripUnknownKeysWire` (`ukuw`) pre-pass, an older approach the `clone` restore (`rjs`)
  replaced by rebuilding from the declared shape.

After this change every JSON entry point shares one vocabulary and the same compiled steps:

| Strategy | Encode | Decode |
| --- | --- | --- |
| clone (default) | `JSON.stringify(pjs(v))` | `rjs(JSON.parse(s))` |
| mutate | `JSON.stringify(pj(v))` | `rj(JSON.parse(s))` |
| compact | `JSON.stringify(cj(v))` | `cjr(JSON.parse(s))` |

Breaking change, fine with no users yet. No alias for the old names.

## Direction

The implementer plans the details. Verified pointers:

- TS surface: `packages/run-types/src/createRTFunctions.ts` (`JsonEncoderStrategy` ~300,
  `JsonDecoderStrategy` ~311, the `JsonValueStrategy` comment ~278 that says the decoder keeps its own
  words, `createStringifyJsonFn` ~462, the decoder doc ~525) and the
  exports in `packages/run-types/src/index.ts`.
- Go composite table: `ts-go-runtypes/internal/constants/constants.go` (`jsonEncoder|direct`,
  `jsonDecoder|strip|preserve` in both the fnKey map ~160 and `JsonStrategyFamilies` ~353). The
  decoder `clone` row composes `rjs`, `mutate` composes `rj`.
- Go emitters to delete: `cachegen/typefunctions/json_stringify.go`, `strip_unknown_keys_wire.go`,
  `unknownkeys_to_undefined.go` (only `ukuw` uses it), plus the `direct` / `strip` / `preserve` arms of
  `json_composite.go`. Registry rows in `cachegen/operations`.
- Check the JSON override handling in `typefunctions/override.go` / `module.go` for any leftover
  reference to the removed families.
- `packages/run-types/src/standard/jsonSchemaDoc.ts:49-58` lists `direct` among the encoder strategies
  (and its error message already disagrees with its own set).
- Regenerate `fnHashes.generated.ts` and the core jit id table with `pnpm miondevx core codegen`; the
  decoder `defaultVariant` becomes `clone`.
- Tests: the `directEncoder:` / strip / preserve thunks across the serialization suites, and
  `createStringifyJson.test.ts`. Keep the root `undefined` / `void` `"[null]"` envelope and its
  round-trip tests; it is the one thing the wrappers add over prepare/restore.
- Other callers: `container/pre-publish-e2e/apps/shared/src/json.ts:23`, and the examples below.
- The public `createStripUnknownKeysFn` is already gone; only the internal `ukuw` family remains, and
  it goes here. `createRemoveUnknownKeysFn` is unrelated and stays.

## Docs

`container/website/content/02.runtypes/02.guide/05.json-serialization.md`: existing sections "Pick an
Encoder Strategy" and "Pick a Decoder Strategy" (drop `direct`, rename the decoder words, likely merge
into one strategy table). Examples: `packages/examples/src/guide/json-strategies.ts`,
`markers-comptime.ts`, `all-factories.ts`, `all-factories-markers.ts`. Check the compiled functions
reference table for `stringifyJson` / `stripUnknownKeys` rows.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- `direct`, `stringifyJson`, `createStringifyJsonFn`, `ukuw`, `strip` and
  `preserve` are gone from source, generated tables, tests, examples and docs.
- Encoder and decoder both accept exactly `clone | mutate | compact`, default `clone`, and each pair
  round-trips.
- `pnpm test`, the Go tests and `pnpm run typecheck` pass; the PR carries the `website` and
  `pre-publish-e2e` labels.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched
  source file, each committed on its own.

## Plan (approved 2026-09-24)

### Go (ts-go-runtypes)
- `operations/operations.go`: encoder strategies `clone|mutate|compact`; decoder `DefaultStrategy: "clone"`, strategies `clone|mutate|compact`; delete the `stringifyJson` and `stripUnknownKeysWire` rows; fix the Doc strings.
- `constants/constants.go`: drop `stringifyJson` / `stripUnknownKeysWire` modules, `jeDI`, `jdST`, `jdPR`; add `jsonDecoder|clone` → `jdCL` `{"rjs"}` and `jsonDecoder|mutate` → `jdMU` `{"rj"}` (mirrors `jeCL` / `jeMU`). Host tags unchanged: every decoder composite still borrows `rj` metadata (like every encoder borrows `pj`); `rj` and `rjs` share the same value-shaped identity entry.
- `typefunctions/json_composite.go`: tag lists, remove `direct` arm, decoder arms become clone (`rjs`) and mutate (`rj`).
- Delete `json_stringify.go`, `strip_unknown_keys_wire.go`, `unknownkeys_to_undefined.go`, and the code left with no caller: stringify helpers in `union_flat.go`, `wrapStringifyWithClassSerializer`, `sjSkipCommas`, `isNoopForStringifyJson`, the UKU/UKW noop specs + walker facts, `JsonWireFormat` + the wire branch of `emitNativeIterableUnknownKeys`, `mapSetAlwaysNoop`. Family registrations in `families.go`, resolver `dispatch.go`, `protocol.go` `AddedStringifyJson` / `AddedStripUnknownKeysWire` (+ TS mirror in devtools `protocol.ts` / `resolver-client.ts`).
- Diagnostics: remove SJ001–SJ015, UKU010, UKW010 codes, messages, group lists, `alwaysthrow_message.go` entries.
- Go tests: delete cases that only test removed code; retarget shared cases (direct → clone, strip → clone, preserve → mutate, jdST/jdPR → jdCL/jdMU).
- Regenerate with `pnpm miondevx core codegen all` (fnHashes, core jit ids, devtools constants + diag catalog, website catalogs); decoder `defaultVariant` becomes `clone`.

### TypeScript
- `run-types/src/createRTFunctions.ts`: `JsonEncoderStrategy` / `JsonDecoderStrategy` become `JsonValueStrategy`-shaped (`clone|mutate|compact`), docs updated; delete `createStringifyJsonFn`, `StringifyJsonFn`, the `stringifyJson` key in `RTFunctionByKey`; fix stale comments. `index.ts` exports, `runtypes/types.ts`, `runtypes/entryTuple.ts` familyMeta (`sj`, `ukuw`, `jeDI`, `jdST`, `jdPR` → `jdCL`/`jdMU`), `markers.ts`, `overrideRTFunctions.ts` comments.
- `standard/jsonSchemaDoc.ts`: strategy sets without `direct`, error message matches the set.
- `core/src/runtypes/mionAdapter.ts` comment (jdST → jdCL).

### Tests (Vitest + Go)
- Serialization harness: drop `directEncoder`, rename `stripDecoder` → `cloneDecoder`, `preserveDecoder` → `mutateDecoder` across `suites/serialization/**`, `format-serialization/**`, `types.ts`, `serializationAsserts.ts` (pairings become clone×clone, clone×mutate, mutate×clone, mutate×mutate, compact×compact; direct pairings + `stringifyJsonMayBeUnparseable` / `safeAdapterStringifyJsonNotParseable` go), `deserializeRTFunctions.ts`, the suite `CLAUDE.md`. Done by a script, then reviewed.
- Delete `createStringifyJson.test.ts`; retarget direct/strip/preserve rows in the feature tests listed by the map (encoderModes, unknownKeyFamiliesAgree, unionDecodeAgree, prototypeKeys, getFnHash new hashes, jsonSchemaClosedness, decoderSafeMode, stripInsideMapSet, …). Keep the root `undefined`/`void` `"[null]"` envelope round-trip tests.
- No tests for the removed options (nothing asserting `'direct'` / `'strip'` / `'preserve'` are rejected). Tests for removed code are deleted, not rewritten into "it is gone" checks. Round-trip of each pair stays covered by the renamed harness pairings.
- Fix found on the path: `test/suites/overrides/JsonValueFns.ts` imports `createStripUnknownKeysFn`, which no longer exists (two PRs crossed on main). Its case becomes "JSON encoder/decoder compile for the overridden type, clone and mutate".
- Fuzz harnesses (roundtrip, security, type, value, generatedCodeOracle) and README: drop the `direct` lane, tags jdST/jdPR → jdCL/jdMU.
- devtools `runtype-diagnostics.test.ts` / `eslint/routing.test.ts`: SJ cases go (or retarget to an equivalent prepare code if the test is about routing, not SJ itself).
- Go: `go -C ts-go-runtypes test ./internal/... ./cmd/...`.

### Other callers
- Examples: `json-strategies.ts`, `all-factories.ts`, `all-factories-markers.ts`, `markers-comptime.ts`.
- `container/pre-publish-e2e/apps/shared/src/json.ts` (drop encodeDirect).
- Website playground `app/playground/operations.ts` / `engine.ts` comment; bench-data scripts `gen-serialization.mjs` / `columns.mjs` (drop direct column, decoders renamed).
- Untouched on purpose: mion's `SerializerModes.stringifyJson` body mode (same name, unrelated).

### Docs
`container/website/content/02.runtypes/02.guide/05.json-serialization.md`: merge "Pick an Encoder Strategy" and "Pick a Decoder Strategy" into one strategy section with one table (the table above in plain words); remove the `createStringifyJsonFn` row. Check `10.compiler-markers.md` / `11.all-compiled-functions.md` still render right with the edited examples.

### Fuzzing
Not a new feature; existing roundtrip fuzz lanes keep covering each strategy pair. No new fuzz suite.

### Finish / verification
1. Rebuild (`pnpm run check:builds`, devtools dist), `pnpm miondevx core codegen all --check`.
2. `pnpm test` (or `pnpm run test:ci`), Go tests, `pnpm run typecheck`, `pnpm run lint`, `pnpm run format`, `pnpm exec vitest run website-links`.
3. grep: no `direct` strategy, `stringifyJson` family, `createStringifyJsonFn`, `ukuw`, `'strip'`, `'preserve'` left.
4. Append this plan to the spec, reconcile, `git mv` to `docs/done/`.
5. docs-simplifier + comments-simplifier subagents in parallel, each committed on its own.
6. Push, open PR with `website` + `pre-publish-e2e` labels.

## What shipped (reconciled)

Built as planned, with these differences:

- Host tags were left as they were (decoder composites borrow `rj`), see the Go section above.
- Also removed, found on the way: the always-true `reportsPatternKey` flag in `noop_types.go`, the stale `addedUnknownKeysToUndefinedWire` flag in the devtools protocol mirror, and the `SJ` / `UKU` / `UKW` rows in devtools `lint/diagnosticRouting.ts`.
- `test/suites/overrides/JsonValueFns.ts` imported the already-removed `createStripUnknownKeysFn`; its stringify / strip-keys case covered only removed functions and was deleted.
- `features/stripInsideMapSet.test.ts` became `cloneDecodeInsideMapSet.test.ts`: it now checks the clone decoder drops undeclared keys inside Map values and Set members.
- A few Go and devtools tests needed a third valid strategy and now use `compact` where they used `direct`; the SJ diagnostic cases now use the clone encoder's PJS codes.
- Outside the spec: the website playground ops, the serialization bench columns (`direct` column gone, decoders paired by strategy) and the pre-publish e2e JSON check were updated.
- Maintainer request in the same PR, own commit: removed 13 Go helpers that `staticcheck -checks U1000` showed nothing called, already unused on main.
