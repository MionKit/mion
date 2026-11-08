---
type: feature
spec: full-plan
status: done
created: 2026-11-08
---

# Mock data generators: a stringly-typed `generator` format param

## Problem

Mocks of plain strings are random (`aZ3kQ`). The only way to get realistic values is `mockSamples` (or a `MockData<T>`
pool), written by hand per field. drizzle-seed solves this with named generators (`funcs.lastName()`). mion should
offer the same names as a string format param, so a type says what its mock looks like:

```ts
import type * as TF from '@mionjs/run-types/formats';
import type {GEN} from '@mionjs/run-types/formats';

type User = {
  firstName: TF.String<{maxLength: 120; generator: GEN.firstName}>;
  lastName: TF.String<{maxLength: 120; generator: GEN.lastName}>;
};
```

`GEN.firstName` is just the string literal type `'firstName'`, so `generator: 'firstName'` is the same type and
the same id. `GEN` exists for autocomplete.

Decisions already taken:

- Stringly typed. `GEN.<name>` is only an autocomplete helper: `GEN.lastName` and `'lastName'` are the same type and
  the same id. All names importable as one module (`GEN`), usable in type AND value positions.
- `generator` IS part of the structural type id. Whatever is reflected must be in the id, or equal ids share one node
  and the wrong twin is reflected (the `readonly` precedent in `ts-go-runtypes/internal/cachegen/runtype/typeid/AGENTS.md`).
  So `firstName` / `lastName` twins above get distinct ids and never hit `format-sample-conflict`.
  `mockSamples` stays the one id-irrelevant param (`typeid/formats.go:736-760`, no code change, extend the comment).
- Names = drizzle-seed names exactly, so a later helper can map mion types to drizzle-seed `refine` funcs.
- Mock code is plain runtime code (not JIT, no pure fns): generators are ordinary functions on the
  `@mionjs/run-types/mocking` subpath, drawing ONLY through `MockRandom` so seeded mocks stay reproducible.
- mion's OWN trimmed ASCII word lists (~50KB total). Never copy drizzle-seed's datasets (1.7MB, Apache-2.0).

### Generators shipped (strings only)

| Name | Output |
|---|---|
| `firstName`, `lastName` | letters only (`Alpha` always fits) |
| `fullName` | `First Last` |
| `email` | `adjective_first@domain`, lowercase |
| `phoneCountryCode` | country calling code only, like `+44` |
| `phoneNumber` | with country code, E.164 `+<cc><digits>` (drizzle-seed name) |
| `phoneNumberLocal` | without country code, national digits only |
| `country`, `city`, `jobTitle` | list picks |
| `state` | 50 US states |
| `streetAddress` | `N Name Suffix` |
| `postcode` | US `#####` or `#####-####` |
| `companyName` | `Last Suffix` / `A - B` / `A and B` / `A, B and C`, 20 suffixes |
| `loremIpsum` | one sentence ending in `.`, built to fit the length bounds |

The three phone generators share one country table (code + national number length), so a phone with and without
country code stay consistent. The built-in data is deliberately small: real international phone rules, addresses and
locales get complex fast, and teams usually bring their own. That is what custom generators are for (next section).

### Custom generators

A team registers its own generator once, and mocks find it by name, like a built-in:

```ts
import type * as TF from '@mionjs/run-types/formats';
import {registerMockGenerator} from '@mionjs/run-types/mocking';

declare module '@mionjs/run-types/formats' {
  interface CustomMockGenerators {
    phoneNumberUk: true;
  }
}

registerMockGenerator('phoneNumberUk', ({random}) => '+44 7' + random.string(9, '0123456789'));

type Contact = {phone: TF.String<{maxLength: 16; generator: 'phoneNumberUk'}>};
```

- The name is still a plain string literal and still part of the id.
- `CustomMockGenerators` is an empty interface users extend (TypeScript declaration merging), so a custom name type
  checks and a typo is still a type error. `MockGeneratorName = keyof BuiltinMockGenerators | keyof CustomMockGenerators`.
- A custom generator gets the same context object as a built-in (`random: MockRandom`, `lo` / `hi` length bounds, the
  format params), so a seeded mock stays reproducible when it draws through `random`.
- A built-in name cannot be registered again (`registerMockGenerator` throws): the build checks rely on the built-in
  length / character table. Teams pick their own name (`phoneNumberUk`). Registering the same custom name twice throws
  (shipped: it replaces the old one instead, so a reloaded setup module can register again).
