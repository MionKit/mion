// Value-first `defineObject` validation suite — single source of truth for the
// behavioral assertions of the value-first authoring surface
// (`@mionjs/run-types/schema`). Sibling of validation-suite.ts /
// format-validation-suite.ts.
//
// Each model is authored with `RT.object({...})`. Every builder returns the
// generic `RunType<…>` node, so `typeof Model` is that node and
// `InferType<typeof Model>` recovers the model type — which is fed to
// `createValidateFn` / `createGetValidationErrorsFn`, the SAME path as the type-first
// surface, proving the value-first front-end lowers to the identical RunType
// graph (same-hash convergence is asserted across all suites in
// test/suites/id-integrity/).
//
// Per the CLAUDE.md marker-coverage rule every case carries BOTH forms:
//   - static  `createValidateFn<InferType<typeof Model>>()`
//   - reflect `createValidateFn(value)` where `value` is a runtime object whose
//     declared type is `InferType<typeof Model>` (the format brand can't be
//     constructed from a plain literal, so the value is cast — discarded at
//     runtime, only its static type drives `T` inference).
//
// The bare `import '@mionjs/run-types/builders'` is type-only here; the
// `import '@mionjs/run-types/formats'` side-effect import is load-bearing
// (registers the format mock fns + pure-fns the emitted validators reach).

import * as TF from '@mionjs/run-types/formats';
import * as TFT from '@mionjs/run-types/formats/temporal';
import {
  createValidateFn,
  createGetValidationErrorsFn,
  registerFormatPattern,
  type InferType,
  type GetValidationErrorsFn,
} from '@mionjs/run-types';
import * as RT from '@mionjs/run-types/builders';
import {deserializeValidate} from '../../util/deserializeRTFunctions.ts';
import '@mionjs/run-types/formats';

/** validate validator field shape, widened to the plain boolean-returning call
 *  shape. `ValidateFn<T>` is an invariantly-checked type guard (`value is
 *  DataOnly<T>`), so a concrete `ValidateFn<SomeModel>` does NOT flow into a bare
 *  `ValidateFn` (`ValidateFn<unknown>`) field; the boolean supertype every
 *  `ValidateFn<T>` satisfies sidesteps that. Mirrors `ValidateThunk` in
 *  `../validation/types.ts`. **/
type AnyValidateFn = (value: unknown) => boolean;

/** A value-first case: the four validate thunks (static / reflect / their
 *  deserialize companions), a getValidationErrors thunk, and the shared samples.
 *  Reuses the same field names as `ValidationCase` so it can flow through the
 *  shared adapter helpers. **/
export interface ValueFirstCase {
  title: string;
  validate: () => AnyValidateFn;
  validateReflect: () => AnyValidateFn;
  deserializeValidate: () => AnyValidateFn;
  deserializeValidateReflect: () => AnyValidateFn;
  getValidationErrors: () => GetValidationErrorsFn;
  getSamples: () => {valid: unknown[]; invalid: unknown[]};
}

// ─────────────────────────────── Models ─────────────────────────────

const UserModel = RT.object({
  username: TF.string({minLength: 3, maxLength: 20}),
  code: TF.string({length: 4}),
  role: TF.string({allowedValues: {val: ['admin', 'user', 'guest']}}),
  age: TF.number({min: 0, max: 120, integer: true}),
  score: TF.number({gt: 0, lt: 100}),
  step: TF.number({multipleOf: 5}),
  ratio: TF.number({float: true}),
  level: TF.number({min: -128, max: 127, integer: true}),
  bornBefore: TF.date({max: 'now'}),
});

const StringModel = RT.object({
  short: TF.string({maxLength: 5}),
  long: TF.string({minLength: 3}),
  exact: TF.string({length: 4}),
  pick: TF.string({allowedValues: {val: ['red', 'green', 'blue']}}),
});

