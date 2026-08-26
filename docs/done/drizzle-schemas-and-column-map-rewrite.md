---
type: feature
spec: full-plan
status: done
created: 2026-08-26
---

# @mionjs/drizzle rewrite: schemas from tables + format-keyed column maps

## ⚠️ POST-SHIP REVISION (2026-08-27): the schemas-from-tables lane was REMOVED

After review the createSelectSchema / createInsertSchema / createUpdateSchema /
createEnumSchema lane described below was deleted again, by decision. Reason: the
drizzle-to-runtypes direction is inherently LOSSY. A table can only express base
shapes (text, varchar length, enum values, nullability); it has no vocabulary for
the rich format params (Email, URL, integer min/max, patterns) that runtypes types
carry, so schemas derived from tables silently drop most validation rules (varchar
length itself only survived as a bolted-on runtime guard outside the compiled
validator). Full fidelity exists only in the types-first direction, which is why
the package was designed types-first originally.

Replacement: the `InsertModel<T, Generated, Defaulted>` / `SelectModel<T>` /
`UpdateModel<T, Generated>` type utilities (`src/types/models.types.ts`). They are
plain type transforms over the app type T, so every format and its params survive,
the compiled validators for route inputs typed with them are full fidelity, and
the payloads flow straight into drizzle's `.values()` / `.set()` / select rows
(pinned by `stubs-formats-mappings/postgres.stub.ts` and `src/types/models.spec.ts`,
which also carries the marker-coverage pair and the shared-compiled-fn
reference-equality proof).

Everything else below DID ship and stays: the 20/20 runtime format maps, the
dispatch fix, literal-union enum columns, the format-keyed type-level column maps
with exhaustiveness asserts, the dead-lane/dead-utils removal, the validator
`bigintFormat` fix, and the upstream FormatNameOf/FormatParamsOf exports.

## Problem

`@mionjs/drizzle` only maps one way: TypeScript type to drizzle table
(`toDrizzlePGTable<T>` and siblings). Drizzle users normally work the other way:
the table is the source of truth and validation schemas are derived from it
(the drizzle-zod / drizzle-typebox convention: createSelectSchema,
createInsertSchema, createUpdateSchema). That direction is missing.

The existing direction also carries known rot from the ts-runtypes integration:

- The TYPE-LEVEL column inference is dead (documented at
  `packages/drizzle/src/types/common.types.ts:24`). It matches `{brand: string}`,
  which nothing produces anymore; formats carry symbol sentinels
  `__rtFormatName` / `__rtFormatParams` instead. So `email: Email` infers a text
  column while the runtime emits varchar(254). The `_MissingX/_ExtraX` "compile
  guards" compute a type and never assert, so the drift is silent.
- The runtime format maps cover 11 of the 20 upstream `typeFormats`. Missing:
  the 6 Temporal formats, nativeDate, formattedArray, formattedObject. Temporal
  props fall into the nested-object lane and become JSON columns instead of
  date/time/timestamp columns (`base.mapper.ts` checks JSON before formatName).
- Literal string unions (`status: 'a' | 'b'`) fall through to plain text instead
  of `text({enum})` / `mysqlEnum`.
- Dead utils (`toSnakeCase`, `isDateClass`, `isFloatFormat`); drizzle now has a
  native `casing: 'snake_case'` option, making `toSnakeCase` doubly obsolete.

## Architecture (verified 2026-08-26, two rounds)

Two facts frame the design, both pinned by source:

1. **Obtaining a RunType node needs build-time resolution.** `getRunType<T>()`,
   the top-level builders and `createMockDataFn` all resolve an id the plugin
   injected at the call site; without injection they throw
   (`getRunType.ts:45-53`, `runtypes/builderCore.ts:30-44`).
2. **Consuming a RunType node is plain JS.** The graph is a complete, knotted
   object tree (literals, enum values, format params like maxLength/integer,
   optionality, union children, open `typeMeta`), and runtime JS walkers over
   it are an established pattern: the whole mocking library
   (`src/mocking/mockType.ts:1-9` "the walker is a runtime interpreter"), its
   loose validator `mocking/childMatch.ts:23`, the JSON-schema walker prototype
   (`test/features/jsonSchemaOutput.proto.ts`), and drizzle's own
   `typeTraverser.ts`. **No new Go-side function families are needed for any of
   this feature.** (An earlier "no runtime reflection" conclusion came from the
   stale comment in `src/standard/createJsonSchemaFn.ts:26-28`; fix that
   comment as part of the upstream edit.)

