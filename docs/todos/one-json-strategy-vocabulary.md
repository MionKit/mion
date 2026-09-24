---
type: chore
spec: guidelines
status: ready
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