const NumberModel = RT.object({
  bounded: TF.number({min: 0, max: 10}),
  exclusive: TF.number({gt: 0, lt: 10}),
  whole: TF.number({integer: true}),
  fractional: TF.number({float: true}),
  divisible: TF.number({multipleOf: 3}),
});

const DateModel = RT.object({
  past: TF.date({max: 'now'}),
  window: TF.date({min: '2020-01-01T00:00:00', max: '2030-01-01T00:00:00'}),
});

const ProfileModel = RT.object({name: TF.string({maxLength: 5})});
const SettingsModel = RT.object({theme: TF.string({allowedValues: {val: ['light', 'dark']}})});

// Leaf-format scalars added beyond string/number/date: boolean (no params) +
// bigint (bigint-valued bounds).
const ScalarModel = RT.object({
  active: RT.boolean(),
  count: TF.bigInt({min: 0n, max: 1000n}),
  even: TF.bigInt({multipleOf: 2n}),
});

// Temporal leaf formats (representative subset of the 6 orderable types — all
// share the same MinMax bounds). Requires `ESNext.Temporal` in lib; the test
// harness provides the ambient (test/support/temporal-ambient.d.ts).
const TemporalModel = RT.object({
  at: TFT.instant({min: '2020-01-01T00:00:00Z'}),
  day: RT.optional(TFT.plainDate({max: '2030-12-31'})),
});

// `RT.optional(...)` (shortcut for `propMod({optional: true}, ...)`) makes a
// property optional (`key?:`) — the key may be absent; when present it validates.
const OptionalModel = RT.object({
  id: TF.string({length: 4}), // required
  nick: RT.optional(TF.string({maxLength: 8})), // optional
  age: RT.optional(TF.number({min: 0})), // optional
});

// Regex through the VALUE channel — the two `pattern` forms a value-first string
// field accepts, both carrying mockSamples: an inline `{source, flags,
// mockSamples}` literal and a `registerFormatPattern` value. The Go scanner
// recovers {source, flags} from the literal the property declaration preserves.
const hexPattern = registerFormatPattern({source: '^[0-9a-f]+$', flags: 'i', mockSamples: ['DEADbeef']});
const RegexModel = RT.object({
  slug: TF.string({pattern: {source: '^[a-z0-9-]+$', flags: '', mockSamples: ['ok-slug', 'a-b-c-1']}}), // inline
  digits: TF.string({pattern: {source: '^[0-9]+$', flags: '', mockSamples: ['123', '0']}}), // inline
  hex: TF.string({pattern: hexPattern}), // registerFormatPattern value
});

const NOW = Date.now();

// Reflect-form thunks are written INLINE per case (never via a generic
// helper): the scanner skips any `createValidateFn` call where `T` carries a free
// type parameter, so the model type must be concrete at the literal call site.
// The value is cast (the format brand isn't constructible from a plain
// literal) and discarded at runtime — only its declared type drives `T`.

// Structural formats + child-schema slots — the value-first spellings of the
// JSON Schema array/object keywords (M9-P6). Each model is the schema door's
// exact twin (three-mode id convergence pinned in
// json-schema-define/structuralKeywords.test.ts).
const UniqueList = RT.array(TF.number(), {uniqueItems: true, maxItems: 3});
const CountedRecord = RT.record(RT.unknown(), {minProperties: 1, maxProperties: 2});
const ContainsNumbers = RT.array(RT.unknown(), {contains: TF.number(), minContains: 2});
const PatternKeyed = RT.record(RT.unknown(), {patternProperties: {'^a': TF.number()}});
const ShortKeys = RT.record(RT.unknown(), {propertyNames: TF.string({maxLength: 3})});