So the new direction is: one `id?: InjectRunTypeId<Model>` marker to obtain the
reflection graph (exactly what `toDrizzleXTable` already does at
`postgres.ts:67,84`), a plain-JS layer over that graph plus
`getTableColumns(table)` for guards/refine/mock, and, for validate/getErrors,
the EXISTING compiled val/verr families (decided 2026-08-26):

- Compiled validators via inline `InjectTypeFnArgs<InferSelectModel<TTable>, ...>`
  markers, recovered with `getRTFunction<K>(injected, fallback)`. Copy the
  pattern from `packages/core/src/runtypes/mionAdapter.ts` (markers spelled
  INLINE; a local alias over InjectTypeFnArgs is not recognised by the Go
  scanner, mionAdapter.ts:37-39). Computed generics at marker sites are a
  supported, load-bearing pattern (router's `HandlerParams<H>`; Go fixtures in
  `ts-go-runtypes/internal/testfixtures/modifier_utilities.ts`).
- Metadata only the table knows at runtime (varchar length, user refinements)
  becomes per-column guards built from `getTableColumns(table)`, appended after
  the compiled validator as extra `RTValidationError` entries. `enumValues`
  needs NO guard: enum-carrying columns already type as literal unions in
  `InferSelectModel`, so the compiled validator enforces them.
- Insert/update optionality comes for free from drizzle's own types
  (`node_modules/drizzle-orm/operations.d.ts:5-17`): required iff
  `notNull && !hasDefault`; generated columns absent; identity 'always' absent;
  everything else optional. Update = insert with everything optional (drizzle
  has no InferUpdateModel; define `InferUpdateModel<T> = Partial<InferInsertModel<T>>`).
  The runtime column walk is used only for guards/refine, never for optionality.
- Mock data comes free from the graph: `createMockDataFn` accepts a RunType
  node directly (`createMockData.ts:34-38,56`), so the bundle exposes `mock()`
  over the resolved node with zero extra build output.

### Task 0, the risk gate (do FIRST)

A spike spec proving the Go scanner resolves the markers over
`InferSelectModel<TTable>` at a consumer call site where `TTable` is inferred
from a real `pgTable(...)` value (drizzle's `BuildColumns` machinery is deep
mapped/conditional typing; the fixture family covers the category but not this
depth). If it fails, fallback API: `createSelectSchema<typeof users>(users)`
with an explicit type argument; if even that fails, the JS-walker validator
lane (childMatch.ts-style interpreter over the graph) is the documented
last resort. Record the outcome in this doc when implementing. Keep the spike
as a pinned regression spec once green (`schemas/markerResolution.spec.ts`).

**SPIKE OUTCOME (2026-08-26): GREEN, no fallback needed.** The scanner resolves
markers over `InferSelectModel<TTable>` / `InferInsertModel<TTable>` with
`TTable` inferred from a real `pgTable(...)` value, over the
`InferUpdateModel<TTable>` ALIAS (inline `Partial<InferInsertModel<TTable>>`
not needed), and over the indexed access `TEnum['enumValues'][number]` for
pgEnum. Both `getRunTypeId` call shapes resolve the same id as the injected
schema, and `mock()` rows pass the compiled validator. Pinned in
`schemas/markerResolution.spec.ts`.

## Public API (new direction)

Dialect-agnostic, exported from the package root:

```ts
export function createSelectSchema<TTable extends Table>(
  table: TTable,
  refine?: DrizzleRefine<InferSelectModel<TTable>>,
  fns?: InjectTypeFnArgs<InferSelectModel<TTable>, 'val', 'verr', 'huk', 'uke'>,
  id?: InjectRunTypeId<InferSelectModel<TTable>>
): DrizzleRunTypeSchema<InferSelectModel<TTable>>;
// createInsertSchema: same shape over InferInsertModel<TTable>
// createUpdateSchema: same shape over Partial<InferInsertModel<TTable>> (spelled inline in markers)
// createEnumSchema(pgEnum): schema for E['enumValues'][number]

export interface DrizzleRunTypeSchema<T> {
  validate: ValidateFn<T>;          // compiled base + length guards + refine
  getErrors: GetValidationErrorsFn; // base + appended guard/refine entries
  hasUnknownKeys: HasUnknownKeysFn; // detects e.g. generated/identity-always keys in payloads
  unknownKeyErrors: UnknownKeyErrorsFn;
  mock: (options?: CompTimeHints<RunTypeMockOptions<T>>) => T; // createMockDataFn over the resolved node
  runType: RunType<T>;
  typeId: string;
  '~standard': RTStandardSchemaV1<T>['~standard']; // hand-assembled over the WRAPPED fns
}

export type ColumnRefineFn<V> = (value: NonNullable<V>) => boolean | string; // string = error message
export type DrizzleRefine<TModel> = {[K in keyof TModel]?: ColumnRefineFn<TModel[K]>};
```

