# The clean-type audit — every recovered JsonSchemaType, case by case

**Status: verdicts applied.** This is the schema-by-schema review of what
`JsonSchemaType<typeof schema>` actually displays, run over the full type-gate
corpus (315 distinct schemas, one resolved hover string each, via the compiler
API). It exists because reviewing the generated types by hand kept finding
hovers that read as internals soup, and the individual complaints deserved a
systematic answer: which of these are forced, which are fixable, and which are
bugs.

Every fix below lives in **StripRunTypeMeta only** — the never-reflected
annotation projection. `FromJsonSchema` (the validator's source and the id
fold) is untouched, so no structural id, cache entry or emitted function
changes.

## Method

`scripts` (session tooling): parse every `generated/type-gate/*.ts` module,
resolve each `JsonSchemaType<typeof s_N>` annotation through the TypeScript
checker, print `schema → display string`. Classify the 315 rows, fix what the
verdict allows, re-run, diff. The corpus is regenerated from the pinned
official suite, so the audit is repeatable at any commit.

## The forced shape (not a defect, spells better now)

**~115 of 315 rows displayed the raw six-arm union**
`string | number | boolean | unknown[] | {[x: string]: unknown} | null`.

For an untyped schema whose only keywords are type-conditional (`pattern`,
`minimum`, `maxLength`, `format`, `contains`, bare combinators over such
arms), that union IS the correct type: the keywords ignore values of other
types, so `{pattern: "^a*$"}` accepts `42` and `true` by spec — pinned by
committed suite cases. Mapping it to `string` would make a validation-passing
value fail to compile, which is the one rule the clean types must never break.

What was NOT forced is the spelling. The domain now canonicalises to the
exported **`JsonValue`** alias (`packages/ts-runtypes/src/runtypes/stripRunTypeMeta.ts`),
recognised by mutual assignability so arm order and brand dressing don't
matter, with a guard: a union that is value-equivalent to any-JSON but carries
STRUCTURED object arms (a dependentRequired case split, an anyOf branch pair)
keeps its arms — they are the documentation. After the change, 150 hover
positions read `JsonValue`, zero read the raw union.

## Bugs found and fixed (all in the strip)

1. **All-optional objects skipped stripping entirely.** The broad-object
   escape used `object extends T`, which is true of every weak type, so
   `{alpha?: Number<…>}` kept its member brands verbatim —
   `{type: "object", properties: {alpha: {type: "number", maximum: 3, …}}}`
   hovered as `Flatten<{} & {alpha?: Number<Flatten<NumberParamsFrom<…>>>}>`.
   The escape now probes `keyof T extends never`; the same schema hovers as
   `{alpha?: number | undefined}`.

2. **The depth floor leaked metadata.** At recursion budget 0 the remaining
   sub-tree was kept verbatim, so every recursive `$ref: "#"` schema ended its
   eight clean levels in `FormattedObject<Flatten<…>>` /
   `__rtUnevaluated` internals. The floor now widens to `unknown` — an
   annotation admits everything rather than leak.

3. **Impossible-arm residue survived.** Encodings that intersect a constraint
   with the any-JSON domain distribute over its arms, leaving junk like
   `unknown[] & number & {__rtFormatName?: …}` beside the real `number` arm.
   Any branded primitive residue now widens to its base, so the junk arms
   dedupe away: the dependentSchemas hover that displayed sentinel keys and
   two impossible intersections now reads `bar: number`.

4. **Mixed index + named properties rejected valid data** — the five ledgered
   type-gate divergences. TypeScript cannot spell "boolean for every key
   except foo and bar", so the exact index type made `{foo: 1}` fail against
   `{properties: {foo, bar}, additionalProperties: {type: "boolean"}}` even
   though it validates. In the CLEAN type the index value now widens to
   `unknown` when named properties coexist (an index standing alone keeps its
   exact value — nothing valid is excepted from it). The type-gate ledger is
   now EMPTY: all 1,030 spec-valid samples assign. The exact index survives
   where it must — in the reflected type the validator is generated from.

## Residuals, each with its reason

- **Branded string/number literals widen to their base.** A `then/else` over
  `const` arms with a format-carrying `if` produced
  `(Brand & "yes") | (NotSlot<…> & "other")`. TypeScript has no intersection
  subtraction — template construction, template inference and mapped-key
  normalisation were all probed and none reduces over an intersection — so
  the choice is leaked brand internals or a clean `string`. The strip picks
  `string`. Boolean literals DO survive (two extends-tests recover them).
  Recovering `"yes" | "other"` would need FromJsonSchema to stop branding the
  literal arms — an id-affecting change filed as
  [json-schema-ifthenelse-const-brands-hide-literals.md](../../todos/json-schema-ifthenelse-const-brands-hide-literals.md),
  not smuggled in here.
- **Branded tuples keep verbatim** (`FormattedArray<[boolean?, boolean?],
  {uniqueItems: true}>`): variadic inference over the intersection collapses
  the slots to `unknown[]`, so stripping would destroy the tuple structure the
  hover is there to show. One corpus row.
- **One pathological unevaluatedProperties row** (nested unevaluated carrier
  distributed over an anyOf base) still displays junk intersections; the arms
  are impossible sets from the same distribution as fix 3 but sit on array
  bases where the mapped rewrite would mangle array structure. One corpus row,
  pre-existing display, recorded here rather than papered over.
- **Fresh-literal excess-property errors on open-world samples** (`{foo: 1,
  vroom: 2}` against a patternProperties schema) are a TypeScript
  fresh-literal check, filtered by the gate harness (TS2353/TS2561) and
  visible in an editor that opens a generated module raw. The generated
  type-gate tree is excluded from every tsconfig on purpose.

## Scoreboard

| | before | after |
| --- | ---: | ---: |
| raw six-arm union hovers | 115 | 0 |
| hovers naming internals (`Flatten`, `Number<…>`, `NotSlot`, sentinels) | dozens | 2 documented rows |
| type-gate divergences (of 1,030 samples) | 5 ledgered | **0** |
| `JsonValue` named positions | 0 | 150 |

The instantiation budgets in `stripmeta.compile.test.ts` were re-pinned to the
new counts (the canonicalisation and the literal-key probes cost 20-40% more
per branch); each remains a one-way ratchet from here.