export const VALUE_FIRST_SUITE: Record<string, ValueFirstCase> = {
  flat_mixed: {
    title: 'flat model — string/number/date constraints across many fields',
    validate: () => createValidateFn<InferType<typeof UserModel>>(),
    validateReflect: () => {
      const v = {
        username: 'alice',
        code: 'AB12',
        role: 'admin',
        age: 30,
        score: 50,
        step: 10,
        ratio: 1.5,
        level: 10,
        bornBefore: new Date(NOW - 1000),
      } as unknown as InferType<typeof UserModel>;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<InferType<typeof UserModel>>(),
    deserializeValidateReflect: () => {
      const v = {
        username: 'alice',
        code: 'AB12',
        role: 'admin',
        age: 30,
        score: 50,
        step: 10,
        ratio: 1.5,
        level: 10,
        bornBefore: new Date(NOW - 1000),
      } as unknown as InferType<typeof UserModel>;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<InferType<typeof UserModel>>(),
    getSamples: () => ({
      valid: [
        {
          username: 'alice',
          code: 'AB12',
          role: 'admin',
          age: 30,
          score: 50,
          step: 10,
          ratio: 1.5,
          level: 10,
          bornBefore: new Date(NOW - 1000),
        },
        {
          username: 'bob',
          code: 'ZZZZ',
          role: 'guest',
          age: 0,
          score: 99,
          step: 0,
          ratio: 0.1,
          level: -128,
          bornBefore: new Date(0),
        },
      ],
      invalid: [
        // username too short
        {
          username: 'ab',
          code: 'AB12',
          role: 'admin',
          age: 30,
          score: 50,
          step: 10,
          ratio: 1.5,
          level: 10,
          bornBefore: new Date(NOW - 1000),
        },
        // role not in allowedValues
        {
          username: 'alice',
          code: 'AB12',
          role: 'root',
          age: 30,
          score: 50,
          step: 10,
          ratio: 1.5,
          level: 10,
          bornBefore: new Date(NOW - 1000),
        },
        // age not integer
        {
          username: 'alice',
          code: 'AB12',
          role: 'admin',
          age: 30.5,
          score: 50,
          step: 10,
          ratio: 1.5,
          level: 10,
          bornBefore: new Date(NOW - 1000),
        },
        // score not exclusive (== 100)
        {
          username: 'alice',
          code: 'AB12',
          role: 'admin',
          age: 30,
          score: 100,
          step: 10,
          ratio: 1.5,
          level: 10,
          bornBefore: new Date(NOW - 1000),
        },
        // step not multipleOf 5
        {
          username: 'alice',
          code: 'AB12',
          role: 'admin',
          age: 30,
          score: 50,
          step: 7,
          ratio: 1.5,
          level: 10,
          bornBefore: new Date(NOW - 1000),
        },
        // bornBefore in the future
        {
          username: 'alice',
          code: 'AB12',
          role: 'admin',
          age: 30,
          score: 50,
          step: 10,
          ratio: 1.5,
          level: 10,
          bornBefore: new Date(NOW + 1_000_000),
        },
      ],
    }),
  },

  string_features: {
    title: 'string fields — length / minLength / maxLength / allowedValues',
    validate: () => createValidateFn<InferType<typeof StringModel>>(),
    validateReflect: () => {
      const v = {short: 'ab', long: 'abc', exact: 'ABCD', pick: 'red'} as unknown as InferType<typeof StringModel>;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<InferType<typeof StringModel>>(),
    deserializeValidateReflect: () => {
      const v = {short: 'ab', long: 'abc', exact: 'ABCD', pick: 'red'} as unknown as InferType<typeof StringModel>;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<InferType<typeof StringModel>>(),
    getSamples: () => ({
      valid: [
        {short: '', long: 'abc', exact: 'ABCD', pick: 'red'},
        {short: 'hello', long: 'longer', exact: 'wxyz', pick: 'blue'},
      ],
      invalid: [
        {short: 'toolong', long: 'abc', exact: 'ABCD', pick: 'red'}, // short > 5
        {short: 'ok', long: 'ab', exact: 'ABCD', pick: 'red'}, // long < 3
        {short: 'ok', long: 'abc', exact: 'ABC', pick: 'red'}, // exact != 4
        {short: 'ok', long: 'abc', exact: 'ABCD', pick: 'purple'}, // not allowed
      ],
    }),
  },

  number_features: {
    title: 'number fields — bounds / exclusive / integer / float / multipleOf',
    validate: () => createValidateFn<InferType<typeof NumberModel>>(),
    validateReflect: () => {
      const v = {bounded: 5, exclusive: 5, whole: 3, fractional: 1.5, divisible: 9} as unknown as InferType<typeof NumberModel>;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<InferType<typeof NumberModel>>(),
    deserializeValidateReflect: () => {
      const v = {bounded: 5, exclusive: 5, whole: 3, fractional: 1.5, divisible: 9} as unknown as InferType<typeof NumberModel>;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<InferType<typeof NumberModel>>(),
    getSamples: () => ({
      valid: [
        {bounded: 0, exclusive: 1, whole: 3, fractional: 1.5, divisible: 0},
        {bounded: 10, exclusive: 9, whole: -7, fractional: -0.5, divisible: 9},
      ],
      invalid: [
        {bounded: 11, exclusive: 5, whole: 3, fractional: 1.5, divisible: 9}, // bounded > 10
        {bounded: 5, exclusive: 10, whole: 3, fractional: 1.5, divisible: 9}, // exclusive == 10
        {bounded: 5, exclusive: 5, whole: 3.5, fractional: 1.5, divisible: 9}, // whole not integer
        {bounded: 5, exclusive: 5, whole: 3, fractional: 1.5, divisible: 7}, // not multipleOf 3
      ],
    }),
  },

  date_bounds: {
    title: 'date fields — relative now bound + absolute window',
    validate: () => createValidateFn<InferType<typeof DateModel>>(),
    validateReflect: () => {
      const v = {past: new Date(NOW - 1000), window: new Date('2025-06-01T00:00:00')} as unknown as InferType<typeof DateModel>;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<InferType<typeof DateModel>>(),
    deserializeValidateReflect: () => {
      const v = {past: new Date(NOW - 1000), window: new Date('2025-06-01T00:00:00')} as unknown as InferType<typeof DateModel>;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<InferType<typeof DateModel>>(),
    getSamples: () => ({
      valid: [
        {past: new Date(NOW - 1000), window: new Date('2025-06-01T00:00:00')},
        {past: new Date(0), window: new Date('2020-01-01T00:00:00')},
      ],
      invalid: [
        {past: new Date(NOW + 1_000_000), window: new Date('2025-06-01T00:00:00')}, // past in future
        {past: new Date(NOW - 1000), window: new Date('2019-01-01T00:00:00')}, // window before min
        {past: new Date(NOW - 1000), window: new Date('2031-01-01T00:00:00')}, // window after max
      ],
    }),
  },

  regex_patterns: {
    title: 'regex — inline {source, flags, mockSamples} and registerFormatPattern, via the value channel',
    validate: () => createValidateFn<InferType<typeof RegexModel>>(),
    validateReflect: () => {
      const v = {slug: 'ok-slug', digits: '123', hex: 'deadBEEF'} as unknown as InferType<typeof RegexModel>;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<InferType<typeof RegexModel>>(),
    deserializeValidateReflect: () => {
      const v = {slug: 'ok-slug', digits: '123', hex: 'deadBEEF'} as unknown as InferType<typeof RegexModel>;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<InferType<typeof RegexModel>>(),
    getSamples: () => ({
      valid: [
        {slug: 'ok-slug', digits: '123', hex: 'deadBEEF'},
        {slug: 'a-b-c-1', digits: '0', hex: '0042'},
      ],
      invalid: [
        {slug: 'NOT a slug!', digits: '123', hex: 'deadBEEF'}, // slug: spaces/caps
        {slug: 'ok-slug', digits: '12x', hex: 'deadBEEF'}, // digits: non-digit
        {slug: 'ok-slug', digits: '123', hex: 'xyz'}, // hex: non-hex
      ],
    }),
  },

  optional_fields: {
    title: 'optional — `RT.optional(...)` fields may be absent; present ones validate',
    validate: () => createValidateFn<InferType<typeof OptionalModel>>(),
    validateReflect: () => {
      const v = {id: 'AB12'} as unknown as InferType<typeof OptionalModel>;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<InferType<typeof OptionalModel>>(),
    deserializeValidateReflect: () => {
      const v = {id: 'AB12'} as unknown as InferType<typeof OptionalModel>;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<InferType<typeof OptionalModel>>(),
    getSamples: () => ({
      valid: [
        {id: 'AB12'}, // both optionals absent
        {id: 'WXYZ', nick: 'hi', age: 30}, // both present + valid
        {id: 'AB12', age: 0}, // one present
      ],
      invalid: [
        {nick: 'hi'}, // id (required) missing
        {id: 'AB12', nick: 'wayTooLong'}, // present optional violates maxLength
        {id: 'AB12', age: -1}, // present optional violates min
      ],
    }),
  },

  scalars: {
    title: 'scalars — boolean (no params) + bigint (bigint-valued bounds)',
    validate: () => createValidateFn<InferType<typeof ScalarModel>>(),
    validateReflect: () => {
      const v = {active: true, count: 5n, even: 4n} as unknown as InferType<typeof ScalarModel>;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<InferType<typeof ScalarModel>>(),
    deserializeValidateReflect: () => {
      const v = {active: true, count: 5n, even: 4n} as unknown as InferType<typeof ScalarModel>;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<InferType<typeof ScalarModel>>(),
    getSamples: () => ({
      valid: [
        {active: true, count: 0n, even: 0n},
        {active: false, count: 1000n, even: 8n},
      ],
      invalid: [
        {active: 'yes', count: 5n, even: 4n}, // active not boolean
        {active: true, count: 5, even: 4n}, // count number, not bigint
        {active: true, count: 2000n, even: 4n}, // count > max
        {active: true, count: 5n, even: 3n}, // even not multipleOf 2
      ],
    }),
  },

  temporal: {
    title: 'temporal — Instant (min bound) + optional PlainDate (max bound)',
    validate: () => createValidateFn<InferType<typeof TemporalModel>>(),
    validateReflect: () => {
      const v = {at: Temporal.Now.instant()} as unknown as InferType<typeof TemporalModel>;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<InferType<typeof TemporalModel>>(),
    deserializeValidateReflect: () => {
      const v = {at: Temporal.Now.instant()} as unknown as InferType<typeof TemporalModel>;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<InferType<typeof TemporalModel>>(),
    getSamples: () => ({
      valid: [
        {at: Temporal.Instant.from('2021-06-15T00:00:00Z')}, // after min, day absent
        {at: Temporal.Now.instant(), day: Temporal.PlainDate.from('2025-01-01')}, // both present, in range
      ],
      invalid: [
        {at: 'not-an-instant'}, // wrong type
        {day: Temporal.PlainDate.from('2025-01-01')}, // `at` required
        {at: Temporal.Instant.from('2019-01-01T00:00:00Z')}, // before min bound
        {at: Temporal.Now.instant(), day: 'not-a-date'}, // optional present but wrong type
      ],
    }),
  },

  nested: {
    title: 'nested — value-first models composed inside a parent object',
    validate: () => createValidateFn<{profile: InferType<typeof ProfileModel>; settings: InferType<typeof SettingsModel>}>(),
    validateReflect: () => {
      const v = {profile: {name: 'abc'}, settings: {theme: 'dark'}} as unknown as {
        profile: InferType<typeof ProfileModel>;
        settings: InferType<typeof SettingsModel>;
      };
      return createValidateFn(v);
    },
    deserializeValidate: () =>
      deserializeValidate<{profile: InferType<typeof ProfileModel>; settings: InferType<typeof SettingsModel>}>(),
    deserializeValidateReflect: () => {
      const v = {profile: {name: 'abc'}, settings: {theme: 'dark'}} as unknown as {
        profile: InferType<typeof ProfileModel>;
        settings: InferType<typeof SettingsModel>;
      };
      return deserializeValidate(v);
    },
    getValidationErrors: () =>
      createGetValidationErrorsFn<{profile: InferType<typeof ProfileModel>; settings: InferType<typeof SettingsModel>}>(),
    getSamples: () => ({
      valid: [
        {profile: {name: 'abc'}, settings: {theme: 'dark'}},
        {profile: {name: 'hi'}, settings: {theme: 'light'}},
      ],
      invalid: [
        {profile: {name: 'toolong'}, settings: {theme: 'dark'}}, // profile.name > 5
        {profile: {name: 'abc'}, settings: {theme: 'blue'}}, // settings.theme not allowed
      ],
    }),
  },

  structural_array_format: {
    title: 'formattedArray — uniqueItems + maxItems on a typed array',
    validate: () => createValidateFn<InferType<typeof UniqueList>>(),
    validateReflect: () => {
      const v = [1, 2] as unknown as InferType<typeof UniqueList>;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<InferType<typeof UniqueList>>(),
    deserializeValidateReflect: () => {
      const v = [1, 2] as unknown as InferType<typeof UniqueList>;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<InferType<typeof UniqueList>>(),
    getSamples: () => ({
      valid: [[], [1, 2, 3]],
      invalid: [[1, 1], [1, 2, 3, 4], ['x'], 5],
    }),
  },

  structural_object_format: {
    title: 'formattedObject — key-count bounds on a record',
    validate: () => createValidateFn<InferType<typeof CountedRecord>>(),
    validateReflect: () => {
      const v = {a: 1} as unknown as InferType<typeof CountedRecord>;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<InferType<typeof CountedRecord>>(),
    deserializeValidateReflect: () => {
      const v = {a: 1} as unknown as InferType<typeof CountedRecord>;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<InferType<typeof CountedRecord>>(),
    getSamples: () => ({
      valid: [{a: 1}, {a: 1, b: 2}],
      invalid: [{}, {a: 1, b: 2, c: 3}, 'x'],
    }),
  },

  structural_contains: {
    title: 'contains — at least two numbers among the items',
    validate: () => createValidateFn<InferType<typeof ContainsNumbers>>(),
    validateReflect: () => {
      const v = [1, 2] as unknown as InferType<typeof ContainsNumbers>;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<InferType<typeof ContainsNumbers>>(),
    deserializeValidateReflect: () => {
      const v = [1, 2] as unknown as InferType<typeof ContainsNumbers>;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<InferType<typeof ContainsNumbers>>(),
    getSamples: () => ({
      valid: [
        [1, 2],
        ['a', 1, 2, 'b'],
      ],
      invalid: [[1], ['a'], [], 7],
    }),
  },

  structural_pattern_properties: {
    title: 'patternProperties — ^a keys must map to numbers',
    validate: () => createValidateFn<InferType<typeof PatternKeyed>>(),
    validateReflect: () => {
      const v = {a1: 5} as unknown as InferType<typeof PatternKeyed>;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<InferType<typeof PatternKeyed>>(),
    deserializeValidateReflect: () => {
      const v = {a1: 5} as unknown as InferType<typeof PatternKeyed>;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<InferType<typeof PatternKeyed>>(),
    getSamples: () => ({
      valid: [{a1: 5}, {other: 'x'}, {}],
      invalid: [{a1: 'x'}, 'nope'],
    }),
  },

  structural_property_names: {
    title: 'propertyNames — every key at most three characters',
    validate: () => createValidateFn<InferType<typeof ShortKeys>>(),
    validateReflect: () => {
      const v = {ab: 1} as unknown as InferType<typeof ShortKeys>;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<InferType<typeof ShortKeys>>(),
    deserializeValidateReflect: () => {
      const v = {ab: 1} as unknown as InferType<typeof ShortKeys>;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<InferType<typeof ShortKeys>>(),
    getSamples: () => ({
      valid: [{ab: 1}, {}],
      invalid: [{abcd: 1}, 3],
    }),
  },
};