Refine deliberately diverges from drizzle-zod (schemas are not runtime-composable
here); document that. Guards/refine skip null/undefined (nullability is the
compiled validator's job). Length-guard errors use stringFormat-shaped entries
(`{path, expected: 'stringFormat', format: {name, val, formatPath: ['maxLength']}}`,
shape per `createRTFunctions.ts:83-98`) so friendly-text tooling renders them.
Fail-closed fn recovery like `buildJitFnsFromMarker` (mionAdapter.ts:205-219).

## File-by-file plan

New under `packages/drizzle/src/`:
- `schemas/schema.types.ts` (DrizzleRunTypeSchema, DrizzleRefine, InferUpdateModel)
- `schemas/columnGuards.ts` (guard list from getTableColumns; `'length' in column`
  in-guards, subclass fields are not on base Column; TS-key column keys only)
- `schemas/createSchemas.ts` (the four factories, ~standard adapter)
- Specs: `schemas/markerResolution.spec.ts` (task 0), `schemas/createSchemas.spec.ts`,
  `schemas/insertRules.spec.ts`, `schemas/refineAndGuards.spec.ts`,
  `schemas/fuzz.metadataOracle.spec.ts`

Edits:
- `index.ts`: export the new surface.
- `src/core/typeTraverser.ts`: extract `literalValues?: string[]` (union whose
  non-null/undefined children are all string literals; single literal too).
- `src/mappers/base.mapper.ts`: reorder mapProperty, formatName dispatch FIRST
  (fixes Temporal-to-JSON bug), then isDate, JSON, new `mapLiteralUnion`, primitive.
- `src/mappers/{sqlite,pg,mysql}.mapper.ts`: complete maps, typed
  `Record<FormatName, FormatColumnFactory>` (declared type so missing AND extra
  keys fail compile); implement mapLiteralUnion; drop the unknown-format fallback.
- `src/types/common.types.ts`: delete AllBrandNames + dead-lane block; add
  `type MustBeNever<T extends never> = T`.
- `src/types/{sqlite,postgres,mysql}.types.ts`: rebuild (below).
- `src/core/utils.ts`: delete toSnakeCase, isDateClass, isFloatFormat (zero call sites).
- `src/core/validator.ts`: teach format-to-column expectations for the new formats.
- `src/stubs-formats-mappings/*`: extend stubs; replace `_Missing*/_Extra*` with
  real MustBeNever asserts.
- `packages/ts-runtypes/src/index.ts` (+ helper site): upstream export (below).
- Docs + `packages/examples/src/drizzle/` (below).

No new deps; no vite.config change (build stays plugin-free, factories only
DECLARE markers, same rationale as the existing vite.config comment).

## Type-map rebuild (repairing the kept direction)

Format-keyed maps with computed literal keys from `typeFormats` (legal, as-const):

```ts
type SqliteFormatColumnMap<K extends string> = {
  [typeFormats.email.name]: SqliteTextColumn<K>;
  // ... all 20 entries
};
type _missing = MustBeNever<Exclude<FormatName, keyof SqliteFormatColumnMap<string>>>; // ASSERTS
type _extra = MustBeNever<Exclude<keyof SqliteFormatColumnMap<string>, FormatName>>;
```

Detection replaces `{brand}` with sentinel key presence:
`typeof __rtFormatName extends keyof T` (the idiom pinned at
`ts-runtypes/src/builders/static.ts:314`; sentinels are OPTIONAL symbol props, so
never use a required-prop extends). `numberFormat` branches on
`FormatParamsOf<T> extends {integer: true}` for integer vs float columns.
Literal-union type lane: `T extends string ? (string extends T ? plain : enum builder)`
with `TextEnumColumn<K, T> = SQLiteTextBuilderInitial<K, [T & string, ...(T & string)[]], ...>`
(avoids union-to-tuple). Mirror per dialect.

### Upstream @ts-runtypes/core change (hard dependency)

The sentinels are unique symbols (nominal), NOT publicly exported; downstream
packages cannot replicate detection (the same-name local-declare escape hatch
only helps the Go scanner, not TS type matching). Export from the root, type-only:
`__rtFormatName`, `__rtFormatParams` (from `src/runtypes/sentinelKeys.ts`), plus

```ts
export type FormatNameOf<T> = typeof __rtFormatName extends keyof T
  ? NonNullable<T[typeof __rtFormatName & keyof T]> & string : never;
export type FormatParamsOf<T> = typeof __rtFormatParams extends keyof T
  ? NonNullable<T[typeof __rtFormatParams & keyof T]> : never;
```

With a type test (FormatNameOf<Email> is 'email'; FormatNameOf<string> is never;
FormatParamsOf<UUIDv7> is {version:'7'}) and a @ts-runtypes/core CHANGELOG entry.
While in there, fix the stale comment at `src/standard/createJsonSchemaFn.ts:26-28`
("a document cannot be improvised at runtime (there is no runtime reflection)"),
which contradicts the mocking interpreter and misled this investigation.

## Runtime mapper completion (20/20 formats)

The 9 missing entries, per dialect (defaults, overridable via tableConfig; the
Temporal string modes keep JS values as ISO strings since drizzle Date modes
cannot hydrate Temporal instances; ZonedDateTime keeps its zone id only as text):

| Format | Postgres | MySQL | SQLite |
|---|---|---|---|
| nativeDate | timestamp(p) | timestamp(p) | integer(p,{mode:'timestamp'}) |
| temporalInstant | timestamp(p,{withTimezone:true,mode:'string'}) | timestamp(p,{mode:'string'}) | text(p) |
| temporalZonedDateTime | text(p) | text(p) | text(p) |
| temporalPlainDate | date(p,{mode:'string'}) | date(p,{mode:'string'}) | text(p) |
| temporalPlainTime | time(p) | time(p) | text(p) |
| temporalPlainDateTime | timestamp(p,{mode:'string'}) | datetime(p,{mode:'string'}) | text(p) |
| temporalPlainYearMonth | varchar(p,{length:7}) | varchar(p,{length:7}) | text(p) |
| formattedArray | jsonb(p) | json(p) | text(p,{mode:'json'}) |
| formattedObject | jsonb(p) | json(p) | text(p,{mode:'json'}) |

## Literal-union enum handling (runtime)

- SQLite and Postgres: `text(p, {enum: values})`. NOT auto-pgEnum: a pg enum is a
  named schema-level object migrations must see; generating one invisibly would
  break drizzle-kit. Users wanting a real pgEnum pass it via tableConfig (document).
- MySQL: `mysqlEnum(p, values as [string, ...string[]])` after a non-empty check.
- Mixed or non-string literal unions keep today's fallback.

## Casing

Schema and generated-column keys are TS object keys, matching getTableColumns and
$inferSelect (drizzle's casing option lives on the drizzle() dialect config and
never mutates Column.name when keyAsName). One doc paragraph; no casing
integration in code.

## Tests

All Vitest under packages/drizzle/src (plugin active via vitest.config.ts).
1. markerResolution.spec.ts: task-0 spike kept as regression; includes the
   MARKER-RULE PAIR (ts-go-runtypes/CLAUDE.md): both getRunTypeId call shapes
   (static `getRunTypeId<InferSelectModel<typeof users>>()` and reflection
   `getRunTypeId(mockRow)`) resolving the same id, equal to schema.typeId.
2. createSchemas.spec.ts: per dialect, select accepts full row, rejects wrong
   types, accepts null on nullable; ~standard adapter round-trip; mock() output
   validates.
3. insertRules.spec.ts: pins operations.d.ts semantics (required iff
   notNull && !hasDefault; $defaultFn/$onUpdate/identity optional;
   generatedAlwaysAs + identity 'always' absent, flagged via hasUnknownKeys);
   update accepts {} and any subset.
4. refineAndGuards.spec.ts: varchar(10) length guard pass/fail with error path +
   format entry; refine predicate boolean and string-message forms; refine
   skipped on null/undefined; text({enum}) and pgEnum rejection of out-of-set
   values; createEnumSchema.
5. Existing {sqlite,postgres,mysql}.spec.ts: extend with the 9 new formats
   (assert getSQLType()/columnType per the table above), literal unions
   (enumValues populated), and a regression pinning Temporal props never land in
   the JSON lane.
6. stubs-formats-mappings: new format + literal-union stubs;
   type-inference.spec.ts proves the repaired type lane (email: Email infers a
   text/varchar builder); MustBeNever asserts turn map drift into compile failure.
7. ts-runtypes: FormatNameOf/FormatParamsOf type test.
All 85 existing tests stay green.

## Fuzzing

Yes, cheap oracle: `schemas/fuzz.metadataOracle.spec.ts`, seeded RNG per repo
fuzzy-testing conventions, 3-4 representative tables per dialect. Oracle = a
hand-rolled predicate built ONLY from getTableColumns metadata, independent of
the compiled validator. Properties: (a) schema.mock() output (mutated
within-spec) always validates; (b) targeted corruptions (drop required key,
null a notNull, oversize varchar, out-of-set enum, wrong primitive) flip
validate to false AND the oracle agrees; (c) getErrors points at the corrupted key.

## Docs (container/website/sites/mion/content/03.drizzle-orm/)

- 00.drizzle-overview.md: reframe as two directions, schemas-from-tables first
  (the drizzle-native workflow); casing paragraph.
- 01.column-mapping.md: add Temporal/nativeDate/structural rows + literal-union section.
- NEW 02.validation-schemas.md: the four factories, refine, guards, mock, the
  insert-rule table, consumer-build plugin requirement, standard-schema interop.
- Examples for <code-import> in packages/examples/src/drizzle/:
  drizzle-select-schema.ts, drizzle-insert-update-schema.ts,
  drizzle-enum-example.ts (compile under root typecheck).

## Out of scope

- Views (no InferSelectViewModel in drizzle 0.45.2; getViewSelectedFields
  entries may be SQL). File a follow-up todo when this ships.
- Auto-pgEnum generation inside toDrizzlePgTable.
- drizzle-orm/casing integration; DB-name-keyed schemas.
- Serialization families (pj/rj/sj/tb/fb) and 'ces' on the schema bundle.
- Number-literal / mixed-literal unions.
- A full JS interpreter validator (kept only as the last-resort fallback in
  task 0; the compiled val/verr families are the chosen lane).
- Breaking changes to toDrizzleXTable signatures.

## Done when

1. Spike proves (or refutes, triggering the documented fallback) computed-generic
   marker resolution for InferSelectModel; outcome recorded here.
2. createSelectSchema / createInsertSchema / createUpdateSchema / createEnumSchema
   exported; insert/update rules pinned by tests; mock() works per table.
3. All three runtime format maps are Record<FormatName, ...> at 20/20; Temporal
   props never map to JSON.
4. Literal string unions map to enum-carrying columns in all three dialects,
   runtime and type level.
5. Brand lane deleted; format-keyed type maps with asserting MustBeNever guards;
   FormatNameOf/FormatParamsOf + sentinels exported upstream with type test,
   changelog entry, and the stale createJsonSchemaFn comment fixed.
6. Dead utils removed; casing documented.
7. Full drizzle suite green (85 existing + new), marker-rule pair present,
   fuzz spec seeded and green, root typecheck green (examples included).
8. Three docs pages updated/added with code-imports from new examples.

## Open questions — RESOLVED during implementation (2026-08-26)

- Spike outcome: GREEN (see the spike section above); no fallback API needed.
- `InferUpdateModel<TTable>` (alias over `Partial<InferInsertModel<TTable>>`)
  resolves in the scanner's T slot; the alias ships in `schemas/schema.types.ts`.
- 'ces' / stripUnknown helper: NOT added, per the default.
- MySQL literal unions use native `mysqlEnum` (runtime) /
  `MySqlEnumColumnBuilderInitial` (type level); BuildColumns typing stayed clean.
- ~standard: props hand-assembled over the wrapped fns with
  `StandardSchemaProps<T, T>` (upstream export); vendor string is
  `'mion-drizzle'` since guards + refine run on top of pure ts-runtypes
  validation. The jsonSchema converter from RTStandardSchemaV1 is NOT included
  (would demand the jsonSchema family; out of scope).
- pg temporalInstant: `mode: 'string'` `withTimezone: true`, as the table pins.

## Implementation deltas (what shipped beyond/differently from the plan)

- `schema.mock()` clamps generated string cells to their column length so mock
  rows satisfy the schema's OWN validate (the mock walker has no varchar-length
  knowledge). Refinements are deliberately not auto-satisfied by mock; documented.
- `packages/drizzle/test-support/temporal-ambient.d.ts` (copy of the upstream
  test ambient, not published): the drizzle spec program needs the Temporal
  namespace declared or Temporal-formatted props reflect as bare objects.
- The unknown-format fallback was replaced by a clear version-skew ERROR
  (`unknownFormatError` in base.mapper.ts), not a silent text column.
- Fixed a pre-existing validator bug found in-task: `core/validator.ts` spelled
  the format case `'bigIntFormat'` while the registry name is `'bigintFormat'`,
  so that expectation never fired. The expectations are now a complete
  `Record<FormatName, string[]>`.
- The @ts-runtypes/core CHANGELOG is generated by git-cliff from conventional
  commits, so the "changelog entry" is the `feat(runtypes): export format
  sentinels and FormatNameOf/FormatParamsOf type introspection` commit subject.
- pg/mysql PLAIN string primitives now type as varchar at the type level
  (matching what the runtime always emitted); the old type maps said text.
