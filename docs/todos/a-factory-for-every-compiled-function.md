---
type: feature
spec: full-plan
status: ready
created: 2026-09-19
---

# A Factory for Every Compiled Function

## Problem

Eight of the functions RunTypes compiles have no `createX` factory. A caller can only
reach them by declaring their own `InjectTypeFnArgs` marker and calling `getRTFunction`,
which is a framework-author move, not something an app should have to do.

The eight are the rows with `Factory: ""` in
`ts-go-runtypes/internal/cachegen/operations/operations.go:209-224`:

| Marker name | Tag |
| --- | --- |
| `prepareForJsonMutate` | `pj` |
| `prepareForJsonClone` | `pjs` |
| `restoreFromJson` | `rj` |
| `restoreFromJsonStrip` | `rjs` |
| `stringifyJson` | `sj` |
| `stripUnknownKeysWire` | `ukuw` |
| `compactForJson` | `cj` |
| `compactFromJson` | `cjr` |

`classSerializerReg` is the only other registry row without a user-facing factory, and it
stays out: `Public: false` plumbing behind `registerClassSerializer`.

Two of the eight are also misnamed, which is worth fixing in the same change because the
factory signatures freeze the names in place:

- `restoreFromJsonStrip` does not blank keys, it REBUILDS the object from the declared
  shape, so undeclared keys are gone by construction. That is a clone.
  `ts-go-runtypes/internal/cachegen/typefunctions/families.go:43` already calls it "the
  DECODE mirror of prepareForJsonClone", and the JS tests name their helper `cloneDecoder`
  (`packages/run-types/test/features/encoderModes.test.ts:27`).
- `restoreFromJson` restores in place and keeps undeclared keys. That is exactly what
  `prepareForJsonMutate` does, but the name carries no suffix, so the pair reads lopsided.

Third problem, downstream of the first. The page
`container/website/content/02.runtypes/02.guide/15.all-compiled-functions.md` is built
around the split this change removes. It renders `::function-catalog`, a Vue component
with a search box, a group filter, and three groups (has a factory / no factory /
internal). Once every function has a factory, the groups say nothing and the search box
is filtering twenty rows.

## Plan

Three commits, in this order: the rename, the factories, the docs page.

### 1. Rename the restore pair

| Old name | New name | Tag |
| --- | --- | --- |
| `restoreFromJson` | `restoreFromJsonMutate` | `rj` (unchanged) |
| `restoreFromJsonStrip` | `restoreFromJsonClone` | `rjs` (unchanged) |

The family tags do NOT change. They are opaque short names for the emitted code, and
`pjs` already survived `prepareForJsonSafe` becoming `prepareForJsonClone`, so renaming
them would churn the disk cache basenames and `FAMILY_TAG_TO_FN_KEY` for nothing.

Nothing is published, so there is no alias and no migration. The old name behaves like any
other unknown function name: the existing MKR015 path reports it at the call site. Do NOT
add a `SuggestFnKey` entry for it.

Renaming an operation's `Name` moves its fnHash (`operations.PlainHash`), so
`packages/run-types/src/go-generated/fnHashes.generated.ts` changes and on-disk caches
invalidate. A rebuild is the whole fix.

Go, source:

- `internal/cachegen/operations/operations.go:211-212` — `Name` and `FnKey` on both rows.
- `internal/constants/constants.go:106-109` — the `restoreFromJsonStrip` key and its
  `restoreFromJsonStripModule` module name.
- `internal/cachegen/typefunctions/families.go:43-46` — the family registration, the
  `RestoreFromJsonStripEmitter` type, and the comment that already describes it as a clone.
- `internal/cachegen/typefunctions/json_restore_strip.go` → `json_restore_clone.go`.
  `json_restore.go` keeps its name, matching `json_prepare.go` for the mutate prepare.
- `internal/compiler/resolver/apigen.go:583`.
- `internal/cachegen/typefunctions/diag_codes.go:171` and
  `internal/cachegen/typefunctions/noop_types.go:826` — comments naming the old family.
- The `CodeRJ*` diagnostic codes keep their names. They are `rj`-tag based, and the tag
  is not moving.

