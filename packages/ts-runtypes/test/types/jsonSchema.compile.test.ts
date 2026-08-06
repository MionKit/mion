// Per-branch correctness + instantiation-budget test for `FromJsonSchema<S>`
// (+ the `ExactJsonSchema` call-site guard).
//
// Each `it` compiles a representative snippet for ONE branch of the mapping
// (src/json-schema/fromJsonSchema.ts) through the real TypeScript compiler (see
// jsonSchemaHarness.ts) and asserts two things:
//   1. it type-checks cleanly — the recovered type is what we expect (the
//      snippet's `Expect<Equal<…>>` assertions fail to compile otherwise);
//   2. the NET instantiation count (case minus the constant empty-snippet
//      baseline) stays under an absolute budget — a recursion / exponential
//      blowup in that branch spikes the number and reds the test long before it
//      trips the hard TS2589 cap.
//
// NOTE on param modifiers: schema literals at real call sites are
// `const`-inferred, so their props are readonly — the snippets write S the same
// way, and the expected format params carry `readonly` where the (homomorphic)
// param extractors preserve it. The structural id is modifier-insensitive, so
// runtime convergence is unaffected (proven by the define/id-integrity suites).
//
// Each budget IS the branch's current net instantiation count — a one-way
// RATCHET that may only ever be lowered; the update protocol is documented in
// dataonly.compile.test.ts (same rules apply here verbatim). Cases accumulate
// per milestone as the accepted keyword subset grows.

import {describe, it, expect} from 'vitest';
import {measureJsonSchema} from './jsonSchemaHarness.ts';