- Mocking a name nobody registered throws: "mock generator `x` is not registered; call registerMockGenerator('x', fn)
  before creating the mock".

Not ported (mion already covers them): `date`, `time`, `timestamp`, `datetime`, `year`, `int`, `number`, `uuid`,
`inet`, `interval`, `string`, `boolean`, `json`, `bitString`, `default`, `valuesFromArray`, `point`, `line`, `vector`,
`geometry`, `intPrimaryKey`, `weightedRandom`, and the `isUnique` / `arraySize` options.

### Facts found while planning (verified)

1. `GEN.lastName` in a VALUE position fails the build today: `CheckLiteral`
   (`ts-go-runtypes/internal/compiler/comptimeargs/comptimeargs.go:70-99`) has no property-access arm and reports
   `marker-comptime-arg-forbidden-construct`. Type positions are fine (`typeof lastName` is a string literal type,
   read like `'lastName'` by `TypeLiteralObject`, `typeid/formats.go:454`).
2. A `createMockDataFn`-only site runs NO format build checks: it carries only the formatTransform demand
   (`resolver/scan.go:603-640`); `ValidateParams` / `stringConditions` run only in the validate / validationErrors walks
   (`typefunctions/validate.go:121-131`, `formats/string/stringformat.go:36-107`). Generator checks would never fire
   for the main use case without step C3.
3. The value-first string builder is `TF.string` (`packages/run-types/src/formats/scalars.ts:25-42`), not `RT.string`.
4. The shipped `jsonSchema` document already emits all params as `rtFormatParams` (`schemadoc/render.go:205-210`), so
   `generator` rides along, `{portable: true}` strips it. No `x-` keyword needed. There is no schema-to-type importer.
5. The "FORMATS_MODULE overlay" named in `packages/run-types/src/formats/index.ts:10` and
   `test/suites/format-validation/Realworld.ts:8-11` does not exist. A value export `GEN` there is safe; fix both comments.
6. `childMatch.ts` (mock matcher for `contains` / `patternProperties` / `propertyNames` children) throws on an unknown
   string param key, so it needs a `generator` case, and has real bugs (Related bug B3).
7. The enrich check never descends into tuple / Map / Set slots (`enrichment/validate.go:395-434` handles arrays and
   objects only) though the scaffold emits `rt$slots` / `rt$keys` / `rt$values` (`emit.go:162-197`).

### Related bugs fixed in this PR (each its own commit + own test, reproduce first)

- **B1 enrich leaf keys collide with real fields.** `pool` / `min` / `max` are skipped as meta keys on OBJECT nodes too:
  `enrichment/validate.go:416-418` skips them in the unknown-field loop, `mirror/merge.go:98-107` `fieldKeys` drops them
  via `mockReservedKeys` (`mirror/reconcile.go:22-26`). A type with a real field `pool` is never checked and never
  merged / renamed by `enrich --update`. A bare `generator` key would add a 4th collision. Rule: a leaf key
  (`pool | min | max | generator`) is node settings only when its value is NOT an object literal (every MockData field
  value is an object node); `rt$*` keys stay meta always.
- **B2 UTF-16 vs code points.** `filterSamplesByLength` (`mocking/mockStringFormat.ts:110-119`) counts `.length`, Go
  `lengthSurvivors` (`formats/string/pattern.go:223-243`) counts code points: `['💩💩']` under `maxLength: 2` builds,
  then the mock throws. Count code points; fix the false prose "Lengths count UTF-16 code units"
  (`diagnostics/prose.go:533`) and regen.
- **B3 `childMatch.ts` string arms** (`mocking/childMatch.ts:244-255`): `allowedValues` / `disallowedValues` test
  `Array.isArray(param)` but the param is `{val}`, so the check is silently skipped (a `contains` child matches
  wrongly); `allowedChars` / `disallowedChars` call `patternTest({val})`, which throws; `minLength` / `length` use
  `.length`. Replace with one exact shared acceptor (`stringParamsAccept`, Plan step C2).
- **B4 stale docs:** `packages/run-types/src/go-generated/README.md` lists 2 of 5 generated files.

## Shipped (differences from the plan below)

- Word lists are smaller than planned (about 17KB): 225 first and 182 last names, 154 cities, a 50-row country
  table (name, calling code, national digits; US rows carry states and ZIP templates) that `country` also draws
  from, 68 job titles, 134 lorem words, 80 adjectives, 16 email domains, 33 street and 20 company suffixes.