Go, tests (the family name appears as a string): `typefunctions/unsafe_keys_test.go:247`,
`property_dataonly_test.go:58,70,85,99`, `pattern_key_codec_test.go:83`,
`union_flat_compact_test.go:214,247,302,320`, `callable_interface_dataonly_test.go:38,62`,
`families_test.go:16`, `json_restore_strip_test.go` (rename the file too),
`operations/fnhash_test.go`. Grep for both old names rather than trusting this list.

TypeScript:

- `packages/run-types/src/createRTFunctions.ts:746` (the `RTFunctionByKey` keys) and the
  doc comments at 705-717 and 764.
- `packages/run-types/src/markers.ts:51`, `packages/run-types/src/index.ts:236`.
- `packages/router/src/types/encoder.ts:46,50` — the `DecodeFamily` mapping.
- `packages/run-types/test/util/deserializeRTFunctions.ts:168-169` and the feature tests
  that name the key: `unknownKeyFamiliesAgree`, `encoderModes`, `stripRestoreShapes`
  (rename the file to `cloneRestoreShapes.test.ts`), `getRTFunctionRecovery`,
  `unionDecodeAgree`, `fuzz/value/fuzz.integration.test.ts`.
- `packages/examples/src/guide/json-value-level.ts`,
  `packages/examples/src/guide/markers-value-level-recover.ts`.
- Regenerate `fnHashes.generated.ts` with `pnpm miondevx core codegen fnhashes`.

### 2. Four new factories, strategy-selected

Mirror the shape `createJsonEncoderFn` and `createParseFn` already use: one factory, a
compile-time `strategy` that picks the compiled family.

```ts
createPrepareForJsonFn<T>(val?, options?: {strategy?: 'clone' | 'mutate' | 'compact'}, id?)
createRestoreFromJsonFn<T>(val?, options?: {strategy?: 'clone' | 'mutate' | 'compact'}, id?)
createStringifyJsonFn<T>(val?, id?)
createStripUnknownKeysFn<T>(val?, id?)
```

After the rename the two sides share one vocabulary, so `clone` out pairs with `clone`
back:

| Factory | Strategy | Operation |
| --- | --- | --- |
| `createPrepareForJsonFn` | `clone` (default) | `prepareForJsonClone` |
| `createPrepareForJsonFn` | `mutate` | `prepareForJsonMutate` |
| `createPrepareForJsonFn` | `compact` | `compactForJson` |
| `createRestoreFromJsonFn` | `clone` (default) | `restoreFromJsonClone` |
| `createRestoreFromJsonFn` | `mutate` | `restoreFromJsonMutate` |
| `createRestoreFromJsonFn` | `compact` | `compactFromJson` |
| `createStringifyJsonFn` | — | `stringifyJson` |
| `createStripUnknownKeysFn` | — | `stripUnknownKeysWire` |

`createStripUnknownKeysFn` is the blanking pre-pass, not a clone: it sets undeclared keys
to `undefined` on incoming JSON before a restore walks it. That is different from
`createCloneExactShapeFn`, which copies a live value keeping only declared properties. Say
which is which on the docs page, the two are easy to confuse.

`createJsonDecoderFn` keeps `strip` / `preserve` / `compact`. Its `strip` blanks keys
(`ukuw` + `rj`) rather than cloning, so the word is accurate there and must not be changed
to match.

TypeScript, `packages/run-types/src/createRTFunctions.ts`:

- Add the option types next to `ParseStrategy` (line 341) and the JSON strategy types
  (line 344): `PrepareForJsonStrategy` / `PrepareForJsonOptions`,
  `RestoreFromJsonStrategy` / `RestoreFromJsonOptions`. Both strategy unions are
  `'clone' | 'mutate' | 'compact'`.