/** Compile `snippet`, assert it type-checks AND its net instantiation count is
 *  within `budget`. Returns the net count (handy when tuning).
 *
 *  Budget history: re-baselined when the harness switched from cheap stand-in
 *  types to importing the REAL FromJsonSchema + formats graph — each budget is
 *  now the genuine per-branch net instantiation count a consumer pays, not a
 *  fictional cheap-fake proxy. The ratchet stays one-way from these values.
 *  Lowered again (objects 2769→2735, structural keywords 2899→2769) when the
 *  structural literal-part extractors became a single keyed mapped type
 *  instead of a chain of `P extends {k: infer N}` intersections, and once more
 *  (format lookup rows 2188→2045, composite 2087→2035) when `FormatDefaults`
 *  gained its no-override fast path — every bare format alias in the lookup
 *  table now skips the merge entirely.
 *
 *  Every branch ratcheted DOWN again when `oneOf` stopped riding a Conj in the
 *  non-oneOf path (the combinator tail now routes, so a oneOf-less schema pays
 *  one conjunction less). ONE branch went UP as a REVIEWED EXCEPTION — the
 *  combinators case, 2655→2682: `allOf` arms now combine through `Conj` instead
 *  of a bare `&`, which is what makes a type-LESS arm's six-kind union merge
 *  kind-by-kind (`allOf: [{maximum: 30}, {minimum: 20}]` used to drop BOTH
 *  bounds and accept 35). Distribution costs the conditionals; correctness is
 *  worth 27 instantiations, and the ratchet stays one-way from here.
 *
 *  A second REVIEWED EXCEPTION, `$defs + $ref` 2118->2127: `$ref` became a real
 *  JSON Pointer walk (percent-decoding, `~1`/`~0`, empty tokens, targets outside
 *  `$defs`, absolute/URN bases). `#` and a plain `#/$defs/<name>` still resolve on
 *  the two probes they always did, so the 9 is what an UNRESOLVABLE name now pays
 *  to rule out an escape before giving up.
 *
 *  `unevaluated*` gained a mode classifier (noop / closed / leftover / sweep)
 *  so the keyword stops resolving `never` wherever the document actually pins
 *  the evaluated set down. Every consumer probes for the KEYWORD before asking
 *  for the mode, so seven branches came DOWN and only two moved: `not` 4681→4689
 *  and structural keywords 2751→2753, both the extra keyword probe on the object
 *  and array gates.
 *
 *  A third REVIEWED EXCEPTION, ~+4 on six branches (and −10 on `not`): the
 *  evaluated-key and prefix merges now follow `$ref` targets, since a ref has to
 *  pass for the schema to pass and whatever it evaluates is evaluated
 *  unconditionally. The walk is fuel-bounded (a `$ref: '#'` cycle is legal), and
 *  the probe is one `S extends {$ref: unknown}` for every schema without one.
 *
 *  A fourth REVIEWED EXCEPTION, ~+88 across seven branches (objects +45): a
 *  SCHEMA-valued `additionalProperties` beside a merging keyword now carries its
 *  own exemption list, so a property an `allOf` member declares can no longer
 *  escape the value check. That case was the suite's ONLY under-validation, and
 *  the probe is gated behind `additionalProperties` being present, so an
 *  ordinary object pays nothing.
 *
 *  A fifth REVIEWED EXCEPTION, ~+150 across seven branches: `unevaluated*` no
 *  longer resolves `never` when a branch decides the evaluated set at run time
 *  — it carries the guards on a sentinel and sweeps while validating, which
 *  took `unevaluatedProperties.json` from 13 open divergences to ZERO. The slot
 *  is one conditional on FormattedObject and the payload is built only in the
 *  'sweep' mode, so a schema that never writes the keyword is unaffected.
 *
 *  A sixth REVIEWED EXCEPTION, +3 to +23 across five branches (arrays +19,
 *  tuples +23, the other three +3 to +8; `not` −9 and combinators −2 came down
 *  with it): the array side got the same treatment, so `unevaluatedItems` reads
 *  its own mode and carries its own guarded-group payload instead of resolving
 *  `never`. That closed the whole `unevaluatedItems.json` file bar one case, and
 *  the array-shaped branches are the only ones that pay for it.
 *
 *  TEN branches then came DOWN, and every reviewed exception above bar the
 *  fourth is repaid: `unevaluated*` stopped SHAPING the type. It never closes an
 *  object, caps an array or turns a schema value into an index signature — it
 *  rides the `__rtUnevaluated` sentinel and nothing else, so the door no longer
 *  proves, at the type level, that an evaluated set is statically knowable. The
 *  whole indeterminacy machinery (UnevalScopeIndeterminate, the contains walk,
 *  PropsEvaluatedSoFar, both poison stubs) is gone and the mode is a two-way
 *  choice. Biggest wins where those walks ran hottest: arrays 991→949, tuples
 *  2370→2317, `not` 4689→4640, objects 2828→2768. **/
function check(snippet: string, budget: number): number {
  const r = measureJsonSchema(snippet);
  expect(r.errors, `snippet should type-check cleanly:\n${snippet}\n→ ${r.errors.join('\n  ')}`).toEqual([]);
  // eslint-disable-next-line no-console
  // console.log(`    net=${String(r.netInstantiations).padStart(5)}  budget=${budget}`);
  expect(
    r.netInstantiations,
    `net instantiations (${r.netInstantiations}) exceeded budget (${budget}) — possible FromJsonSchema recursion/cost regression`
  ).toBeLessThanOrEqual(budget);
  return r.netInstantiations;
}

