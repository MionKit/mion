---
type: feature
spec: full-plan
status: done
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

## What shipped

Three commits: the rename, the factories, the page.

### 1. The restore pair renamed

| Old | New | Tag |
| --- | --- | --- |
| `restoreFromJson` | `restoreFromJsonMutate` | `rj`, unchanged |
| `restoreFromJsonStrip` | `restoreFromJsonClone` | `rjs`, unchanged |

No alias and no `SuggestFnKey` entry for the old NAME: it reaches the ordinary MKR015
unknown-name path. The `rjs` TAG still suggests, because tags did not move.

Both registries moved together, which the plan called out and which
`TestFamilies_RegistryRoundTrip` enforces: the operation `Name` in
`internal/cachegen/operations/operations.go` AND the `constants.CacheModules` map key,
whose module names became `restoreFromJsonMutateModule` / `restoreFromJsonCloneModule`.
Following the prepare side's precedent, only the clone arm's Go symbol moved
(`RestoreFromJsonStripEmitter` → `RestoreFromJsonCloneEmitter`, `json_restore_strip.go` →
`json_restore_clone.go`); `RestoreFromJsonEmitter` and `json_restore.go` kept their names,
matching `PrepareForJsonEmitter` / `json_prepare.go`.

The rename ran as one ordered pass over 76 files (longest token first, then a negative
lookahead for the bare one), then five generated artifacts were regenerated: `fnhashes`,
`constants`, `fncatalog`, and both diagnostic catalogs.

**`diskcache.FormatVersion` 16 → 17.** This was the one real hazard and it was not in the
original spec. The cache basename is the TAG, which did not move, but the fnHash is baked
inside the payload and the header check is structural-id only, so a v16 file would have
been read as a hit feeding the runtime a key nothing registers. Same failure mode v14
already handled. `packages/devtools/test/cache-disk.test.ts` pins the number and was
updated.

**`packages/core` was in the rename surface and the spec missed it**: `constants.ts`
(`JIT_FUNCTION_IDS`, `DECODE_FAMILY_BY_STRATEGY`), `routerUtils.ts` and
`runtypes/mionAdapter.ts`. All three name families by their marker token, so the mechanical
rename covered them, but they are the reason core's suite had to pass.

### 2. Four factories

```ts
createPrepareForJsonFn<T>(val?, options?: {strategy?: 'clone' | 'mutate' | 'compact'}, id?)
createRestoreFromJsonFn<T>(val?, options?: {strategy?: 'clone' | 'mutate' | 'compact'}, id?)
createStringifyJsonFn<T>(val?, id?)
createStripUnknownKeysFn<T>(val?, id?)
```

`clone` is the default on both sides, so a prepare and a restore are written as a pair.
The scanner routes the strategy through one table-driven helper,
`jsonValueStrategyOperation` in `internal/compiler/resolver/scan.go`, rather than one
helper per family: the two differ only in which names they map to. An unrecognised
strategy takes the default silently, matching `parseStrategyOperation` exactly. The plan
had claimed a diagnostic here; there is none, and the TS union is the guard.

The three fn aliases took `<T = unknown>` (`PrepareForJsonFn<T>` returning `JSONShape<T>`,
`RestoreFromJsonFn<T>` returning `DataOnly<T>`, `StringifyJsonFn<T>`). Source-compatible
because `DataOnly<unknown>` and `JSONShape<unknown>` both collapse to `unknown`, already
pinned by `test/types/dataonly.compile.test.ts` and `test/types/jsonShape.test.ts`.

`createJsonDecoderFn` kept `strip` / `preserve` / `compact`: its `strip` blanks keys
(`ukuw` + `rj`) rather than rebuilding, so the word is accurate there.

Every `Public` operation now names a factory, so
`TestFactoryIsSetForFactoryBackedOperations` was replaced by
`TestEveryPublicOperationNamesItsFactory`.

### 3. The page

`FunctionCatalog.vue` went 253 → 74 lines: the search box, the group filter, the group
sections and the per-function cards are gone, replaced by one table (Factory, Marker name,
What it does). `cmd/gen-fn-catalog/main.go` went 125 → 89 lines, no longer emits `groups`
and skips non-Public rows, so `classSerializerReg` stopped reaching the page. 24 rows, each
with a factory.

`15.all-compiled-functions.md` is the table plus two examples, `all-factories.ts` and
`all-factories-markers.ts`. The `08.compiler-markers.md` section "Requesting Functions That
Have No Factory" became "Turning a Handle into a Function", losing the false sentence and
its table (the catalog page carries the names now); `05.json-serialization.md` now points at
the factories. `json-value-level.ts` was rewritten onto them, which made it much shorter.

## Tests

- **Go, new** `internal/compiler/resolver/json_value_strategy_test.go`: nine tests covering
  both defaults, each strategy on each side, the option-less pair, an unrecognised strategy
  keeping the clone, and the marker rule's paired static / reflection / equivalence trio.
- **Go, changed** `TestEveryPublicOperationNamesItsFactory`; and
  `json_restore_clone_test.go` stopped hardcoding the literal hash `NWjz_self`, deriving it
  from `operations.PlainHash` instead so it cannot rot on the next rename.
- **JS, new** `packages/run-types/test/features/jsonValueFactories.test.ts`: 12 tests. The
  clone pair round-trips a bigint, a Date and a Map; mutate keeps undeclared properties
  where clone drops them on both sides; the compact pair round-trips through a positional
  array with no property names on the wire; stringify agrees with prepare; strip blanks
  rather than removes. Plus, per factory, an equivalence assertion that the factory returns
  the SAME compiled function `getRTFunction` resolves, and both marker call shapes.

Full suite green: 12,397 JS tests across all 23 projects, and the whole Go suite.

## Fuzzing: none added, and why

The round-trip property is already covered.
`test/fuzz/roundtrip/allStrategyRoundtrip.integration.test.ts` compiles every codec
strategy for one generated type and checks round-trip identity and cross-strategy
agreement, and its harness wires a `rebuild` lane that reaches `rjs` through a marker;
`test/fuzz/value/fuzz.integration.test.ts` recovers `rj` and `rjs` the same way. The
prepare side rides along, since the `clone` encoder IS `pjs` + stringify, `direct` IS `sj`
and `compact` IS `cj`. The only new fact was factory-to-marker equivalence, which is an
assertion, not a property over random values, so it went in the feature test.

## Out of scope, as planned

`overrideX` for the new factories; `createJsonDecoderFn`'s strategy names; the `rj` / `rjs`
tags; `classSerializerReg`, still non-Public plumbing; removing `getRTFunction`, which is
still how one marker carries several families; a project-wide prepare/restore default.
