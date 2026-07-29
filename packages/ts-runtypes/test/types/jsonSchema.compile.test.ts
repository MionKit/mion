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
 *  within `budget`. Returns the net count (handy when tuning). **/
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
      394
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
      218
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
      type _03 = Expect<Equal<FromJsonSchema<{readonly type: 'string'; readonly format: 'email'}>, Email>>;
      type _04 = Expect<Equal<FromJsonSchema<{readonly type: 'string'; readonly format: 'uuid'}>, UUIDv4>>;
      type _05 = Expect<Equal<FromJsonSchema<{readonly type: 'string'; readonly format: 'date'}>, StringDate>>;
      type _06 = Expect<Equal<FromJsonSchema<{readonly type: 'string'; readonly format: 'time'}>, StringTime>>;
      type _07 = Expect<Equal<FromJsonSchema<{readonly type: 'string'; readonly format: 'date-time'}>, StringDateTime>>;
      type _08 = Expect<Equal<FromJsonSchema<{readonly type: 'string'; readonly format: 'hostname'}>, Domain>>;
      type _09 = Expect<Equal<FromJsonSchema<{readonly type: 'string'; readonly format: 'ipv4'}>, IPv4>>;
      type _10 = Expect<Equal<FromJsonSchema<{readonly type: 'string'; readonly format: 'ipv6'}>, IPv6>>;
      type _11 = Expect<Equal<FromJsonSchema<{readonly type: 'string'; readonly format: 'uri'}>, Url>>;
      `,
      956
    );
  });

  it('pattern keyword — rebuilt into the {source, flags} brand param (no mockSamples)', () => {
    check(
      `
      type _01 = Expect<Equal<
        FromJsonSchema<{readonly type: 'string'; readonly pattern: '^[a-z-]+$'}>,
        StringFormat<{readonly pattern: {readonly source: '^[a-z-]+$'; readonly flags: ''}}>
      >>;
      type _02 = Expect<Equal<
        FromJsonSchema<{readonly type: 'string'; readonly minLength: 5; readonly pattern: '^a+$'}>,
        StringFormat<{readonly minLength: 5; readonly pattern: {readonly source: '^a+$'; readonly flags: ''}}>
      >>;
      `,
      452
    );
  });

  it('number/integer keyword remap (minimum→min, exclusive*→gt/lt, multipleOf)', () => {
    check(
      `
      type _01 = Expect<Equal<
        FromJsonSchema<{readonly type: 'number'; readonly minimum: 0; readonly maximum: 10}>,
        NumberFormat<{readonly min: 0; readonly max: 10}>
      >>;
      type _02 = Expect<Equal<
        FromJsonSchema<{readonly type: 'number'; readonly exclusiveMinimum: 0; readonly exclusiveMaximum: 1}>,
        NumberFormat<{readonly gt: 0; readonly lt: 1}>
      >>;
      type _03 = Expect<Equal<
        FromJsonSchema<{readonly type: 'number'; readonly multipleOf: 5}>,
        NumberFormat<{readonly multipleOf: 5}>
      >>;
      type _04 = Expect<Equal<FromJsonSchema<{readonly type: 'integer'}>, NumberFormat<{integer: true}>>>;
      type _05 = Expect<Equal<
        FromJsonSchema<{readonly type: 'integer'; readonly minimum: 0; readonly maximum: 130}>,
        NumberFormat<{readonly min: 0; readonly max: 130; integer: true}>
      >>;
      `,
      938
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
      656
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
      425
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
      type _04 = Expect<Equal<FromJsonSchema<{readonly type: 'object'}>, object>>;
      `,
      752
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
        id: UUIDv4;
        name: StringFormat<{readonly minLength: 2; readonly maxLength: 50}>;
        age: NumberFormat<{readonly min: 0; readonly max: 130; integer: true}>;
        email?: Email;
        tags: string[];
        address: {street: string; city?: string};
      }>>;
      `,
      1045
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
      322
    );
  });
});