- `loremIpsum` is capped at 40 words, so its span is `[2, 520]`. Composite generators always build to fit
  (no natural draws first), and each shape's reachable lengths are cached.
- Mock-only site checks (C3) run each format emitter's own validate check with a recording context at render time,
  after sample generation, keeping only the mock-relevant codes. No pure `MockSiteProblems` helper.
- Namespace members (C4) are read only when they resolve to a const; a function like `RT.boolean` stays refused.
- Custom generator names: see the Go section. The email `localPart` generator is pinned by a Go test with the exact
  `TypeFormat` spelling, since `TF.EmailParts` does not let users override `localPart`.
- The seeded snapshot is an explicit `toEqual`: inline snapshots cannot be written back under the plugin.
- Review additions: the table also records the characters a value can start with (`Leading`), so `allowedChars`
  without any of them fails the build; the enrich check accepts a nullable string, checks a variadic tuple's shared
  `rt$items` against every slot and reads `GEN.x` members; the mock walker reads a fixed tuple's `rt$slots`; the
  mock-only site check is built outside the family walkers on purpose (no family that checks formats reaches a
  mock-only site); the disk cache format moved to v25.
- Length bounds and char sets never fail the build or throw (user decisions after review). `generators/fit.ts`
  cuts a value to `hi` or pads it to `lo` with more draws (digits after digits, then words joined by a space, then
  joined as is, then pool letters); last, each char `allowedChars` / `disallowedChars` rejects becomes its other
  case, else a vowel for a vowel or a consonant for a consonant, else any allowed char. Custom generators get the
  same. `GeneratorProblems` keeps the name and combination checks and adds only what leaves nothing to build from:
  `length: 0` with `allowedChars` (it rejects '') and, for a built-in at a non-zero length, `disallowedChars` covering
  every letter, digit and space (`ignoreCase` folds like a JS regex). So the Go table holds only names and summaries:
  `Lengths`, `Chars`, `Required` and `Leading` are gone, and the generated `mockGeneratorMeta.generated.ts` became
  `builtinMockGenerators.generated.ts` (names and `MOCK_REPLACEMENT_CHARS`, the one replacement set). The
  sections below still describe the planned length and char checks.
- Architecture review follow-ups: the replacement also tests each char against the format's `pattern` on its own, so
  a char-class preset (`Alpha`, `Numeric`) gets `fullName` / `phoneNumber` values (`OliviaxGarcia`); a generator
  out of draws throws `MockGeneratorExhaustedError`, a sampling error, so a union tries a sibling arm; a MockData
  generator skips a named-format union arm (it mocks itself) and the enrich check needs every plain / String arm to
  accept it; `isRegex` joins the rejected combinations; an `allowedChars` value never shrinks below one char;
  registering a custom name again replaces it (Vite HMR re-runs setup modules).

## Plan

### Public API

- New generated file `packages/run-types/src/go-generated/mockGenerators.generated.ts` = the `GEN` namespace only.
  Per name:
  ```ts
  /** Last name, like `Smith`. 2 to 14 letters. drizzle-seed `lastName`. */
  export const lastName = 'lastName';
  export type lastName = typeof lastName;
  ```
- New generated file `go-generated/mockGeneratorMeta.generated.ts`, import-free:
  `export interface BuiltinMockGenerators {city: true; ...}`, `export interface MockGeneratorMeta {lengths: readonly
  (readonly [number, number])[]; chars: string; required: string; leading: string}`,
  `export const mockGeneratorMeta`.
- `formats/index.ts`: `export * as GEN from '../go-generated/mockGenerators.generated.ts';`, and declares, directly in
  this file so `declare module '@mionjs/run-types/formats'` augments it without going through a re-export:
  `export interface CustomMockGenerators {}` and
  `export type MockGeneratorName = keyof BuiltinMockGenerators | keyof CustomMockGenerators;`. Verify with a type test
  that augmenting the subpath merges; if TypeScript resolves it differently, move both to the file the subpath maps to.
  Type use: `TF.GEN.lastName`. Value use: `import {GEN, string} from '@mionjs/run-types/formats'`. No new subpath, no
  `exports` / `sideEffects` change.