describe('FromJsonSchema<S> — per-branch correctness + instantiation budget', () => {
  it('boolean schemas + bare scalars + the always-true fallback', () => {
    check(
      `
      type _01 = Expect<Equal<FromJsonSchema<true>, unknown>>;
      type _02 = Expect<Equal<FromJsonSchema<false>, never>>;
      type _03 = Expect<Equal<FromJsonSchema<{readonly type: 'string'}>, string>>;
      type _04 = Expect<Equal<FromJsonSchema<{readonly type: 'number'}>, number>>;
      type _05 = Expect<Equal<FromJsonSchema<{readonly type: 'boolean'}>, boolean>>;
      type _06 = Expect<Equal<FromJsonSchema<{readonly type: 'null'}>, null>>;
      type _07 = Expect<Equal<FromJsonSchema<{}>, unknown>>;
      `,
      799
    );
  });

  it('const + enum — literal recovery', () => {
    check(
      `
      type _01 = Expect<Equal<FromJsonSchema<{readonly const: 'active'}>, 'active'>>;
      type _02 = Expect<Equal<FromJsonSchema<{readonly const: 7}>, 7>>;
      type _03 = Expect<Equal<FromJsonSchema<{readonly enum: readonly ['admin', 'user', 3]}>, 'admin' | 'user' | 3>>;
      type _04 = Expect<Equal<FromJsonSchema<{readonly enum: readonly [true, null]}>, true | null>>;
      `,
      628
    );
  });

  it('string constraint keywords + the format lookup rows', () => {
    check(
      `
      type _01 = Expect<Equal<FromJsonSchema<{readonly type: 'string'; readonly minLength: 3}>, StringFormat<{readonly minLength: 3}>>>;
      type _02 = Expect<Equal<
        FromJsonSchema<{readonly type: 'string'; readonly minLength: 2; readonly maxLength: 50}>,
        StringFormat<{readonly minLength: 2; readonly maxLength: 50}>
      >>;
      type _03 = Expect<Equal<FromJsonSchema<{readonly type: 'string'; readonly format: 'email'}>, EmailAddress>>;
      type _04 = Expect<Equal<FromJsonSchema<{readonly type: 'string'; readonly format: 'uuid'}>, UUID>>;
      type _05 = Expect<Equal<FromJsonSchema<{readonly type: 'string'; readonly format: 'date'}>, StringDate>>;
      type _06 = Expect<Equal<FromJsonSchema<{readonly type: 'string'; readonly format: 'time'}>, StringTime>>;
      type _07 = Expect<Equal<FromJsonSchema<{readonly type: 'string'; readonly format: 'date-time'}>, StringDateTime>>;
      type _08 = Expect<Equal<FromJsonSchema<{readonly type: 'string'; readonly format: 'hostname'}>, Hostname>>;
      type _09 = Expect<Equal<FromJsonSchema<{readonly type: 'string'; readonly format: 'ipv4'}>, IPv4>>;
      type _10 = Expect<Equal<FromJsonSchema<{readonly type: 'string'; readonly format: 'ipv6'}>, IPv6>>;
      type _11 = Expect<Equal<FromJsonSchema<{readonly type: 'string'; readonly format: 'uri'}>, Uri>>;
      `,
      2012
    );
  });

  it('pattern keyword — rebuilt into the {source, flags} brand param (no mockSamples)', () => {
    check(
      `
      type _01 = Expect<Equal<
        FromJsonSchema<{readonly type: 'string'; readonly pattern: '^[a-z-]+$'}>,
        StringFormat<{readonly pattern: {readonly source: '^[a-z-]+$'; readonly flags: 'u'}}>
      >>;
      type _02 = Expect<Equal<
        FromJsonSchema<{readonly type: 'string'; readonly minLength: 5; readonly pattern: '^a+$'}>,
        StringFormat<{readonly minLength: 5; readonly pattern: {readonly source: '^a+$'; readonly flags: 'u'}}>
      >>;
      `,
      645
    );
  });

  it('number/integer keywords ride the Number params bag in their JSON spelling (Go canonicalises)', () => {
    check(
      `
      type _01 = Expect<Equal<
        FromJsonSchema<{readonly type: 'number'; readonly minimum: 0; readonly maximum: 10}>,
        NumberFormat<{readonly minimum: 0; readonly maximum: 10}>
      >>;
      type _02 = Expect<Equal<
        FromJsonSchema<{readonly type: 'number'; readonly exclusiveMinimum: 0; readonly exclusiveMaximum: 1}>,
        NumberFormat<{readonly exclusiveMinimum: 0; readonly exclusiveMaximum: 1}>
      >>;
      type _03 = Expect<Equal<
        FromJsonSchema<{readonly type: 'number'; readonly multipleOf: 5}>,
        NumberFormat<{readonly multipleOf: 5}>
      >>;
      type _04 = Expect<Equal<FromJsonSchema<{readonly type: 'integer'}>, NumberFormat<{integer: true}>>>;
      type _05 = Expect<Equal<
        FromJsonSchema<{readonly type: 'integer'; readonly minimum: 0; readonly maximum: 130}>,
        NumberFormat<{readonly minimum: 0; readonly maximum: 130; integer: true}>
      >>;
      `,
      1323
    );
  });

  it('anyOf — arm-by-arm union build', () => {
    check(
      `
      type _01 = Expect<Equal<FromJsonSchema<{readonly anyOf: readonly [{readonly type: 'string'}, {readonly type: 'number'}]}>, string | number>>;
      type _02 = Expect<Equal<FromJsonSchema<{readonly anyOf: readonly [{readonly type: 'string'}, {readonly type: 'null'}]}>, string | null>>;
      type _03 = Expect<Equal<
        FromJsonSchema<{readonly anyOf: readonly [{readonly const: 'a'}, {readonly const: 'b'}, {readonly type: 'boolean'}]}>,
        'a' | 'b' | boolean
      >>;
      `,
      1477
    );
  });

  it('combinators — oneOf, allOf, type arrays with per-arm keywords', () => {
    check(
      `
      type _01 = Expect<Equal<FromJsonSchema<{readonly oneOf: readonly [{readonly type: 'string'}, {readonly type: 'number'}]}>, OneOf<[string, number]>>>;
      type _02 = Expect<Equal<
        FromJsonSchema<{
          readonly allOf: readonly [
            {readonly type: 'object'; readonly properties: {readonly a: {readonly type: 'string'}}; readonly required: readonly ['a']},
            {readonly type: 'object'; readonly properties: {readonly b: {readonly type: 'number'}}; readonly required: readonly ['b']},
          ];
        }>,
        {a: string} & {b: number}
      >>;
      type _03 = Expect<Equal<FromJsonSchema<{readonly type: readonly ['string', 'null']}>, string | null>>;
      type _04 = Expect<Equal<
        FromJsonSchema<{readonly type: readonly ['string', 'number']; readonly minLength: 3; readonly minimum: 0}>,
        StringFormat<{readonly minLength: 3}> | NumberFormat<{readonly minimum: 0}>
      >>;
      type _05 = Expect<Equal<FromJsonSchema<{readonly type: readonly ['integer', 'null']}>, NumberFormat<{integer: true}> | null>>;
      `,
      2677
    );
  });

  it('arrays — items + bare array', () => {
    check(
      `
      type _01 = Expect<Equal<FromJsonSchema<{readonly type: 'array'; readonly items: {readonly type: 'string'}}>, string[]>>;
      type _02 = Expect<Equal<FromJsonSchema<{readonly type: 'array'}>, unknown[]>>;
      type _03 = Expect<Equal<
        FromJsonSchema<{readonly type: 'array'; readonly items: {readonly type: 'array'; readonly items: {readonly type: 'number'}}}>,
        number[][]
      >>;
      `,
      949
    );
  });

  it('tuples — prefixItems × minItems × items (closed / optional / rest / open)', () => {
    check(
      `
      type _01 = Expect<Equal<
        FromJsonSchema<{
          readonly type: 'array';
          readonly prefixItems: readonly [{readonly type: 'string'}, {readonly type: 'number'}];
          readonly items: false;
          readonly minItems: 2;
        }>,
        [string, number]
      >>;
      type _02 = Expect<Equal<
        FromJsonSchema<{
          readonly type: 'array';
          readonly prefixItems: readonly [{readonly type: 'string'}, {readonly type: 'number'}];
          readonly items: false;
          readonly minItems: 1;
        }>,
        [string, number?]
      >>;
      type _03 = Expect<Equal<
        FromJsonSchema<{
          readonly type: 'array';
          readonly prefixItems: readonly [{readonly type: 'string'}];
          readonly items: {readonly type: 'number'};
          readonly minItems: 1;
        }>,
        [string, ...number[]]
      >>;
      type _04 = Expect<Equal<
        FromJsonSchema<{readonly type: 'array'; readonly prefixItems: readonly [{readonly type: 'string'}]; readonly minItems: 1}>,
        [string, ...unknown[]]
      >>;
      type _05 = Expect<Equal<
        FromJsonSchema<{readonly type: 'array'; readonly prefixItems: readonly [{readonly type: 'string'}]; readonly items: false}>,
        [string?]
      >>;
      type _06 = Expect<Equal<FromJsonSchema<{readonly type: 'array'; readonly items: false}>, []>>;
      `,
      2317
    );
  });

  it('objects — required/optional inversion, Record form, bare object', () => {
    check(
      `
      type _01 = Expect<Equal<
        FromJsonSchema<{
          readonly type: 'object';
          readonly properties: {readonly a: {readonly type: 'string'}; readonly b: {readonly type: 'number'}};
          readonly required: readonly ['a'];
        }>,
        {a: string; b?: number}
      >>;
      type _02 = Expect<Equal<
        FromJsonSchema<{readonly type: 'object'; readonly properties: {readonly a: {readonly type: 'string'}}}>,
        {a?: string}
      >>;
      type _03 = Expect<Equal<
        FromJsonSchema<{readonly type: 'object'; readonly additionalProperties: {readonly type: 'number'}}>,
        Record<string, number>
      >>;
      // Keyword-less object gate is Record<string, unknown>, not TS \`object\`
      // — the record check excludes arrays, matching JSON Schema's object kind.
      type _04 = Expect<Equal<FromJsonSchema<{readonly type: 'object'}>, Record<string, unknown>>>;
      type _05 = Expect<Equal<
        FromJsonSchema<{
          readonly type: 'object';
          readonly properties: {readonly a: {readonly type: 'string'}};
          readonly required: readonly ['a'];
          readonly additionalProperties: {readonly type: 'number'};
        }>,
        {a: string} & Record<string, number>
      >>;
      // additionalProperties: false is ENFORCED closedness — the formattedObject
      // brand carries the allowed-key list and the validator rejects
      // undeclared keys (it used to be a type-level no-op).
      type _06 = Expect<Equal<
        FromJsonSchema<{
          readonly type: 'object';
          readonly properties: {readonly a: {readonly type: 'string'}};
          readonly required: readonly ['a'];
          readonly additionalProperties: false;
        }>,
        {a: string} & {readonly [__rtFormatName]?: 'formattedObject'; readonly [__rtFormatParams]?: {readonly closed: readonly ['a']}}
      >>;
      `,
      // Raised 2697 → 2780 when the readOnly-lift gate landed (the per-object
      // ReadonlyPropKeys check on the common path) — a priced feature cost, not
      // a regression; the ratchet stays one-way from here.
      2730
    );
  });

  it('not — kind-relevance arms + literal verdicts', () => {
    check(
      `
      type _01 = Expect<Equal<
        FromJsonSchema<{readonly not: {readonly type: 'string'}}>,
        number | boolean | null | unknown[] | Record<string, unknown>
      >>;
      type _02 = Expect<Equal<
        FromJsonSchema<{readonly not: {readonly pattern: '^a'}}>,
        string & {readonly [__rtNot]?: StringFormat<{readonly pattern: {readonly source: '^a'; readonly flags: 'u'}}>}
      >>;
      type _03 = Expect<Equal<
        FromJsonSchema<{readonly not: {readonly enum: readonly [null, 5, 'a']}}>,
        | (string & {readonly [__rtNot]?: null | 5 | 'a'})
        | (number & {readonly [__rtNot]?: null | 5 | 'a'})
        | boolean
        | (unknown[] & {readonly [__rtNot]?: null | 5 | 'a'})
        | (Record<string, unknown> & {readonly [__rtNot]?: null | 5 | 'a'})
      >>;
      type _04 = Expect<Equal<FromJsonSchema<{readonly not: {readonly $ref: '#'}}>, never>>;
      `,
      4640
    );
  });

  it('readOnly lift — a property schema with readOnly: true recovers a readonly member', () => {
    check(
      `
      type _01 = Expect<Equal<
        FromJsonSchema<{
          readonly type: 'object';
          readonly properties: {
            readonly id: {readonly type: 'string'; readonly readOnly: true};
            readonly name: {readonly type: 'string'};
          };
          readonly required: readonly ['id', 'name'];
        }>,
        {readonly id: string; name: string}
      >>;
      // Optional + readonly compose; writeOnly stays a read-and-ignored
      // annotation; readOnly at a NON-property position is an annotation too.
      type _02 = Expect<Equal<
        FromJsonSchema<{
          readonly type: 'object';
          readonly properties: {
            readonly note: {readonly type: 'string'; readonly readOnly: true};
            readonly draft: {readonly type: 'string'; readonly writeOnly: true};
          };
        }>,
        {readonly note?: string; draft?: string}
      >>;
      type _03 = Expect<Equal<
        FromJsonSchema<{readonly type: 'string'; readonly readOnly: true}>,
        string
      >>;
      `,
      1544
    );
  });

  it('structural keywords — uniqueItems / maxItems / key counts / closedness', () => {
    check(
      `
      type _01 = Expect<Equal<
        FromJsonSchema<{readonly type: 'array'; readonly uniqueItems: true}>,
        unknown[] & {readonly [__rtFormatName]?: 'formattedArray'; readonly [__rtFormatParams]?: {readonly uniqueItems: true}}
      >>;
      type _02 = Expect<Equal<
        FromJsonSchema<{readonly type: 'array'; readonly items: {readonly type: 'number'}; readonly maxItems: 3}>,
        number[] & {readonly [__rtFormatName]?: 'formattedArray'; readonly [__rtFormatParams]?: {readonly maxItems: 3}}
      >>;
      type _03 = Expect<Equal<
        FromJsonSchema<{readonly type: 'object'; readonly minProperties: 1; readonly maxProperties: 3}>,
        Record<string, unknown> & {
          readonly [__rtFormatName]?: 'formattedObject';
          readonly [__rtFormatParams]?: {readonly minProperties: 1; readonly maxProperties: 3};
        }
      >>;
      type _04 = Expect<Equal<
        FromJsonSchema<{
          readonly type: 'object';
          readonly properties: {readonly a: {readonly type: 'string'}};
          readonly additionalProperties: false;
        }>,
        {a?: string} & {readonly [__rtFormatName]?: 'formattedObject'; readonly [__rtFormatParams]?: {readonly closed: readonly ['a']}}
      >>;
      `,
      // Raised 2448 → 2468 with the readOnly-lift gate (same reason as the
      // objects branch). Raised 2468 → 2899 when array/object keyword lowering
      // moved onto the shared FormattedArray / FormattedObject wrapper types
      // (deleting the door's StructuralFormat / ContainsPart / PatternPropsPart /
      // PropNamesPart twins): a keyword-bearing array/object now builds a params
      // bag the wrapper re-splits, a bounded one-time cost paid ONLY by schemas
      // that use these keywords — the common keyword-less array / object / tuple /
      // Record cases fast-path around the wrapper and are unchanged (see the
      // arrays / objects / tuples branches, all still green at their old budgets).
      2768
    );
  });

  it('composite — the flagship user shape (wide-schema budget case)', () => {
    check(
      `
      type User = FromJsonSchema<{
        readonly type: 'object';
        readonly properties: {
          readonly id: {readonly type: 'string'; readonly format: 'uuid'};
          readonly name: {readonly type: 'string'; readonly minLength: 2; readonly maxLength: 50};
          readonly age: {readonly type: 'integer'; readonly minimum: 0; readonly maximum: 130};
          readonly email: {readonly type: 'string'; readonly format: 'email'};
          readonly tags: {readonly type: 'array'; readonly items: {readonly type: 'string'}};
          readonly address: {
            readonly type: 'object';
            readonly properties: {readonly street: {readonly type: 'string'}; readonly city: {readonly type: 'string'}};
            readonly required: readonly ['street'];
          };
        };
        readonly required: readonly ['id', 'name', 'age', 'tags', 'address'];
      }>;
      type _01 = Expect<Equal<User, {
        id: UUID;
        name: StringFormat<{readonly minLength: 2; readonly maxLength: 50}>;
        age: NumberFormat<{readonly minimum: 0; readonly maximum: 130; integer: true}>;
        email?: EmailAddress;
        tags: string[];
        address: {street: string; city?: string};
      }>>;
      `,
      1995
    );
  });

  it('$defs + $ref — root recursion, definition lookup, recursive definitions', () => {
    check(
      `
      // root self-recursion: the classic circular array
      type Circ = FromJsonSchema<{readonly type: 'array'; readonly items: {readonly $ref: '#'}}>;
      type _01 = Expect<Assignable<[[], [[]]], Circ>>;
      type _02 = Expect<Assignable<Circ, unknown[]>>;
      // non-recursive $defs lookup
      type Addressed = FromJsonSchema<{
        readonly $defs: {readonly address: {readonly type: 'object'; readonly properties: {readonly street: {readonly type: 'string'}}; readonly required: readonly ['street']}};
        readonly type: 'object';
        readonly properties: {readonly home: {readonly $ref: '#/$defs/address'}; readonly work: {readonly $ref: '#/$defs/address'}};
        readonly required: readonly ['home'];
      }>;
      type _03 = Expect<Equal<Addressed, {home: {street: string}; work?: {street: string}}>>;
      // recursive definition: linked list
      type Node = FromJsonSchema<{
        readonly $defs: {readonly node: {readonly type: 'object'; readonly properties: {readonly value: {readonly type: 'number'}; readonly next: {readonly $ref: '#/$defs/node'}}; readonly required: readonly ['value']}};
        readonly $ref: '#/$defs/node';
      }>;
      type _04 = Expect<Assignable<{value: 1; next: {value: 2}}, Node>>;
      type _05 = Expect<Equal<Node['value'], number>>;
      type _06 = Expect<Equal<NonNullable<Node['next']>, Node>>;
      // unknown definition name resolves never (impossible type, not silent widening)
      type Missing = FromJsonSchema<{readonly $defs: {readonly a: {readonly type: 'string'}}; readonly $ref: '#/$defs/nope'}>;
      type _07 = Expect<Equal<Missing, never>>;
      `,
      2114
    );
  });

  it('ExactJsonSchema — transparent for valid schemas, poisons unknown keywords', () => {
    check(
      `
      type Valid = {readonly type: 'string'; readonly minLength: 3};
      type _01 = Expect<Assignable<Valid, ExactJsonSchema<Valid>>>;
      type Nested = {
        readonly type: 'object';
        readonly properties: {readonly a: {readonly type: 'array'; readonly items: {readonly type: 'integer'}}};
        readonly required: readonly ['a'];
        readonly additionalProperties: false;
      };
      type _02 = Expect<Assignable<Nested, ExactJsonSchema<Nested>>>;
      type Typo = {readonly type: 'string'; readonly minLen: 3};
      type _03 = ExpectFalse<Assignable<Typo, ExactJsonSchema<Typo>>>;
      type NestedTypo = {
        readonly type: 'object';
        readonly properties: {readonly a: {readonly type: 'string'; readonly minLen: 3}};
      };
      type _04 = ExpectFalse<Assignable<NestedTypo, ExactJsonSchema<NestedTypo>>>;
      `,
      791
    );
  });
});