- Add the four factories after `createFormatTransformFn` (line 517). The two
  strategy-carrying ones use `createTypeFnArgsFunction` (line 400, the 3-arg
  `(val, options, args)` layout so options land at `lastIndex - 1`); the two option-less
  ones use `createRTFunction` (line 414). Each gets the same two overloads every other
  factory has, run-type form first:

  ```ts
  export const createPrepareForJsonFn = createTypeFnArgsFunction<PrepareForJsonFn>(
    'createPrepareForJsonFn',
    identityValueFn
  ) as unknown as (<T>(
    runType: RunType<T>,
    options?: CompTimeFnArgs<PrepareForJsonOptions>,
    id?: InjectTypeFnArgs<T, 'prepareForJsonClone'>
  ) => PrepareForJsonFn) &
    (<T>(val?: T, options?: CompTimeFnArgs<PrepareForJsonOptions>, id?: InjectTypeFnArgs<T, 'prepareForJsonClone'>) => PrepareForJsonFn);
  ```

  Fallbacks: identity for prepare / restore / strip (correct for every value-shaped
  primitive, same as `getRTFunction`'s default), `JSON.stringify` for stringify.
- The marker in each signature names the DEFAULT strategy's key
  (`'prepareForJsonClone'`, `'restoreFromJsonClone'`); the scanner swaps it, exactly as
  `createParseFn` names `'parse'`.
- Rewrite the block comment at lines 508-521 and the `RTFunctionByKey` doc comment at
  705-717. "No factory" is no longer true. `getRTFunction` stays, described as the generic
  resolver a wrapper with its own marker uses.

`packages/run-types/src/index.ts`

- Export the four factories and the four new option / strategy types from the
  `./createRTFunctions.ts` block (line ~300), and fix the block's leading comment, which
  states the primitives have no factory.

Go:

- `internal/cachegen/operations/operations.go` — set `Factory` on the eight rows
  (lines 209-224) per the mapping table.
- `internal/compiler/resolver/scan.go` — in `computeSiteFn` (line 1166), next to the
  `op.Name == "parse"` arm (lines 1196-1203), add the same swap for `prepareForJsonClone`
  and `restoreFromJsonClone`. There is no project-wide default for these, so only the
  site's own strategy is read (`extractStrategyOption`) and an absent one keeps the default
  operation. Add `prepareStrategyOperation` / `restoreStrategyOperation` beside
  `parseStrategyOperation` (line 1507). An unknown strategy string reports the same
  diagnostic a bad `createParseFn` strategy does.
- `cmd/gen-fn-catalog/main.go` — drop the `group` struct, the `groups` var and `groupOf`
  (lines 30-52, 85-92). Skip `!op.Public` rows so `classSerializerReg` stops reaching the
  page. Payload becomes `{functions}`.

### 3. The catalog page

`container/website/app/components/content/FunctionCatalog.vue`

- Strip the search box, the group filter, `haystack`, `matches`, `shownCount`, `filtered`,
  `clearFilters` and the group sections (lines 29-60 and their template). What is left is
  one table: Factory, Marker name, What it does. Fold `options` and `variants` into the
  description cell (for example "strategy: clone, mutate, compact"), and leave the
  emitted-code tag out, since the page's note about it goes away too.

`container/website/app/components/content/go-generated/functions-catalog.json`

- Regenerate with `pnpm miondevx core codegen fncatalog`. `pnpm miondevx core codegen all
  --check` is a CI gate, so this must be committed.

`container/website/content/02.runtypes/02.guide/15.all-compiled-functions.md`

- Rewrite. Drop the "searchable" description, the paragraph about which ones have a
  factory, and the "Emitted as" note. Keep the tip that a function is only compiled where
  it is asked for. Then: `::function-catalog`, one code example calling every factory, one
  code example recovering functions from an `InjectTypeFnArgs` marker.

`container/website/content/02.runtypes/02.guide/08.compiler-markers.md`

- The section "Requesting Functions That Have No Factory" (lines 146-163) is now false.
  Retitle it to describe recovering any function from a marker, drop the "no factory of
  their own" sentence, and drop its table, which the catalog page now carries.

`container/website/content/02.runtypes/02.guide/05.json-serialization.md`

- Line 143 says the prepare and restore pieces have no factory. Replace with the new
  factories and a link to the catalog page.

Grep the whole content tree for the two old marker names and for "no factory" before
calling the docs done.

### Examples

`packages/examples/src/`

- New `guide/all-factories.ts`: every factory for one type, one call each. Pair the
  `clone` prepare with the `clone` restore so the mirror is visible.
- New `guide/all-factories-markers.ts`: one wrapper declaring an `InjectTypeFnArgs` marker
  that names several functions, recovering each with `getRTFunction`.
- Fix the stale "have no factory" comments in `guide/json-value-level.ts` (lines 6-8) and
  `guide/markers-value-level-recover.ts` (lines 3-6).

## Tests

- **Go, `internal/cachegen/operations/fnhash_test.go:266`** —
  `TestFactoryIsSetForFactoryBackedOperations` currently asserts the eight are
  factoryless. Invert it: every `Public` operation names a factory, and drop the
  `factoryless` map.
- **Go, resolver** — a strategy-selects-the-operation test beside
  `internal/compiler/resolver/parse_test.go` and `parse_strategy_default_test.go`: each of
  the three prepare strategies and the three restore strategies resolves to its own
  operation and its own fnHash, and an absent strategy picks the default.
- **Go, rename** — the existing family tests keep passing under the new names, and a
  retired name reaches the ordinary unknown-function diagnostic rather than resolving.
- **JS, `packages/run-types/test/features/`** — a new `jsonValueFactories.test.ts` in the
  style of `parse.test.ts` (these run through the devtools transform, so the markers
  really resolve). Per factory: the compiled function round-trips a type carrying a
  bigint, a Date and a Map; `mutate` keeps undeclared keys while `clone` drops them in
  BOTH directions; the compact pair round-trips through a positional array;
  `createStringifyJsonFn` output parses back to what `createPrepareForJsonFn` produced;
  `createStripUnknownKeysFn` blanks undeclared keys rather than removing them.
- **Equivalence** — each new factory's result matches the same function recovered via
  `getRTFunction` with its marker key, so the two roads cannot drift.
- **Marker test coverage rule** — the new factories are marker API, so both `getRunTypeId`
  call shapes get paired tests, per `ts-go-runtypes/CLAUDE.md`.
- **No-plugin fallbacks** — a call with the plugin inactive degrades to identity, and
  `createStringifyJsonFn` to `JSON.stringify`.
- **Router** — `packages/router` decodes through the renamed families, so its own suites
  must pass unchanged. The `clone` strategy still strips on the way in.

## Docs

Pages and examples are listed under **3. The catalog page** and **Examples** above. In
short: `15.all-compiled-functions.md` is rewritten, `08.compiler-markers.md` and
`05.json-serialization.md` lose their "no factory" claims, two example files are new and
two get their comments fixed.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over
every page and example this change touched, review its report against the code, and commit
it as its own commit.

## Fuzzing

Worth it, and cheap: the prepare / restore pairs are a round-trip oracle. Add the new
factories to the existing value fuzz suite (`packages/run-types/test/fuzz/value/`) so
`restore(prepare(v))` deep-equals `v` for each matched strategy pair (`clone`/`clone`,
`mutate`/`mutate`, `compact`/`compact`) over random values.

## Out of scope

- `overrideX` registrations for the new factories. `createParseFn` and
  `createJsonSchemaFn` have none either, so this is a separate ask.
- `createJsonDecoderFn`'s `strip` / `preserve` strategy names. Its `strip` blanks keys
  rather than cloning, so the words are already accurate.
- The `rj` / `rjs` family tags. Opaque emitted-code names, and moving them churns cache
  basenames for no reader benefit.
- `classSerializerReg`. It stays `Public: false` internal plumbing.
- Removing `getRTFunction`. It is still how a wrapper with its own marker resolves a
  function, and `@mionjs/router` uses it.

## Done when

- The restore pair is renamed everywhere, the old names resolve nowhere, and no alias was
  added.
- The four factories ship, are exported from `@mionjs/run-types`, and every `Public`
  operation in the registry names a factory.
- Every test above passes: `pnpm test` (or `pnpm run test:ci`) and
  `go -C ts-go-runtypes test ./internal/... ./cmd/...`.
- `pnpm miondevx core codegen all --check` is clean with the regenerated fnHash table and
  catalog JSON committed.
- `pnpm run lint` and `pnpm run format` are clean.
- The catalog page renders one table with no search box and no groups, plus the two code
  examples.
- The website runs locally and a screenshot of the rewritten page is sent to the user (the
  `website-browser` skill drives this).
- The PR carries the `website` label (the content tree and `packages/examples/` changed)
  and `pre-publish-e2e` (new public exports plus a renamed public marker name).
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every
  touched source file, each committed on its own.