- `StringParams` (`formats/string/stringFormats.ts:155-171`): `generator?: MockGeneratorName` (mock-only, validation
  ignores it). Covers `StringParamsValueFirst` (`:178`), every `Override<StringParams, …>` preset, email `localPart`,
  and `RefinableParamsByFamily.stringFormat` (`formats/refineFormat.ts:17`), so drizzle
  `refineTableType(users, {name: {generator: 'fullName'}})` works with no change.
- NOT on number / bigint params, `EmailParams`, `DomainParams`, `UrlParams`.
- `MockData` string leaf (`enrich/mockData.ts:43-44`): `{pool: string[]; generator?: MockGeneratorName}` (mirrors the
  number leaf's `pool: []` beside `min` / `max`). Import `MockGeneratorName` outside the `#region mockdata-extract`
  block, as `enrich/friendlyText.ts:9` imports `FormatErrorKeys`; `test/types/enrichHarness.ts:44` gains a preamble
  from the meta file (widen its strip regex to `^export (type|interface|const) `). Update the header note `mockData.ts:5-9`.
- `MockDataNode` (`mocking/mockTypes.ts:82-96`): `generator?: string`.

### Go source of truth + codegen

- New `ts-go-runtypes/internal/cachegen/typefunctions/formats/mockgenerators.go` (package `formats`, already imported by
  `formats/string` and `enrichment`):
  ```go
  type LenSpan struct{ Min, Max int } // code points, inclusive
  type MockGenerator struct {
      Name     string    // drizzle-seed name = TS const/type = GEN member
      Summary  string    // JSDoc line
      Lengths  []LenSpan // exact achievable lengths, ascending, disjoint (postcode = [5,5] + [10,10])
      Chars    string    // superset of output chars, sorted
      Required string    // chars in EVERY output, sorted
      Examples []string
  }
  func MockGenerators() []MockGenerator
  func LookupMockGenerator(name string) (MockGenerator, bool)
  // fromData: a MockData generator, where format mockSamples / generator lose to it.
  func GeneratorProblems(name any, params map[string]any, fromData bool) []string
  ```
  Custom names (as shipped): any name that is not built in is treated as a custom generator, so the build checks only
  its param combinations. TypeScript catches a typo through `MockGeneratorName` (built-ins plus the extended
  `CustomMockGenerators`), and the mock throws "not registered" at run time. Reading the user's interface
  augmentation from Go was dropped as fragile. A widened `generator: string` or a union is marked `unrecovered` by
  typeid (like an unreadable `pattern`) and reported as "must be one generator name".
  `GeneratorProblems` reasons: not one literal name (a widened union arrives as text via `NonLiteralFallback`,
  `typeid/formats.go:480`); beside `allowedValues`, `disallowedValues`,
  a top-level `mockSamples` (when not `fromData`; a pattern's own samples are fine, so `Alpha<{generator}>` is OK) or
  `contentMediaType`; `length` / `minLength` / `maxLength` never overlap `Lengths`; a `Required` char outside
  `allowedChars` (respect `ignoreCase`) or inside `disallowedChars`. No static pattern check (undecidable).
- New `cmd/gen-mock-generators` (`main.go`, `gen.go`, `gen_test.go` with `TestMockGeneratorsFilesInSync`), writes both
  TS files itself (like `gen-run-type-kind` / `gen-fn-hashes`). Add a `mockgenerators` entry to `CODEGEN`
  (`scripts/miondevx.mjs:151-186`) listing both files in `outputs` + `fmt`, so `codegen all --check` guards drift.
- Go tests: `TestMockGenerators_RowsSelfConsistent` (sorted, unique, identifier names, valid spans,
  `Required ⊆ Chars`, `Leading ⊆ Chars`), `TestGeneratorProblems` table.

### Diagnostics (follow the add-diagnostic skill)

- `format-generator-invalid`: FamilyRunType, LevelRuntimeError (code is produced, every mock call throws), ScopeGraph,
  registered beside `diagnostics/codes_runtype.go:220-229`. Headline (`messages.go`):
  ``TypeFormat mock generator `{generator}` cannot mock this format: {reason}``; reasons joined with `; `.
  Prose: Summary "A `generator` picks realistic mock values, so it must be one generator name, fit the format's
  length limits and characters, and not sit next to `allowedValues`, `disallowedValues`, `mockSamples` or
  `contentMediaType`. Otherwise every mock call throws.", Fix ``TF.String<{maxLength: 40; generator: 'lastName'}>``,
  Example ``createValidateFn<TF.String<{maxLength: 1; generator: 'lastName'}>>()``, NestedExample inside
  `{user: {name: …}}`. Emitted by a shared `checkGenerator(ctx, params)` inside `stringConditions`
  (`stringformat.go:73-107`), so root, email `localPart` (`email.go:105-106`) and every depth are covered.
- `enrich-mock-invalid-generator`: FamilyEnrich, LevelRuntimeError, ScopeNotSource, Severity Error, in
  `diagnostics/codes_mock.go:9-25`. Headline ``MockData generator `{generator}` cannot mock field `{field}`: {reason}``.
  Summary "A MockData `generator` must be one generator name, sit on a string field, and fit that field's format.
  Otherwise `createMockDataFn` throws at that field." Fix `name: {pool: [], generator: 'fullName'}`.
- Adjacent Go changes: `sampleDrawPool` (`formats/string/pattern.go:250-268`) returns nil when `generator` is set and no
  `allowedValues` (else `Alpha<{maxLength: 3; generator: 'firstName'}>` falsely fails sample bounds);
  `validateSamples` (`pattern.go:173-190`) skips the "no samples" branch; `enrichOneParams`
  (`resolver/pattern_enrich.go:117`) skips pattern sample generation; `ValidateParams` (`stringformat.go:331-333`)
  waives "`disallowedChars` requires `mockSamples`" when `generator` is set.
- Comptime prose `CodeCompTimeArgsForbiddenConstruct` / `NonLiteral` (`prose.go:~505-517`): a namespace-import member
  (`GEN.lastName`) counts as an imported const.
- `pnpm miondevx core codegen diag`, then rebuild `@mionjs/devtools`.

### Runtime (`@mionjs/run-types/mocking` only)

- Data `src/mocking/generators/words/*.ts`, own ASCII lists, ~50KB: ~1000 first + ~1000 last names, ~500 cities,
  ~195 countries, ~300 job titles, ~180 lorem words, ~200 adjectives, ~30 email domains, ~40 street suffixes,
  25 company suffixes, ~40 phone countries (calling code + national number length, shared by the 3 phone
  generators), 50 US states.
- `src/mocking/generators/index.ts`: `registerMockGenerator(name: keyof CustomMockGenerators, fn: GeneratorFn)`,
  exported from `@mionjs/run-types/mocking` (`mocking/index.ts`). Throws on a built-in name or a name registered twice.
  Lookup: built-in table, then the custom registry. Separate from the per-kind `registerMockingFunction`
  (`mocking/mockRegistry.ts`), which stays as is.
- `generators/builtins.ts`: `BUILTIN_SHAPES satisfies Record<keyof BuiltinMockGenerators, Shapes>` and `BUILTIN_GENERATORS` (`GeneratorFn`
  below). List generators pick uniformly among
  entries within bounds (lazy length index). Composites try a natural draw up to 8 times, then build to fit: component
  lengths chosen left to right, each limited to values from which the rest can still reach `[lo, hi]`. So when the
  build check passes, length never makes a mock throw.
- One context object, the same for built-in and custom generators:
  ```ts
  interface GeneratorContext {
    random: MockRandom;
    lo?: number; // length bounds, code points
    hi?: number;
    params: StringParams;
  }
  type GeneratorFn = (ctx: GeneratorContext) => string;
  ```
  An object, not positional args, so linked generators (Out of scope) can later add a field such as `ctx.shared`
  without breaking a single custom generator.
- Built-in data keyed by country from day one: one country row (ISO code, name, calling code, national number length,
  states list, postcode templates), US the only row with states and postcodes for now. `country`, `state`, `postcode`
  and the 3 phone generators all read this one table, so a later linked draw only has to share one country pick.
- `mockFromGenerator(name, params, random)`: a name in neither table throws the "not registered" message; work out
  `[lo, hi]` from `length` / `minLength` / `maxLength`; for a built-in, no overlap with the meta spans throws naming
  both ranges (custom names have no spans, so they rely on the filter below); up to 64 draws kept only if
  `stringParamsAccept(c, params)`; then throw "64 values failed pattern/allowedChars/disallowedChars/disallowedValues;
  relax them or drop the generator".
- `src/mocking/stringParamsAccept.ts`, exact, shared with `childMatch`: code points (as `lengthFiltered`,
  `mockStringFormat.ts:296`); fresh `new RegExp(source, flags)` per test; allowed/disallowed chars + values rebuild the
  validator's own regexes (`^[esc]+$`, `[esc]`, `^(?:a|b)$`, escape set ported from Go `regexpEscape`,
  `formats/string/shared.go:30-41`, `i` for `ignoreCase`); `contentMediaType` by parsing; `isRegex` by
  `new RegExp(v, 'u')`; `generator` / `mockSamples` / `transform` / `contentEncoding` pass; any other key throws.
- `mockStringParams` (`mockStringFormat.ts:69-98`): after the `allowedValues` line (`:70`) add
  `if (params.generator !== undefined) return mockFromGenerator(...)`. Order: allowedValues > generator > samples >
  char set > random.
- Walker (`mocking/mockType.ts:196-208`): after `dataPool`, a string-kind node with `typeof dataNode?.generator ===
  'string'` calls `mockFromGenerator` with the node's `stringFormat` params (or `{}`); any other format name throws a
  pointed message; non-string kinds ignore it. Order: data pool > data generator > format generator > format default.
  The format `transform` still applies after (`:33-36`).
- `childMatch.ts`: `case 'generator': break;` inside the B3 rewrite.
- `mockInvalid.ts` unchanged. Only fields with a generator change seeded output (plus the B2 / B3 paths).

### Enrich (Go, `ts-go-runtypes/internal/enrichment`)

- `mockLeafKeys` gains `generator` under the B1 rule, in `validate.go` and `mirror/reconcile.go`.
- Hygiene (`mirror/hygiene.go:200-236`): `mockRangeKeys` becomes `mockPoolSiblingKeys = {min, max, generator}`;
  `generator` counts only with a non-empty string literal or a property access value. Update the comment at `:172`.
- Scaffold (`emit.go:146-214`): a string leaf whose `stringFormat` declares `generator` emits
  `{pool: [], generator: '<x>'}` (complete; stays in sync since the id changes with the generator and the leaf is
  replaced on a type change, `mirror/merge.go:153-166`).
- Check (`validate.go`, `checkMockNode`): a leaf arm reading `literal.StringValue("generator")` calls
  `GeneratorProblems(name, fieldParams, true)` + "not a string field", emits `enrich-mock-invalid-generator`
  (`GEN.x` there is checked by TypeScript only). Descend `rt$slots` / `rt$keys` / `rt$values` too, with a per-kind
  coverage test.

### Other param lists that learn `generator`

- `schemadoc/leaf.go:76-79` `GenericParamKeys` (else `mion convert` demotes to the exact spelling).
- `formats/errorkeys_samples.go:17` gains `"generator": "firstName"` (the `mockSamples` precedent; the gate is the
  typecheck `test/types/formatErrorKeysCoverage.test.ts:55-56`), then `codegen errorkeys`.
- `MergeFormatAnnotations` (`typeid/formats.go:~176-205`) already errors on two different generators: add a test.

### Commits, in order

1. **C1 `fix(enrich)`** B1.
2. **C2 `fix(mocking)`** B2 + B3 (shared `stringParamsAccept`) + B4.
3. **C3 `fix(resolver)`** format checks at `createMockDataFn`-only sites (fact 2). Failing tests first with existing
   codes (`format-sample-out-of-bounds`, `format-invalid-params`) at a mock site, both call shapes, incl. a union
   member. Fix: carry `mockShaped` on the pending site (`scan.go:~633`); where SampleConflicts are raised
   (`scan.go:396-408`) run `reflection.WalkGraph` over the site's graph; per formatted node call a pure
   `formats.MockSiteProblems(kind, annotation) []Problem` (= `ValidateParams` + `sampleBoundsProblems` refactored out of
   `validateSampleBounds` + `GeneratorProblems` from C7, on the root and nested StringParams maps); emit with
   `diagnostics.New(code, site, args...)`, deduped per site.
4. **C4 `feat(comptimeargs)`** `KindPropertyAccessExpression` arm in `CheckLiteral`: when the left side resolves (after
   `ResolveImportAlias`) to a `SymbolFlagsValueModule` symbol, `traceIdentifier` the name. Covers `GEN.x`, `TF.GEN.x`.
   Prose + catalog regen.
5. **C5 `feat(formats)`** Go table, `gen-mock-generators`, generated files, `CODEGEN` entry, README table.
6. **C6 `feat(formats)`** public API + other param lists.
7. **C7 `feat(diagnostics)`** `format-generator-invalid`.
8. **C8 `feat(mocking)`** word lists, generators, `mockFromGenerator`, `mockStringParams` hook.
9. **C9 `feat(enrich)`** `MockData` type + walker data-node generator.
10. **C10 `feat(enrich)`** enrich scaffold / hygiene / check / reconcile.
11. **C11 `test(fuzz)`** Fuzzing section.
12. **C12 `docs`** Docs section.

## Tests

- **C1:** Go validate / merge / reconcile: (a) type `{name: string}`, literal `{name: {pool: []}, pool: {pool: []}}`
  → `enrich-mock-unknown-field` at `pool`; (b) type `{pool: {x: string}}`, literal `{pool: {y: {pool: []}}}` →
  unknown field at `pool.y`; (c) `--update` renames / orphans a real field `pool`. JS `enrichGen` / `enrichCheck`
  cases with real `pool` / `min` / `max` fields (the failing directions live in Go); enrich fuzz `negativeProbe` with a `pool` field
  (`test/fuzz/enrich/enrichModel.ts:440`).
- **C2:** astral sample under `maxLength`; a `contains: String<{allowedValues: {val: ['x']}}>` child over `string[]`
  with `minContains` whose mock must validate (fails today).
- **C3:** devtools fixture `format-sample-out-of-bounds-mock-only` + a case in `test/vite/buildFailure.spec.ts`.
- **C4:** imported namespace, re-exported namespace, `.d.ts` (`external_test.go`); a property of a plain object const
  and a namespace member that is a function stay refused.
- **C5:** the Go tests in the codegen section.
- **C6:** Go `TestFormatAnnotation_GeneratorInKey` beside `typeid/formats_test.go:261`. Resolver PAIRED tests (Marker
  test coverage rule): static `getRunTypeId<TF.String<{maxLength: 120; generator: 'lastName'}>>()` vs value
  `const s: TF.String<{maxLength: 120; generator: GEN.lastName}> = 'x'; getRunTypeId(s)` → equal ids;
  firstName / lastName twins → different ids, no `format-sample-conflict`; `TF.string({generator: GEN.lastName})` and
  `TF.GEN.lastName` converge on the literal's id (the resolver tests stand in for id-integrity rows). Type tests: both positions, `@ts-expect-error` for
  `'nope'` and for generator on `Email` / `Number`, `keyof BuiltinMockGenerators` equals `(typeof GEN)[keyof typeof GEN]`.
  `test/types/mockGenerators.test.ts` (refinement) + a refined column in each dialect's `typeTables.spec.ts`.
- **C7:** `resolver/format_generator_test.go`, Static / Value pairs modelled on `format_pattern_unreadable_test.go:34-108`,
  nested position, email `localPart`, mock-only site, negatives (Alpha + firstName clean; disallowedChars without
  samples clean). `TestDiagExamples_*` pass. Devtools fixtures `format-generator-invalid` and
  `format-generator-invalid-mock-only`.
- **C8:** `test/features/mockGenerators.test.ts`: 200 draws per generator validate + match a shape regex; bounded
  variants; `Alpha` / `Lowercase` / `EmailParts.localPart`; a contains child; both call shapes.
  Phone: the 3 generators agree (local number = full number minus its country code, for the same seeded country).
  Custom generators: `test/features/mockCustomGenerators.test.ts` registers one, mocks it standalone, inside an
  object, in a `MockData` node and seeded (same seed → same value); unregistered name throws the message; registering
  a built-in name or the same name twice throws. Type test: an augmented `CustomMockGenerators` name is accepted, a typo
  still errors. Go resolver test: a non-built-in name is not reported, both call shapes (TypeScript catches a typo
  through `MockGeneratorName`).
  `suites/mocking/mockGeneratorMeta.test.ts`: spans exact from the data, `chars ⊆`, `required ⊆` every output over
  2000 seeded draws and every span edge, GEN keys = meta keys = `BUILTIN_GENERATORS` keys. `mockSoundness.test.ts` rows.
  `mockSeed.test.ts` generator rows + an inline snapshot at seed 42 (it pins no golden values today).
- **C9:** `suites/mocking/mockData.test.ts` (precedence chain, bounds kept, Email field throws);
  `mockData.compile.test.ts` (accepts `{pool: [], generator}`, rejects `'nope'`, type budget unchanged).
- **C10:** Go emit / hygiene / validate / merge (the new code firing, `--update` keeping `generator`), a Go coverage
  test looping every kind over the scaffold and check walks; JS `enrichGen` / `enrichCheck` run the prefilled case.

## Docs

- `container/website/content/02.runtypes/03.type-formats/02.string.md`: new section "Realistic Mock Values" after
  "Mock Values for Patterns" (`:79`), code-import from `packages/private-examples/src/guide/type-formats-string.ts`,
  a 15-row table (name, example), then a "Custom Generators" subsection (augment `CustomMockGenerators`, call
  `registerMockGenerator`, use the name), code-imported from a new `packages/private-examples/src/guide/custom-mock-generator.ts`.
- `container/website/content/02.runtypes/02.guide/07.mocking.md`, existing section "Format-Aware Mocks": one bullet +
  link.
- `container/website/content/02.runtypes/05.ai-integration/03.mock-data.md`: option-table row `generator`.
- `container/website/content/02.runtypes/04.drizzle-orm/00.drizzle-overview.md:105`: one refine example clause.
- `docs/AI_ENRICHMENT.md`: node model, type sketch (`:402-417`), MockData diagnostics table (`:470-480`).
- `packages/run-types/skills/runtypes-mock-data/SKILL.md` + `example.md`: names, precedence, generator vs pool, the new code.
- Diagnostics pages regenerate via `codegen diag`. Comments at `formats/index.ts:10` and `Realworld.ts:8-11` (fact 5).

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Fuzzing

- Property test `packages/run-types/test/fuzz/type/mockGenerators.unit.test.ts` (fuzzing skill rules first): random
  generator × bounds near span edges × optional `allowedChars` / `disallowedChars`. Oracle: when a TS mirror of
  `GeneratorProblems` over the meta file is empty and only length + required-char limits are set, `mockFromGenerator`
  never throws; every output satisfies an independent reference (code-point length, `Required ⊆ out ⊆ Chars`) and
  `stringParamsAccept`; same seed twice → same output. Negative control: append `'x'` to one output, a rule fires.
- Add generator leaves to `test/fuzz/core/runTypeGen.ts:50` so `mockSeedDeterminism` covers them.
- No typeFuzz `FORMAT_LEAVES` rows: each needs a schema twin sharing its id, and `generator` has none.
- Optional: one JSON case file read by both the Go and TS `GeneratorProblems` tests (parity).

## Out of scope

- The drizzle-seed `refine` mapping helper.
- `generator` on Email / Domain / Url / number / bigint formats.
- `isUnique`, `arraySize`, any state shared between mock calls (linked generators below share state only within one call).
- Static pattern-compatibility checks; a generator-aware invalid mock; `enrich-mock-invalid-pool`.
- Overriding a built-in generator, and build-time length / char checks for custom generators.
- Linked generators (a `state` that matches the `country` drawn for the same object). Kept possible by the context
  object and the per-country table. Intended shape, for whoever builds it later:
  - `ctx.shared(key, draw)`: the first generator in a scope that asks for `key` (say `'country'`) runs `draw` and stores
    the result; every later ask in that scope gets the stored value. Field order stops mattering: `state` may run
    before `country` and both still agree.
  - Scope = the nearest enclosing object, opened lazily by the walker on the per-call options bag (where `random`
    already lives). Each array item gets its own scope; lookups walk up to parent scopes first.
  - Draws go through `ctx.random`, so seeded mocks stay reproducible. Runtime only: no type, id or param change.
- Locale-specific built-in data (addresses, postcodes, phone formats beyond the small country table).
- Suggesting a generator from a field name in the scaffold.
- Unrelated, delegated when this todo was filed and merged before this work: `sideEffects` could drop the mock
  format registrations.

## Done when

- `go -C ts-go-runtypes test ./internal/... ./cmd/...` green; `pnpm miondevx core codegen all --check` clean;
  `pnpm run lint` and `pnpm test` green on a bootstrapped host.
- New devtools fixtures fail the build with the right code and location, incl. mock-only sites.
- All 15 built-in generators mock values that pass their own validator, alone and under bounds.
- A registered custom generator mocks by name (standalone, nested, `MockData`, seeded); an unregistered name throws.
- `GEN.x` works in type and value positions and gives the same id as the plain literal; firstName / lastName twins get
  different ids.
- `refineTableType` with a `generator` compiles and mocks.
- Enrich scaffold, check, `--update` and hygiene handle `generator` and a real field named `pool`.
- Seeded snapshots stable; docs pages and the mock-data skill updated.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file, each
  committed on its own.
