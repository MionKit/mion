// Reflect-form thunks author a REAL example value of the (now transparent) format
// type — the case's first valid sample (e.g. 100n, 9, 'john@example.com'). The value
// only drives `T` inference and is discarded at runtime, but a realistic literal keeps
// these snippets self-explanatory and safe to lift into docs. Every form is exercised:
// validate + getValidationErrors (static / reflect / deserialize-static /
// deserialize-reflect) + mockType; the getValidationErrors format-payload forms assert
// the exact format error survives every resolution path.
import * as TF from '@mionjs/run-types/formats';
import type {FormatValidationCase} from './types.ts';
import '@mionjs/run-types/formats';
import {
  createValidateFn,
  createGetValidationErrorsFn,
  createMockDataFn,
  createStandardSchema,
  registerFormatPattern,
  type DataOnly,
} from '@mionjs/run-types';
import {deserializeValidate, deserializeGetValidationErrors} from '../../util/deserializeRTFunctions.ts';

// The content-keyword presets are ordinary string formats: the encodings
// ride the anchored RFC 4648 pattern params (with baked mock pools),
// JsonContent is a string-param parse-check family.
type Base64String = TF.Base64;
type Base32String = TF.Base32;
type Base16String = TF.Base16;
type JsonString = TF.JsonContent;

// Custom patterns registered once at module load — the call sites the
// Go scanner recovers {source, flags, mockSamples} from. Mirrors the
// `registerFormatPattern` block in the old stringFormats.test.ts.
const slug = registerFormatPattern({
  source: '^[a-z0-9-]+$',
  mockSamples: ['my-slug', 'abc', 'a-b-c'],
  message: 'must be a slug',
});
type Slug = TF.String<{pattern: typeof slug}>;

const hex = registerFormatPattern({source: '^[0-9a-f]+$', flags: 'i', mockSamples: ['DEADbeef', '0042']});
type Hex = TF.String<{pattern: typeof hex}>;

// Sample-less inline pattern — the pattern_generated case: no mockSamples
// anywhere, the build generates the pool from the regex.
type Generated = TF.String<{pattern: {source: '^[a-d]{2}-[0-9]{2}$'; flags: 'u'}}>;

const V4 = '9f1b8c2e-3d4a-4b5c-8d6e-1f2a3b4c5d6e'; // version nibble = 4
const V7 = '018f1b8c-2e3d-7b5c-8d6e-1f2a3b4c5d6e'; // version nibble = 7
const V1 = '9f1b8c2e-3d4a-1b5c-8d6e-1f2a3b4c5d6e'; // version nibble = 1
// RFC 9562 §5.9 / §5.10 — the Nil and Max UUIDs are VALID UUIDs whose version
// nibble (0 / f) names no version at all. They are the reason `format: 'uuid'`
// cannot default to a pinned version: doing so would reject them.
const NIL_UUID = '00000000-0000-0000-0000-000000000000';
const MAX_UUID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// Card numbers: the publicly published gateway test values, all Luhn-valid.
const VISA = '4111111111111111';
const MASTERCARD = '5555555555554444';
const AMEX = '378282246310005';
// One digit of VISA changed. The whole point of the checksum: a plain
// digits-and-length check would wave this through.
const VISA_TYPO = '4111111111111112';
const VISA_SPACED = '4111 1111 1111 1111';
const VISA_DASHED = '4111-1111-1111-1111';

export const STRING_FORMAT = {
  // ─────────────────────────── TF.String ───────────────────────
  string_maxLength: {
    title: 'String maxLength',
    description: 'stringFormat with an inclusive upper-length bound that rejects strings longer than `maxLength`.',
    validateNotes:
      'Length 5 passes (`hello`); 6 chars (`hello!`) fails with `val` 5 (`maxLength`). A non-string (42) fails the string typeof gate before any format check. Empty string passes.',
    validate: () => createValidateFn<TF.String<{maxLength: 5}>>(),
    standardSchema: () => createStandardSchema<TF.String<{maxLength: 5}>>(),
    // One hand-authored Standard Schema expectation per file. Every other case
    // derives its expected issues from getExpectedErrors via runTypeErrorsToIssues
    // (the same mapping the factory uses), so this single case pins the real
    // consumer-facing {message, path} output independently: it trips if error
    // generation or the issue mapping changes. One case per file covers this
    // file's shapes without the ~265x maintenance of authoring every case.
    getExpectedStandardErrors: () => [
      [
        {
          message: 'Failed maxLength constraint (5)',
          path: [],
          expected: 'string',
          format: {name: 'stringFormat', formatPath: ['maxLength'], val: 5},
        },
      ],
      [{message: 'Expected string', path: [], expected: 'string'}],
    ],
    validateReflect: () => {
      const v: TF.String<{maxLength: 5}> = 'hello';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.String<{maxLength: 5}>>(),
    deserializeValidateReflect: () => {
      const v: TF.String<{maxLength: 5}> = 'hello';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.String<{maxLength: 5}> = 'hello';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.String<{maxLength: 5}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.String<{maxLength: 5}> = 'hello';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.String<{maxLength: 5}> = 'hello';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.String<{maxLength: 5}>>>(),
    validateSchema: () => createValidateFn(TF.string({maxLength: 5})),
    getValidationErrors: () => createGetValidationErrorsFn<TF.String<{maxLength: 5}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.String<{maxLength: 5}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.string({maxLength: 5})),
    mockType: () => createMockDataFn<TF.String<{maxLength: 5}>>(),
    getSamples: () => ({valid: ['', 'hello'], invalid: ['hello!', 42]}),
    expectedFormatErrors: () => [{name: 'stringFormat', val: 5}, null],
  },
  string_minLength: {
    title: 'String minLength',
    description: 'stringFormat with an inclusive lower-length bound that rejects strings shorter than `minLength`.',
    validateNotes: 'Length 3 passes (`abc`); 2 chars (`ab`) and the empty string both fail with `val` 3 (`minLength`).',
    validate: () => createValidateFn<TF.String<{minLength: 3}>>(),
    standardSchema: () => createStandardSchema<TF.String<{minLength: 3}>>(),
    validateReflect: () => {
      const v: TF.String<{minLength: 3}> = 'abc';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.String<{minLength: 3}>>(),
    deserializeValidateReflect: () => {
      const v: TF.String<{minLength: 3}> = 'abc';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.String<{minLength: 3}> = 'abc';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.String<{minLength: 3}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.String<{minLength: 3}> = 'abc';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.String<{minLength: 3}> = 'abc';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.String<{minLength: 3}>>>(),
    validateSchema: () => createValidateFn(TF.string({minLength: 3})),
    getValidationErrors: () => createGetValidationErrorsFn<TF.String<{minLength: 3}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.String<{minLength: 3}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.string({minLength: 3})),
    mockType: () => createMockDataFn<TF.String<{minLength: 3}>>(),
    getSamples: () => ({valid: ['abc', 'abcd'], invalid: ['ab', '']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 3},
      {name: 'stringFormat', val: 3},
    ],
  },
  string_length: {
    title: 'String length',
    description: 'stringFormat requiring an exact length that rejects anything not exactly `length` chars.',
    validateNotes: ['Only length 4 passes (`abcd`); both 3 chars (`abc`) and 5 chars (`abcde`) fail with `val` 4 (`length`).'],
    validate: () => createValidateFn<TF.String<{length: 4}>>(),
    standardSchema: () => createStandardSchema<TF.String<{length: 4}>>(),
    validateReflect: () => {
      const v: TF.String<{length: 4}> = 'abcd';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.String<{length: 4}>>(),
    deserializeValidateReflect: () => {
      const v: TF.String<{length: 4}> = 'abcd';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.String<{length: 4}> = 'abcd';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.String<{length: 4}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.String<{length: 4}> = 'abcd';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.String<{length: 4}> = 'abcd';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.String<{length: 4}>>>(),
    validateSchema: () => createValidateFn(TF.string({length: 4})),
    getValidationErrors: () => createGetValidationErrorsFn<TF.String<{length: 4}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.String<{length: 4}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.string({length: 4})),
    mockType: () => createMockDataFn<TF.String<{length: 4}>>(),
    getSamples: () => ({valid: ['abcd'], invalid: ['abc', 'abcde']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 4},
      {name: 'stringFormat', val: 4},
    ],
  },
  string_range: {
    title: 'String length range',
    description: 'stringFormat with both inclusive length bounds, accepting lengths in `[minLength, maxLength]`.',
    validateNotes:
      'Boundary lengths 2 (`ab`) and 4 (`abcd`) pass (inclusive). 1 char (`a`) fails with `val` 2 (`minLength`); 5 chars (`abcde`) fails with `val` 4 (`maxLength`).',
    validate: () => createValidateFn<TF.String<{minLength: 2; maxLength: 4}>>(),
    standardSchema: () => createStandardSchema<TF.String<{minLength: 2; maxLength: 4}>>(),
    validateReflect: () => {
      const v: TF.String<{minLength: 2; maxLength: 4}> = 'ab';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.String<{minLength: 2; maxLength: 4}>>(),
    deserializeValidateReflect: () => {
      const v: TF.String<{minLength: 2; maxLength: 4}> = 'ab';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.String<{minLength: 2; maxLength: 4}> = 'ab';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.String<{minLength: 2; maxLength: 4}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.String<{minLength: 2; maxLength: 4}> = 'ab';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.String<{minLength: 2; maxLength: 4}> = 'ab';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.String<{minLength: 2; maxLength: 4}>>>(),
    validateSchema: () => createValidateFn(TF.string({minLength: 2, maxLength: 4})),
    getValidationErrors: () => createGetValidationErrorsFn<TF.String<{minLength: 2; maxLength: 4}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.String<{minLength: 2; maxLength: 4}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.string({minLength: 2, maxLength: 4})),
    mockType: () => createMockDataFn<TF.String<{minLength: 2; maxLength: 4}>>(),
    getSamples: () => ({valid: ['ab', 'abcd'], invalid: ['a', 'abcde']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 2},
      {name: 'stringFormat', val: 4},
    ],
  },
  string_allowedChars: {
    title: 'String allowedChars',
    description: 'stringFormat restricting every char to the `allowedChars` set (hex digits), rejecting any out-of-set char.',
    validateNotes: [
      'Each character must be in `0123456789abcdef`; `deadbeef` and `0042` pass.',
      '`xyz` fails with `val` `Invalid characters`.',
      'The space in `dead beef` is not in the set, so it also fails. The empty string passes (no chars to check).',
    ],
    validate: () => createValidateFn<TF.String<{allowedChars: {val: '0123456789abcdef'}}>>(),
    standardSchema: () => createStandardSchema<TF.String<{allowedChars: {val: '0123456789abcdef'}}>>(),
    validateReflect: () => {
      const v: TF.String<{allowedChars: {val: '0123456789abcdef'}}> = 'deadbeef';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.String<{allowedChars: {val: '0123456789abcdef'}}>>(),
    deserializeValidateReflect: () => {
      const v: TF.String<{allowedChars: {val: '0123456789abcdef'}}> = 'deadbeef';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.String<{allowedChars: {val: '0123456789abcdef'}}> = 'deadbeef';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.String<{allowedChars: {val: '0123456789abcdef'}}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.String<{allowedChars: {val: '0123456789abcdef'}}> = 'deadbeef';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.String<{allowedChars: {val: '0123456789abcdef'}}> = 'deadbeef';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.String<{allowedChars: {val: '0123456789abcdef'}}>>>(),
    validateSchema: () => createValidateFn(TF.string({allowedChars: {val: '0123456789abcdef'}})),
    getValidationErrors: () => createGetValidationErrorsFn<TF.String<{allowedChars: {val: '0123456789abcdef'}}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrorsFn<DataOnly<TF.String<{allowedChars: {val: '0123456789abcdef'}}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.string({allowedChars: {val: '0123456789abcdef'}})),
    mockType: () => createMockDataFn<TF.String<{allowedChars: {val: '0123456789abcdef'}}>>(),
    getSamples: () => ({valid: ['deadbeef', '0042'], invalid: ['xyz', 'dead beef', '']}),
    expectedFormatErrors: () => [{name: 'stringFormat', val: 'Invalid characters'}, null, null],
  },
  string_allowedChars_ignoreCase: {
    title: 'String allowedChars ignoreCase',
    description: 'stringFormat allowedChars with `ignoreCase` so both cases of the `abc` set are accepted.',
    validateNotes: [
      'Case-folded: `ABC` and `aAbBcC` pass even though only lowercase `abc` was listed. `abcd` fails with `val` `Invalid characters` (`d` not in the set).',
    ],
    validate: () => createValidateFn<TF.String<{allowedChars: {val: 'abc'; ignoreCase: true}}>>(),
    standardSchema: () => createStandardSchema<TF.String<{allowedChars: {val: 'abc'; ignoreCase: true}}>>(),
    validateReflect: () => {
      const v: TF.String<{allowedChars: {val: 'abc'; ignoreCase: true}}> = 'ABC';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.String<{allowedChars: {val: 'abc'; ignoreCase: true}}>>(),
    deserializeValidateReflect: () => {
      const v: TF.String<{allowedChars: {val: 'abc'; ignoreCase: true}}> = 'ABC';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.String<{allowedChars: {val: 'abc'; ignoreCase: true}}> = 'ABC';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<TF.String<{allowedChars: {val: 'abc'; ignoreCase: true}}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.String<{allowedChars: {val: 'abc'; ignoreCase: true}}> = 'ABC';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.String<{allowedChars: {val: 'abc'; ignoreCase: true}}> = 'ABC';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.String<{allowedChars: {val: 'abc'; ignoreCase: true}}>>>(),
    validateSchema: () => createValidateFn(TF.string({allowedChars: {val: 'abc', ignoreCase: true}})),
    getValidationErrors: () => createGetValidationErrorsFn<TF.String<{allowedChars: {val: 'abc'; ignoreCase: true}}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrorsFn<DataOnly<TF.String<{allowedChars: {val: 'abc'; ignoreCase: true}}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.string({allowedChars: {val: 'abc', ignoreCase: true}})),
    mockType: () => createMockDataFn<TF.String<{allowedChars: {val: 'abc'; ignoreCase: true}}>>(),
    getSamples: () => ({valid: ['ABC', 'aAbBcC'], invalid: ['abcd']}),
    expectedFormatErrors: () => [{name: 'stringFormat', val: 'Invalid characters'}],
  },
  string_allowedChars_literal: {
    title: 'String allowedChars literal',
    description: 'stringFormat allowedChars where regex-special chars are matched literally so only `.` and `-` pass.',
    validateNotes: [
      'The set `.-` is treated as literal chars (NOT a regex range), so `...---` passes. `a` fails with `val` `Invalid characters`.',
    ],
    validate: () => createValidateFn<TF.String<{allowedChars: {val: '.-'}}>>(),
    standardSchema: () => createStandardSchema<TF.String<{allowedChars: {val: '.-'}}>>(),
    validateReflect: () => {
      const v: TF.String<{allowedChars: {val: '.-'}}> = '...---';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.String<{allowedChars: {val: '.-'}}>>(),
    deserializeValidateReflect: () => {
      const v: TF.String<{allowedChars: {val: '.-'}}> = '...---';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.String<{allowedChars: {val: '.-'}}> = '...---';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.String<{allowedChars: {val: '.-'}}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.String<{allowedChars: {val: '.-'}}> = '...---';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.String<{allowedChars: {val: '.-'}}> = '...---';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.String<{allowedChars: {val: '.-'}}>>>(),
    validateSchema: () => createValidateFn(TF.string({allowedChars: {val: '.-'}})),
    getValidationErrors: () => createGetValidationErrorsFn<TF.String<{allowedChars: {val: '.-'}}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.String<{allowedChars: {val: '.-'}}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.string({allowedChars: {val: '.-'}})),
    mockType: () => createMockDataFn<TF.String<{allowedChars: {val: '.-'}}>>(),
    getSamples: () => ({valid: ['...---'], invalid: ['a']}),
    expectedFormatErrors: () => [{name: 'stringFormat', val: 'Invalid characters'}],
  },
  string_disallowedChars: {
    title: 'String disallowedChars',
    description: 'stringFormat blacklisting the `disallowedChars` set (`!@#`) so any occurrence rejects the string.',
    validateNotes: [
      'A string passes only if it contains none of `!`, `@`, `#`; `hello` passes. `hi!` and `a@b` each fail with `val` `Invalid characters`.',
    ],
    validate: () => createValidateFn<TF.String<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>(),
    standardSchema: () => createStandardSchema<TF.String<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>(),
    validateReflect: () => {
      const v: TF.String<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}> = 'hello';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.String<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>(),
    deserializeValidateReflect: () => {
      const v: TF.String<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}> = 'hello';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.String<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}> = 'hello';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<TF.String<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.String<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}> = 'hello';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.String<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}> = 'hello';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.String<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>>(),
    validateSchema: () => createValidateFn(TF.string({disallowedChars: {val: '!@#', mockSamples: 'abc'}})),
    getValidationErrors: () => createGetValidationErrorsFn<TF.String<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrorsFn<DataOnly<TF.String<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.string({disallowedChars: {val: '!@#', mockSamples: 'abc'}})),
    mockType: () => createMockDataFn<TF.String<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>(),
    getSamples: () => ({valid: ['hello'], invalid: ['hi!', 'a@b']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 'Invalid characters'},
      {name: 'stringFormat', val: 'Invalid characters'},
    ],
  },
  string_allowedValues: {
    title: 'String allowedValues',
    description: 'stringFormat restricting the whole value to a fixed set (`red`/`green`/`blue`) via enum-like exact match.',
    validateNotes: [
      'The entire string must equal one listed value; `red` and `blue` pass.',
      '`yellow` (not listed) fails with `val` `Invalid value`.',
      'Match is case-sensitive (`RED` fails) and whole-string (`redgreen` fails — no substring/concat).',
    ],
    validate: () => createValidateFn<TF.String<{allowedValues: {val: ['red', 'green', 'blue']}}>>(),
    standardSchema: () => createStandardSchema<TF.String<{allowedValues: {val: ['red', 'green', 'blue']}}>>(),
    validateReflect: () => {
      const v: TF.String<{allowedValues: {val: ['red', 'green', 'blue']}}> = 'red';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.String<{allowedValues: {val: ['red', 'green', 'blue']}}>>(),
    deserializeValidateReflect: () => {
      const v: TF.String<{allowedValues: {val: ['red', 'green', 'blue']}}> = 'red';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.String<{allowedValues: {val: ['red', 'green', 'blue']}}> = 'red';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<TF.String<{allowedValues: {val: ['red', 'green', 'blue']}}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.String<{allowedValues: {val: ['red', 'green', 'blue']}}> = 'red';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.String<{allowedValues: {val: ['red', 'green', 'blue']}}> = 'red';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.String<{allowedValues: {val: ['red', 'green', 'blue']}}>>>(),
    validateSchema: () => createValidateFn(TF.string({allowedValues: {val: ['red', 'green', 'blue']}})),
    getValidationErrors: () => createGetValidationErrorsFn<TF.String<{allowedValues: {val: ['red', 'green', 'blue']}}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrorsFn<DataOnly<TF.String<{allowedValues: {val: ['red', 'green', 'blue']}}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.string({allowedValues: {val: ['red', 'green', 'blue']}})),
    mockType: () => createMockDataFn<TF.String<{allowedValues: {val: ['red', 'green', 'blue']}}>>(),
    getSamples: () => ({valid: ['red', 'blue'], invalid: ['yellow', 'RED', 'redgreen']}),
    expectedFormatErrors: () => [{name: 'stringFormat', val: 'Invalid value'}, null, null],
  },
  string_allowedValues_ignoreCase: {
    title: 'String allowedValues ignoreCase',
    description: 'stringFormat allowedValues with `ignoreCase` so the fixed set matches regardless of case.',
    validateNotes: [
      'Case-folded equality: `RED` and `Green` pass. `blue` (not in the `red`/`green` set) fails with `val` `Invalid value`.',
    ],
    validate: () => createValidateFn<TF.String<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>(),
    standardSchema: () => createStandardSchema<TF.String<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>(),
    validateReflect: () => {
      const v: TF.String<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}> = 'RED';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.String<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>(),
    deserializeValidateReflect: () => {
      const v: TF.String<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}> = 'RED';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.String<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}> = 'RED';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<TF.String<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.String<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}> = 'RED';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.String<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}> = 'RED';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.String<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>>(),
    validateSchema: () => createValidateFn(TF.string({allowedValues: {val: ['red', 'green'], ignoreCase: true}})),
    getValidationErrors: () =>
      createGetValidationErrorsFn<TF.String<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrorsFn<DataOnly<TF.String<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(TF.string({allowedValues: {val: ['red', 'green'], ignoreCase: true}})),
    mockType: () => createMockDataFn<TF.String<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>(),
    getSamples: () => ({valid: ['RED', 'Green'], invalid: ['blue']}),
    expectedFormatErrors: () => [{name: 'stringFormat', val: 'Invalid value'}],
  },
  string_allowedValues_escaped: {
    title: 'String allowedValues literal',
    description: 'stringFormat allowedValues where regex-special chars in the set are matched literally.',
    validateNotes: [
      'Listed values `a.b` and `c+d` match literally (the `.` and `+` are not regex metacharacters), so they pass. `axb` and `ccd` each fail with `val` `Invalid value`.',
    ],
    validate: () => createValidateFn<TF.String<{allowedValues: {val: ['a.b', 'c+d']}}>>(),
    standardSchema: () => createStandardSchema<TF.String<{allowedValues: {val: ['a.b', 'c+d']}}>>(),
    validateReflect: () => {
      const v: TF.String<{allowedValues: {val: ['a.b', 'c+d']}}> = 'a.b';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.String<{allowedValues: {val: ['a.b', 'c+d']}}>>(),
    deserializeValidateReflect: () => {
      const v: TF.String<{allowedValues: {val: ['a.b', 'c+d']}}> = 'a.b';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.String<{allowedValues: {val: ['a.b', 'c+d']}}> = 'a.b';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.String<{allowedValues: {val: ['a.b', 'c+d']}}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.String<{allowedValues: {val: ['a.b', 'c+d']}}> = 'a.b';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.String<{allowedValues: {val: ['a.b', 'c+d']}}> = 'a.b';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.String<{allowedValues: {val: ['a.b', 'c+d']}}>>>(),
    validateSchema: () => createValidateFn(TF.string({allowedValues: {val: ['a.b', 'c+d']}})),
    getValidationErrors: () => createGetValidationErrorsFn<TF.String<{allowedValues: {val: ['a.b', 'c+d']}}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.String<{allowedValues: {val: ['a.b', 'c+d']}}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.string({allowedValues: {val: ['a.b', 'c+d']}})),
    mockType: () => createMockDataFn<TF.String<{allowedValues: {val: ['a.b', 'c+d']}}>>(),
    getSamples: () => ({valid: ['a.b', 'c+d'], invalid: ['axb', 'ccd']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 'Invalid value'},
      {name: 'stringFormat', val: 'Invalid value'},
    ],
  },
  string_disallowedValues: {
    title: 'String disallowedValues',
    description: 'stringFormat blacklisting whole values (`admin`/`root`) so any other string passes.',
    validateNotes: [
      'A string passes unless it exactly equals a blacklisted value; `alice` passes. `admin` and `root` each fail with `val` `Invalid value`.',
    ],
    validate: () => createValidateFn<TF.String<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>(),
    standardSchema: () =>
      createStandardSchema<TF.String<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>(),
    validateReflect: () => {
      const v: TF.String<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}> = 'alice';
      return createValidateFn(v);
    },
    deserializeValidate: () =>
      deserializeValidate<TF.String<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>(),
    deserializeValidateReflect: () => {
      const v: TF.String<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}> = 'alice';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.String<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}> = 'alice';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<TF.String<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.String<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}> = 'alice';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.String<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}> = 'alice';
      return createMockDataFn(v);
    },
    validateDataOnly: () =>
      createValidateFn<DataOnly<TF.String<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>>(),
    validateSchema: () =>
      createValidateFn(TF.string({disallowedValues: {val: ['admin', 'root'], mockSamples: ['alice', 'bob']}})),
    getValidationErrors: () =>
      createGetValidationErrorsFn<TF.String<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrorsFn<
        DataOnly<TF.String<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>
      >(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(TF.string({disallowedValues: {val: ['admin', 'root'], mockSamples: ['alice', 'bob']}})),
    mockType: () => createMockDataFn<TF.String<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>(),
    getSamples: () => ({valid: ['alice'], invalid: ['admin', 'root']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 'Invalid value'},
      {name: 'stringFormat', val: 'Invalid value'},
    ],
  },
  string_customErrorMessage: {
    title: 'String custom errorMessage',
    description: 'stringFormat allowedValues with a custom `errorMessage` that surfaces as the format error `val` on failure.',
    validateNotes: [
      '`a` and `b` pass. `c` fails with `val` `pick a or b` — the custom `errorMessage` replaces the default `Invalid value`.',
    ],
    validate: () => createValidateFn<TF.String<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>(),
    standardSchema: () => createStandardSchema<TF.String<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>(),
    validateReflect: () => {
      const v: TF.String<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}> = 'a';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.String<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>(),
    deserializeValidateReflect: () => {
      const v: TF.String<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}> = 'a';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.String<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}> = 'a';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<TF.String<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.String<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}> = 'a';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.String<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}> = 'a';
      return createMockDataFn(v);
    },
    validateDataOnly: () =>
      createValidateFn<DataOnly<TF.String<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>>(),
    validateSchema: () => createValidateFn(TF.string({allowedValues: {val: ['a', 'b'], errorMessage: 'pick a or b'}})),
    getValidationErrors: () =>
      createGetValidationErrorsFn<TF.String<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrorsFn<DataOnly<TF.String<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(TF.string({allowedValues: {val: ['a', 'b'], errorMessage: 'pick a or b'}})),
    mockType: () => createMockDataFn<TF.String<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>(),
    getSamples: () => ({valid: ['a', 'b'], invalid: ['c']}),
    expectedFormatErrors: () => [{name: 'stringFormat', val: 'pick a or b'}],
  },

  // ─────────────────────── Default string formats ─────────────────
  alpha: {
    title: 'Alpha',
    description: 'TF.Alpha (stringFormat with a baked letters-only pattern) that rejects digits, spaces, and symbols.',
    validateNotes: [
      'Only ASCII letters pass; `Hello` and `abcXYZ` pass.',
      'A digit (`hello1`) or space (`hi there`) fails with `val` `Invalid pattern`.',
      'The empty string passes (the pattern allows zero letters).',
    ],
    validate: () => createValidateFn<TF.Alpha>(),
    standardSchema: () => createStandardSchema<TF.Alpha>(),
    validateReflect: () => {
      const v: TF.Alpha = 'Hello';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.Alpha>(),
    deserializeValidateReflect: () => {
      const v: TF.Alpha = 'Hello';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.Alpha = 'Hello';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.Alpha>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.Alpha = 'Hello';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.Alpha = 'Hello';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.Alpha>>(),
    validateSchema: () => createValidateFn(TF.alpha()),
    getValidationErrors: () => createGetValidationErrorsFn<TF.Alpha>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.Alpha>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.alpha()),
    mockType: () => createMockDataFn<TF.Alpha>(),
    getSamples: () => ({valid: ['Hello', 'abcXYZ'], invalid: ['hello1', 'hi there', '']}),
    expectedFormatErrors: () => [{name: 'stringFormat', val: 'Invalid pattern'}, null, null],
  },
  alphaNumeric: {
    title: 'AlphaNumeric',
    description: 'TF.AlphaNumeric (stringFormat with a baked letters+digits pattern) that rejects everything else.',
    validateNotes: [
      'Letters and digits pass (`abc123`, `ABC`, `123`); a hyphen (`a-b`) or space (`a b`) fails with `val` `Invalid pattern`.',
    ],
    validate: () => createValidateFn<TF.AlphaNumeric>(),
    standardSchema: () => createStandardSchema<TF.AlphaNumeric>(),
    validateReflect: () => {
      const v: TF.AlphaNumeric = 'abc123';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.AlphaNumeric>(),
    deserializeValidateReflect: () => {
      const v: TF.AlphaNumeric = 'abc123';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.AlphaNumeric = 'abc123';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.AlphaNumeric>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.AlphaNumeric = 'abc123';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.AlphaNumeric = 'abc123';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.AlphaNumeric>>(),
    validateSchema: () => createValidateFn(TF.alphaNumeric()),
    getValidationErrors: () => createGetValidationErrorsFn<TF.AlphaNumeric>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.AlphaNumeric>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.alphaNumeric()),
    mockType: () => createMockDataFn<TF.AlphaNumeric>(),
    getSamples: () => ({valid: ['abc123', 'ABC', '123'], invalid: ['a-b', 'a b']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 'Invalid pattern'},
      {name: 'stringFormat', val: 'Invalid pattern'},
    ],
  },
  numeric: {
    title: 'Numeric',
    description: 'TF.Numeric (stringFormat with a baked digits-only pattern) that rejects non-digit chars.',
    validateNotes: [
      'Only digit chars pass (`12345`, `007` — leading zeros allowed since it is a string). A decimal point (`12.3`) or letter (`12a`) fails with `val` `Invalid pattern`.',
    ],
    validate: () => createValidateFn<TF.Numeric>(),
    standardSchema: () => createStandardSchema<TF.Numeric>(),
    validateReflect: () => {
      const v: TF.Numeric = '12345';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.Numeric>(),
    deserializeValidateReflect: () => {
      const v: TF.Numeric = '12345';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.Numeric = '12345';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.Numeric>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.Numeric = '12345';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.Numeric = '12345';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.Numeric>>(),
    validateSchema: () => createValidateFn(TF.numeric()),
    getValidationErrors: () => createGetValidationErrorsFn<TF.Numeric>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.Numeric>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.numeric()),
    mockType: () => createMockDataFn<TF.Numeric>(),
    getSamples: () => ({valid: ['12345', '007'], invalid: ['12.3', '12a']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 'Invalid pattern'},
      {name: 'stringFormat', val: 'Invalid pattern'},
    ],
  },
  alpha_withLength: {
    title: 'Alpha with maxLength',
    description: 'TF.Alpha carrying a `maxLength` param that enforces letters-only AND an inclusive upper-length bound.',
    validateNotes: [
      '`abc` (3 letters) passes. `abcd` exceeds the bound and fails with `val` 3 (`maxLength`); `a1` is within length but the digit fails the pattern with `val` `Invalid pattern`.',
    ],
    validate: () => createValidateFn<TF.Alpha<{maxLength: 3}>>(),
    standardSchema: () => createStandardSchema<TF.Alpha<{maxLength: 3}>>(),
    validateReflect: () => {
      const v: TF.Alpha<{maxLength: 3}> = 'abc';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.Alpha<{maxLength: 3}>>(),
    deserializeValidateReflect: () => {
      const v: TF.Alpha<{maxLength: 3}> = 'abc';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.Alpha<{maxLength: 3}> = 'abc';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.Alpha<{maxLength: 3}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.Alpha<{maxLength: 3}> = 'abc';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.Alpha<{maxLength: 3}> = 'abc';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.Alpha<{maxLength: 3}>>>(),
    validateSchema: () => createValidateFn(TF.alpha({maxLength: 3})),
    getValidationErrors: () => createGetValidationErrorsFn<TF.Alpha<{maxLength: 3}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.Alpha<{maxLength: 3}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.alpha({maxLength: 3})),
    mockType: () => createMockDataFn<TF.Alpha<{maxLength: 3}>>(),
    getSamples: () => ({valid: ['abc'], invalid: ['abcd', 'a1']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 3},
      {name: 'stringFormat', val: 'Invalid pattern'},
    ],
  },
  lowercase_validate: {
    title: 'Lowercase',
    description: 'TF.Lowercase (transformer-only `lowercase` flag) that validate treats as a plain string.',
    validateNotes: [
      'The lowercase transform applies only via createFormatTransformFn, NOT validate — so ANY string passes regardless of case (`already lower` AND `HasUpper` pass). Only a non-string (42) fails, via the typeof gate.',
    ],
    validate: () => createValidateFn<TF.Lowercase>(),
    standardSchema: () => createStandardSchema<TF.Lowercase>(),
    validateReflect: () => {
      const v: TF.Lowercase = 'already lower';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.Lowercase>(),
    deserializeValidateReflect: () => {
      const v: TF.Lowercase = 'already lower';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.Lowercase = 'already lower';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.Lowercase>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.Lowercase = 'already lower';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.Lowercase = 'already lower';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.Lowercase>>(),
    validateSchema: () => createValidateFn(TF.lowercase()),
    getValidationErrors: () => createGetValidationErrorsFn<TF.Lowercase>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.Lowercase>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.lowercase()),
    mockType: () => createMockDataFn<TF.Lowercase>(),
    getSamples: () => ({valid: ['already lower', 'HasUpper'], invalid: [42]}),
    expectedFormatErrors: () => [null],
  },

  // ─────────────────────────────── UUID ───────────────────────────
  uuid: {
    title: 'UUID (any version)',
    description:
      'TF.UUID (format `uuid`, version `any`) — the version-agnostic UUID that JSON Schema `format: uuid` recovers; the version nibble is an ordinary hex digit.',
    validateNotes: [
      'Both a v4 and a v7 UUID pass; no version nibble is pinned.',
      'A v1 UUID and the RFC 9562 Nil / Max UUIDs pass too: `any` checks the RFC string layout (36 chars, hyphens at 8/13/18/23, hex everywhere else) and reads the version nibble as an ordinary hex digit. This is what JSON Schema `format: uuid` means, so pinning a default version here would reject valid UUIDs.',
      'Malformed input still fails: a non-UUID string, the empty string, a hyphen-stripped UUID, and a non-string (123) are all rejected.',
    ],
    validate: () => createValidateFn<TF.UUID>(),
    standardSchema: () => createStandardSchema<TF.UUID>(),
    validateReflect: () => {
      const v: TF.UUID = V4;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.UUID>(),
    deserializeValidateReflect: () => {
      const v: TF.UUID = V7;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.UUID = V4;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.UUID>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.UUID = V4;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.UUID = V4;
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.UUID>>(),
    validateSchema: () => createValidateFn(TF.uuid()),
    getValidationErrors: () => createGetValidationErrorsFn<TF.UUID>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.UUID>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.uuid()),
    mockType: () => createMockDataFn<TF.UUID>(),
    getSamples: () => ({valid: [V4, V7, V1, NIL_UUID, MAX_UUID], invalid: ['not-a-uuid', '', V4.replace(/-/g, ''), 123]}),
    expectedFormatErrors: () => [{name: 'uuid', val: 'any'}, null, null, null],
  },
  uuidv4: {
    title: 'UUID v4',
    description: 'TF.UUIDv4 (format `uuid`, version `4`) accepting only version-4 UUIDs and rejecting v7 and malformed input.',
    validateNotes: [
      'Only a well-formed v4 UUID passes; the version nibble must be `4`.',
      'A v7 UUID fails with `val` `4`; a non-UUID string (`not-a-uuid`) also fails with `val` `4`.',
      'The empty string, a hyphen-stripped UUID, and a non-string (123) are all rejected.',
    ],
    validate: () => createValidateFn<TF.UUIDv4>(),
    standardSchema: () => createStandardSchema<TF.UUIDv4>(),
    validateReflect: () => {
      const v: TF.UUIDv4 = V4;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.UUIDv4>(),
    deserializeValidateReflect: () => {
      const v: TF.UUIDv4 = V4;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.UUIDv4 = V4;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.UUIDv4>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.UUIDv4 = V4;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.UUIDv4 = V4;
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.UUIDv4>>(),
    validateSchema: () => createValidateFn(TF.uuidv4()),
    getValidationErrors: () => createGetValidationErrorsFn<TF.UUIDv4>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.UUIDv4>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.uuidv4()),
    mockType: () => createMockDataFn<TF.UUIDv4>(),
    getSamples: () => ({valid: [V4], invalid: [V7, 'not-a-uuid', '', V4.replace(/-/g, ''), 123]}),
    expectedFormatErrors: () => [{name: 'uuid', val: '4'}, {name: 'uuid', val: '4'}, null, null, null],
  },
  uuidv7: {
    title: 'UUID v7',
    description: 'TF.UUIDv7 (format `uuid`, version `7`) accepting only version-7 UUIDs and rejecting v4.',
    validateNotes: [
      'The version nibble must be `7`; a valid v4 UUID fails with `val` `7`.',
      'Malformed input is also rejected: a wrong-length UUID, a non-hex character (`g`), a wrong-version-nibble form, the empty string, and a non-string (123) all fail.',
    ],
    validate: () => createValidateFn<TF.UUIDv7>(),
    standardSchema: () => createStandardSchema<TF.UUIDv7>(),
    validateReflect: () => {
      const v: TF.UUIDv7 = V7;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.UUIDv7>(),
    deserializeValidateReflect: () => {
      const v: TF.UUIDv7 = V7;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.UUIDv7 = V7;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.UUIDv7>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.UUIDv7 = V7;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.UUIDv7 = V7;
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.UUIDv7>>(),
    validateSchema: () => createValidateFn(TF.uuidv7()),
    getValidationErrors: () => createGetValidationErrorsFn<TF.UUIDv7>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.UUIDv7>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.uuidv7()),
    mockType: () => createMockDataFn<TF.UUIDv7>(),
    getSamples: () => ({
      valid: [V7],
      invalid: [V4, V7.slice(0, -1), V7.replace('1', 'g'), V7.replace('7b5c', 'cb5c'), '', 123],
    }),
    expectedFormatErrors: () => [{name: 'uuid', val: '7'}, null, null, null, null, null],
  },

  // ──────────────────────────── Credit card ───────────────────────
  creditCard: {
    title: 'Credit card (any network)',
    description:
      'TF.CreditCard (format `creditCard`, no networks) — 12 to 19 digits whose Luhn checksum holds, accepting every network.',
    validateNotes: [
      'Card numbers from different networks and of different lengths all pass: Visa (16), Amex (15), Diners (14).',
      'A single changed digit fails. That is the checksum earning its keep — the value is still 16 digits and still starts with a 4.',
      'Grouped input passes by default: spaces and dashes between digits are how a card number is written and typed.',
      'A separator only ever sits BETWEEN digits, so a leading or trailing one, or two in a row, is rejected. So is a separator the default does not name, such as a dot.',
      'Too short, non-digits, the empty string and a non-string (123) are all rejected.',
    ],
    validate: () => createValidateFn<TF.CreditCard>(),
    standardSchema: () => createStandardSchema<TF.CreditCard>(),
    validateReflect: () => {
      const v: TF.CreditCard = VISA;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.CreditCard>(),
    deserializeValidateReflect: () => {
      const v: TF.CreditCard = VISA;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.CreditCard = VISA;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.CreditCard>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.CreditCard = VISA;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.CreditCard = VISA;
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.CreditCard>>(),
    validateSchema: () => createValidateFn(TF.creditCard()),
    getValidationErrors: () => createGetValidationErrorsFn<TF.CreditCard>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.CreditCard>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.creditCard()),
    mockType: () => createMockDataFn<TF.CreditCard>(),
    getSamples: () => ({
      valid: [VISA, MASTERCARD, AMEX, '30569309025904', VISA_SPACED, VISA_DASHED],
      invalid: [
        VISA_TYPO,
        ' ' + VISA,
        VISA + '-',
        '4111  111111111111',
        '4111.1111.1111.1111',
        '41111111111',
        'not-a-card',
        '',
        123,
      ],
    }),
    expectedFormatErrors: () => [
      {name: 'creditCard', val: 'any'},
      {name: 'creditCard', val: 'any'},
      {name: 'creditCard', val: 'any'},
      {name: 'creditCard', val: 'any'},
      {name: 'creditCard', val: 'any'},
      {name: 'creditCard', val: 'any'},
      {name: 'creditCard', val: 'any'},
      {name: 'creditCard', val: 'any'},
      null,
    ],
  },
  creditCard_noSeparators: {
    title: 'Credit card, digits only',
    description:
      "TF.CreditCard<{separators: ''}> — the opt-out from the ' -' default, for a field that must hold digits and nothing else.",
    validateNotes: [
      'Bare card numbers still pass, unchanged.',
      'Grouped input now fails in both spellings: the empty separator set is the way to say digits and nothing else.',
      'The checksum is unaffected — a typo fails either way.',
    ],
    validate: () => createValidateFn<TF.CreditCard<{separators: ''}>>(),
    standardSchema: () => createStandardSchema<TF.CreditCard<{separators: ''}>>(),
    validateReflect: () => {
      const v: TF.CreditCard<{separators: ''}> = VISA;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.CreditCard<{separators: ''}>>(),
    deserializeValidateReflect: () => {
      const v: TF.CreditCard<{separators: ''}> = VISA;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.CreditCard<{separators: ''}> = VISA;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.CreditCard<{separators: ''}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.CreditCard<{separators: ''}> = VISA;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.CreditCard<{separators: ''}> = VISA;
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.CreditCard<{separators: ''}>>>(),
    validateSchema: () => createValidateFn(TF.creditCard({separators: ''})),
    getValidationErrors: () => createGetValidationErrorsFn<TF.CreditCard<{separators: ''}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.CreditCard<{separators: ''}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.creditCard({separators: ''})),
    mockType: () => createMockDataFn<TF.CreditCard<{separators: ''}>>(),
    getSamples: () => ({
      valid: [VISA, MASTERCARD, AMEX],
      invalid: [VISA_SPACED, VISA_DASHED, VISA_TYPO, '', 123],
    }),
    expectedFormatErrors: () => [
      {name: 'creditCard', val: 'any'},
      {name: 'creditCard', val: 'any'},
      {name: 'creditCard', val: 'any'},
      {name: 'creditCard', val: 'any'},
      null,
    ],
  },
  creditCard_dotSeparator: {
    title: 'Credit card with a custom separator',
    description: "TF.CreditCard<{separators: '.'}> — the separator set is configurable, not fixed to the default.",
    validateNotes: [
      'A dotted number passes and the bare number still does.',
      'A space or a dash now fails: the declared set replaces the default rather than adding to it.',
    ],
    validate: () => createValidateFn<TF.CreditCard<{separators: '.'}>>(),
    standardSchema: () => createStandardSchema<TF.CreditCard<{separators: '.'}>>(),
    validateReflect: () => {
      const v: TF.CreditCard<{separators: '.'}> = VISA;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.CreditCard<{separators: '.'}>>(),
    deserializeValidateReflect: () => {
      const v: TF.CreditCard<{separators: '.'}> = VISA;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.CreditCard<{separators: '.'}> = VISA;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.CreditCard<{separators: '.'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.CreditCard<{separators: '.'}> = VISA;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.CreditCard<{separators: '.'}> = VISA;
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.CreditCard<{separators: '.'}>>>(),
    validateSchema: () => createValidateFn(TF.creditCard({separators: '.'})),
    getValidationErrors: () => createGetValidationErrorsFn<TF.CreditCard<{separators: '.'}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.CreditCard<{separators: '.'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.creditCard({separators: '.'})),
    mockType: () => createMockDataFn<TF.CreditCard<{separators: '.'}>>(),
    getSamples: () => ({
      valid: ['4111.1111.1111.1111', VISA],
      invalid: [VISA_SPACED, VISA_DASHED, VISA_TYPO, '', 123],
    }),
    expectedFormatErrors: () => [
      {name: 'creditCard', val: 'any'},
      {name: 'creditCard', val: 'any'},
      {name: 'creditCard', val: 'any'},
      {name: 'creditCard', val: 'any'},
      null,
    ],
  },
  creditCard_network: {
    title: 'Credit card pinned to one network',
    description: "TF.CreditCard<{networks: ['visa']}> — the Luhn check plus Visa's own prefix and lengths.",
    validateNotes: [
      'Visa numbers pass at both lengths Visa issues (16 and 13).',
      'A Mastercard and an Amex number fail even though their own checksums are fine: the field takes Visa.',
      'The error carries the declared networks, so a consumer can say which ones were expected.',
    ],
    validate: () => createValidateFn<TF.CreditCard<{networks: ['visa']}>>(),
    standardSchema: () => createStandardSchema<TF.CreditCard<{networks: ['visa']}>>(),
    validateReflect: () => {
      const v: TF.CreditCard<{networks: ['visa']}> = VISA;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.CreditCard<{networks: ['visa']}>>(),
    deserializeValidateReflect: () => {
      const v: TF.CreditCard<{networks: ['visa']}> = VISA;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.CreditCard<{networks: ['visa']}> = VISA;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.CreditCard<{networks: ['visa']}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.CreditCard<{networks: ['visa']}> = VISA;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.CreditCard<{networks: ['visa']}> = VISA;
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.CreditCard<{networks: ['visa']}>>>(),
    validateSchema: () => createValidateFn(TF.creditCard({networks: ['visa']})),
    getValidationErrors: () => createGetValidationErrorsFn<TF.CreditCard<{networks: ['visa']}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.CreditCard<{networks: ['visa']}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.creditCard({networks: ['visa']})),
    mockType: () => createMockDataFn<TF.CreditCard<{networks: ['visa']}>>(),
    getSamples: () => ({
      valid: [VISA, '4012888888881881', '4222222222222'],
      invalid: [MASTERCARD, AMEX, VISA_TYPO, '', 123],
    }),
    expectedFormatErrors: () => [
      {name: 'creditCard', val: ['visa']},
      {name: 'creditCard', val: ['visa']},
      {name: 'creditCard', val: ['visa']},
      {name: 'creditCard', val: ['visa']},
      null,
    ],
  },
  creditCard_multiNetwork: {
    title: 'Credit card across several networks',
    description:
      "TF.CreditCard<{networks: ['visa', 'mastercard']}> — one field taking either network, which is why `networks` is a list.",
    validateNotes: [
      'Both Visa and Mastercard numbers pass, in either of the two Mastercard prefix ranges (5x and 2xxx).',
      'An Amex number fails: it is a valid card, just not one this field takes.',
    ],
    validate: () => createValidateFn<TF.CreditCard<{networks: ['visa', 'mastercard']}>>(),
    standardSchema: () => createStandardSchema<TF.CreditCard<{networks: ['visa', 'mastercard']}>>(),
    validateReflect: () => {
      const v: TF.CreditCard<{networks: ['visa', 'mastercard']}> = VISA;
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.CreditCard<{networks: ['visa', 'mastercard']}>>(),
    deserializeValidateReflect: () => {
      const v: TF.CreditCard<{networks: ['visa', 'mastercard']}> = MASTERCARD;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.CreditCard<{networks: ['visa', 'mastercard']}> = VISA;
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.CreditCard<{networks: ['visa', 'mastercard']}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.CreditCard<{networks: ['visa', 'mastercard']}> = VISA;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.CreditCard<{networks: ['visa', 'mastercard']}> = VISA;
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.CreditCard<{networks: ['visa', 'mastercard']}>>>(),
    validateSchema: () => createValidateFn(TF.creditCard({networks: ['visa', 'mastercard']})),
    getValidationErrors: () => createGetValidationErrorsFn<TF.CreditCard<{networks: ['visa', 'mastercard']}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.CreditCard<{networks: ['visa', 'mastercard']}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.creditCard({networks: ['visa', 'mastercard']})),
    mockType: () => createMockDataFn<TF.CreditCard<{networks: ['visa', 'mastercard']}>>(),
    getSamples: () => ({
      valid: [VISA, MASTERCARD, '2223003122003222'],
      invalid: [AMEX, '6011111111111117', '', 123],
    }),
    expectedFormatErrors: () => [
      {name: 'creditCard', val: ['visa', 'mastercard']},
      {name: 'creditCard', val: ['visa', 'mastercard']},
      {name: 'creditCard', val: ['visa', 'mastercard']},
      null,
    ],
  },

  // ────────────────────── Content keywords (JSON Schema) ──────────
  base64: {
    title: 'contentEncoding base64',
    description:
      'JSON Schema `contentEncoding: base64` — lowered to the anchored RFC 4648 pattern, so the check enforces the padded block shape exactly.',
    validateNotes: [
      'The empty string is valid base64 (zero blocks); bad padding (`QQ=`) and non-alphabet characters fail.',
      'The recovered type is a plain string format; the wire never changes.',
    ],
    validate: () => createValidateFn<Base64String>(),
    standardSchema: () => createStandardSchema<Base64String>(),
    validateReflect: () => {
      const v: Base64String = 'SGVsbG8=';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<Base64String>(),
    deserializeValidateReflect: () => {
      const v: Base64String = 'QQ==';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: Base64String = 'SGVsbG8=';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Base64String>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: Base64String = 'SGVsbG8=';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: Base64String = 'SGVsbG8=';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<Base64String>>(),
    validateSchema: () =>
      createValidateFn(
        TF.string({
          pattern: {
            source: '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$',
            flags: '',
            mockSamples: ['', 'QQ==', 'QUJD', 'SGVsbG8='],
          },
        })
      ),
    getValidationErrors: () => createGetValidationErrorsFn<Base64String>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<Base64String>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(
        TF.string({
          pattern: {
            source: '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$',
            flags: '',
            mockSamples: ['', 'QQ==', 'QUJD', 'SGVsbG8='],
          },
        })
      ),
    mockType: () => createMockDataFn<Base64String>(),
    getSamples: () => ({valid: ['', 'QQ==', 'QUJD', 'SGVsbG8='], invalid: ['QQ=', 'not base64!', 123]}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', formatPathTail: 'pattern'},
      {name: 'stringFormat', formatPathTail: 'pattern'},
      null,
    ],
  },
  base32: {
    title: 'contentEncoding base32',
    description: 'JSON Schema `contentEncoding: base32` — the anchored RFC 4648 base32 alphabet with exact `=` padding.',
    validateNotes: ['Lowercase letters are outside the base32 alphabet; padding must complete an 8-character block.'],
    validate: () => createValidateFn<Base32String>(),
    standardSchema: () => createStandardSchema<Base32String>(),
    validateReflect: () => {
      const v: Base32String = 'MZXQ====';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<Base32String>(),
    deserializeValidateReflect: () => {
      const v: Base32String = 'MY======';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: Base32String = 'MZXQ====';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Base32String>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: Base32String = 'MZXQ====';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: Base32String = 'MZXQ====';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<Base32String>>(),
    validateSchema: () =>
      createValidateFn(
        TF.string({
          pattern: {
            source: '^(?:[A-Z2-7]{8})*(?:[A-Z2-7]{2}={6}|[A-Z2-7]{4}={4}|[A-Z2-7]{5}={3}|[A-Z2-7]{7}=)?$',
            flags: '',
            mockSamples: ['', 'MY======', 'MZXQ===='],
          },
        })
      ),
    getValidationErrors: () => createGetValidationErrorsFn<Base32String>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<Base32String>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(
        TF.string({
          pattern: {
            source: '^(?:[A-Z2-7]{8})*(?:[A-Z2-7]{2}={6}|[A-Z2-7]{4}={4}|[A-Z2-7]{5}={3}|[A-Z2-7]{7}=)?$',
            flags: '',
            mockSamples: ['', 'MY======', 'MZXQ===='],
          },
        })
      ),
    mockType: () => createMockDataFn<Base32String>(),
    getSamples: () => ({valid: ['', 'MY======', 'MZXQ===='], invalid: ['MY=====', 'abc', 123]}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', formatPathTail: 'pattern'},
      {name: 'stringFormat', formatPathTail: 'pattern'},
      null,
    ],
  },
  base16: {
    title: 'contentEncoding base16',
    description: 'JSON Schema `contentEncoding: base16` — hex pairs, either case, no padding.',
    validateNotes: ['An odd number of hex digits fails (base16 encodes whole bytes).'],
    validate: () => createValidateFn<Base16String>(),
    standardSchema: () => createStandardSchema<Base16String>(),
    validateReflect: () => {
      const v: Base16String = 'DEADBEEF';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<Base16String>(),
    deserializeValidateReflect: () => {
      const v: Base16String = '48656C6C6F';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: Base16String = 'DEADBEEF';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Base16String>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: Base16String = 'DEADBEEF';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: Base16String = 'DEADBEEF';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<Base16String>>(),
    validateSchema: () =>
      createValidateFn(
        TF.string({pattern: {source: '^(?:[0-9A-Fa-f]{2})*$', flags: '', mockSamples: ['', '48656C6C6F', 'DEADBEEF']}})
      ),
    getValidationErrors: () => createGetValidationErrorsFn<Base16String>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<Base16String>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(
        TF.string({pattern: {source: '^(?:[0-9A-Fa-f]{2})*$', flags: '', mockSamples: ['', '48656C6C6F', 'DEADBEEF']}})
      ),
    mockType: () => createMockDataFn<Base16String>(),
    getSamples: () => ({valid: ['', 'deadbeef', 'DEADBEEF'], invalid: ['ABC', 'XY?!', 123]}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', formatPathTail: 'pattern'},
      {name: 'stringFormat', formatPathTail: 'pattern'},
      null,
    ],
  },
  json_content: {
    title: 'contentMediaType application/json',
    description:
      'JSON Schema `contentMediaType: application/json` — the string must parse as JSON; it is an ordinary string param, checked by the stringFormat emitter alongside minLength.',
    validateNotes: [
      'Any JSON document text passes (objects, arrays, numbers, booleans, null, quoted strings); the empty string and truncated JSON fail.',
    ],
    validate: () => createValidateFn<JsonString>(),
    standardSchema: () => createStandardSchema<JsonString>(),
    validateReflect: () => {
      const v: JsonString = '{}';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<JsonString>(),
    deserializeValidateReflect: () => {
      const v: JsonString = '[1,2]';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: JsonString = '{}';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<JsonString>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: JsonString = '{}';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: JsonString = '{}';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<JsonString>>(),
    validateSchema: 'not-supported',
    getValidationErrors: () => createGetValidationErrorsFn<JsonString>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<JsonString>>(),
    getValidationErrorsSchema: 'not-supported',
    mockType: () => createMockDataFn<JsonString>(),
    getSamples: () => ({valid: ['{}', '[1,2]', '"text"', '7', 'true', 'null'], invalid: ['not json', '{', '', 123]}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 'application/json', formatPathTail: 'contentMediaType'},
      {name: 'stringFormat', val: 'application/json', formatPathTail: 'contentMediaType'},
      {name: 'stringFormat', val: 'application/json', formatPathTail: 'contentMediaType'},
      null,
    ],
  },

  // ─────────────────────────────── Date ───────────────────────────
  date_iso: {
    title: 'String date ISO',
    description: 'TF.StringDate (format `date`) with the default ISO `YYYY-MM-DD` layout that enforces calendar validity.',
    validateNotes: [
      'Default layout is ISO `YYYY-MM-DD`; the format error `val` is `ISO`.',
      'Calendar validity is enforced: `2023-02-29` (not a leap year), `2024-13-01` (month 13), and `2024-04-31` (April has 30 days) all fail.',
      'Width is exact — `2024-1-1` (single-digit month/day) fails; `not-a-date` fails. `0001-01-01` is accepted.',
    ],
    validate: () => createValidateFn<TF.StringDate>(),
    standardSchema: () => createStandardSchema<TF.StringDate>(),
    validateReflect: () => {
      const v: TF.StringDate = '2024-02-29';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.StringDate>(),
    deserializeValidateReflect: () => {
      const v: TF.StringDate = '2024-02-29';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.StringDate = '2024-02-29';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.StringDate>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.StringDate = '2024-02-29';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.StringDate = '2024-02-29';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.StringDate>>(),
    validateSchema: () => createValidateFn(TF.stringDate()),
    getValidationErrors: () => createGetValidationErrorsFn<TF.StringDate>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.StringDate>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.stringDate()),
    mockType: () => createMockDataFn<TF.StringDate>(),
    getSamples: () => ({
      valid: ['2024-02-29', '2026-05-28', '0001-01-01'],
      invalid: ['2023-02-29', '2024-13-01', '2024-04-31', '2024-1-1', 'not-a-date'],
    }),
    expectedFormatErrors: () => [{name: 'date', val: 'ISO'}, null, null, null, null],
  },
  date_DMY: {
    title: 'String date DMY',
    description: 'TF.StringDate with the `DD-MM-YYYY` layout using day-first ordering plus calendar validity.',
    validateNotes: [
      'Layout is `DD-MM-YYYY` (format error `val` `DD-MM-YYYY`); `29-02-2024` passes. An ISO-ordered string (`2024-02-29`) fails the layout, and `31-04-2024` fails calendar validity (April has 30 days).',
    ],
    validate: () => createValidateFn<TF.StringDate<{format: 'DD-MM-YYYY'}>>(),
    standardSchema: () => createStandardSchema<TF.StringDate<{format: 'DD-MM-YYYY'}>>(),
    validateReflect: () => {
      const v: TF.StringDate<{format: 'DD-MM-YYYY'}> = '29-02-2024';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.StringDate<{format: 'DD-MM-YYYY'}>>(),
    deserializeValidateReflect: () => {
      const v: TF.StringDate<{format: 'DD-MM-YYYY'}> = '29-02-2024';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.StringDate<{format: 'DD-MM-YYYY'}> = '29-02-2024';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.StringDate<{format: 'DD-MM-YYYY'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.StringDate<{format: 'DD-MM-YYYY'}> = '29-02-2024';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.StringDate<{format: 'DD-MM-YYYY'}> = '29-02-2024';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.StringDate<{format: 'DD-MM-YYYY'}>>>(),
    validateSchema: () => createValidateFn(TF.stringDate({format: 'DD-MM-YYYY'})),
    getValidationErrors: () => createGetValidationErrorsFn<TF.StringDate<{format: 'DD-MM-YYYY'}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.StringDate<{format: 'DD-MM-YYYY'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.stringDate({format: 'DD-MM-YYYY'})),
    mockType: () => createMockDataFn<TF.StringDate<{format: 'DD-MM-YYYY'}>>(),
    getSamples: () => ({valid: ['29-02-2024'], invalid: ['2024-02-29', '31-04-2024']}),
    expectedFormatErrors: () => [
      {name: 'date', val: 'DD-MM-YYYY'},
      {name: 'date', val: 'DD-MM-YYYY'},
    ],
  },
  date_YM: {
    title: 'String date YM',
    description: 'TF.StringDate with the `YYYY-MM` layout (year-month, no day component).',
    validateNotes: [
      'Layout is `YYYY-MM` (format error `val` `YYYY-MM`); `2024-02` passes. Month 13 (`2024-13`) fails, and supplying a day (`2024-02-29`) fails the layout.',
    ],
    validate: () => createValidateFn<TF.StringDate<{format: 'YYYY-MM'}>>(),
    standardSchema: () => createStandardSchema<TF.StringDate<{format: 'YYYY-MM'}>>(),
    validateReflect: () => {
      const v: TF.StringDate<{format: 'YYYY-MM'}> = '2024-02';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.StringDate<{format: 'YYYY-MM'}>>(),
    deserializeValidateReflect: () => {
      const v: TF.StringDate<{format: 'YYYY-MM'}> = '2024-02';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.StringDate<{format: 'YYYY-MM'}> = '2024-02';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.StringDate<{format: 'YYYY-MM'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.StringDate<{format: 'YYYY-MM'}> = '2024-02';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.StringDate<{format: 'YYYY-MM'}> = '2024-02';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.StringDate<{format: 'YYYY-MM'}>>>(),
    validateSchema: () => createValidateFn(TF.stringDate({format: 'YYYY-MM'})),
    getValidationErrors: () => createGetValidationErrorsFn<TF.StringDate<{format: 'YYYY-MM'}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.StringDate<{format: 'YYYY-MM'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.stringDate({format: 'YYYY-MM'})),
    mockType: () => createMockDataFn<TF.StringDate<{format: 'YYYY-MM'}>>(),
    getSamples: () => ({valid: ['2024-02'], invalid: ['2024-13', '2024-02-29']}),
    expectedFormatErrors: () => [
      {name: 'date', val: 'YYYY-MM'},
      {name: 'date', val: 'YYYY-MM'},
    ],
  },
  date_MD: {
    title: 'String date MD',
    description: 'TF.StringDate with the `MM-DD` layout (month-day, no year component).',
    validateNotes: [
      'Layout is `MM-DD` (format error `val` `MM-DD`); `02-29` passes. Month 13 (`13-01`) fails, as does a day-overflow (`02-30`, February has no 30th).',
    ],
    validate: () => createValidateFn<TF.StringDate<{format: 'MM-DD'}>>(),
    standardSchema: () => createStandardSchema<TF.StringDate<{format: 'MM-DD'}>>(),
    validateReflect: () => {
      const v: TF.StringDate<{format: 'MM-DD'}> = '02-29';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.StringDate<{format: 'MM-DD'}>>(),
    deserializeValidateReflect: () => {
      const v: TF.StringDate<{format: 'MM-DD'}> = '02-29';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.StringDate<{format: 'MM-DD'}> = '02-29';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.StringDate<{format: 'MM-DD'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.StringDate<{format: 'MM-DD'}> = '02-29';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.StringDate<{format: 'MM-DD'}> = '02-29';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.StringDate<{format: 'MM-DD'}>>>(),
    validateSchema: () => createValidateFn(TF.stringDate({format: 'MM-DD'})),
    getValidationErrors: () => createGetValidationErrorsFn<TF.StringDate<{format: 'MM-DD'}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.StringDate<{format: 'MM-DD'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.stringDate({format: 'MM-DD'})),
    mockType: () => createMockDataFn<TF.StringDate<{format: 'MM-DD'}>>(),
    getSamples: () => ({valid: ['02-29'], invalid: ['13-01', '02-30']}),
    expectedFormatErrors: () => [
      {name: 'date', val: 'MM-DD'},
      {name: 'date', val: 'MM-DD'},
    ],
  },
  date_minMax_absolute: {
    title: 'String date min/max',
    description: 'TF.StringDate with inclusive absolute `min`/`max` date bounds, accepting dates within [`min`, `max`].',
    validateNotes: [
      'Bounds `2020-01-01`..`2020-12-31` are inclusive — both endpoints pass. `2019-12-31` fails on `min` (formatPathTail `min`); `2021-01-01` fails on `max` (formatPathTail `max`).',
    ],
    validate: () => createValidateFn<TF.StringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>(),
    standardSchema: () => createStandardSchema<TF.StringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>(),
    validateReflect: () => {
      const v: TF.StringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}> = '2020-01-01';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.StringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>(),
    deserializeValidateReflect: () => {
      const v: TF.StringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}> = '2020-01-01';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.StringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}> = '2020-01-01';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<TF.StringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.StringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}> = '2020-01-01';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.StringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}> = '2020-01-01';
      return createMockDataFn(v);
    },
    validateDataOnly: () =>
      createValidateFn<DataOnly<TF.StringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>>(),
    validateSchema: () => createValidateFn(TF.stringDate({format: 'YYYY-MM-DD', min: '2020-01-01', max: '2020-12-31'})),
    getValidationErrors: () =>
      createGetValidationErrorsFn<TF.StringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrorsFn<DataOnly<TF.StringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(TF.stringDate({format: 'YYYY-MM-DD', min: '2020-01-01', max: '2020-12-31'})),
    // mockType must respect the bounds — assertMockType re-validates every
    // generated value through validate, so an out-of-range mock would fail.
    mockType: () => createMockDataFn<TF.StringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>(),
    getSamples: () => ({
      valid: ['2020-01-01', '2020-06-15', '2020-12-31'],
      invalid: ['2019-12-31', '2021-01-01'],
    }),
    expectedFormatErrors: () => [
      {name: 'date', formatPathTail: 'min'},
      {name: 'date', formatPathTail: 'max'},
    ],
  },

  // ─────────────────────────────── Time ───────────────────────────
  time_iso: {
    title: 'String time ISO',
    description:
      'TF.StringTime (format `time`) with the default tz-aware ISO layout that requires a timezone and valid time fields.',
    validateNotes: [
      'Default ISO layout (format error `val` `ISO`) requires a tz suffix; `12:30:45Z`, `12:30:45.123Z` (ms), and offset forms like `+05:30` / `-08:00` pass.',
      'A tz-less time (`12:30:45`) fails. Field ranges are enforced: hour 24 (`24:00:00Z`) and minute 60 (`12:60:00Z`) both fail.',
    ],
    validate: () => createValidateFn<TF.StringTime>(),
    standardSchema: () => createStandardSchema<TF.StringTime>(),
    validateReflect: () => {
      const v: TF.StringTime = '12:30:45Z';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.StringTime>(),
    deserializeValidateReflect: () => {
      const v: TF.StringTime = '12:30:45Z';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.StringTime = '12:30:45Z';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.StringTime>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.StringTime = '12:30:45Z';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.StringTime = '12:30:45Z';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.StringTime>>(),
    validateSchema: () => createValidateFn(TF.stringTime()),
    getValidationErrors: () => createGetValidationErrorsFn<TF.StringTime>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.StringTime>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.stringTime()),
    mockType: () => createMockDataFn<TF.StringTime>(),
    getSamples: () => ({
      valid: ['12:30:45Z', '12:30:45.123Z', '12:30:45+05:30', '00:00:00-08:00'],
      invalid: ['12:30:45', '24:00:00Z', '12:60:00Z'],
    }),
    expectedFormatErrors: () => [
      {name: 'time', val: 'ISO'},
      {name: 'time', val: 'ISO'},
      {name: 'time', val: 'ISO'},
    ],
  },
  time_HHmmss: {
    title: 'String time HHmmss',
    description: 'TF.StringTime with the fixed `HH:mm:ss` layout (no tz, no milliseconds).',
    validateNotes: [
      '`23:59:59` passes. Out-of-range fields (`99:99:99`) fail with `val` `HH:mm:ss`; a missing seconds component (`23:59`) and hour 24 (`24:00:00`) are also rejected.',
    ],
    validate: () => createValidateFn<TF.StringTime<{format: 'HH:mm:ss'}>>(),
    standardSchema: () => createStandardSchema<TF.StringTime<{format: 'HH:mm:ss'}>>(),
    validateReflect: () => {
      const v: TF.StringTime<{format: 'HH:mm:ss'}> = '23:59:59';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.StringTime<{format: 'HH:mm:ss'}>>(),
    deserializeValidateReflect: () => {
      const v: TF.StringTime<{format: 'HH:mm:ss'}> = '23:59:59';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.StringTime<{format: 'HH:mm:ss'}> = '23:59:59';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.StringTime<{format: 'HH:mm:ss'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.StringTime<{format: 'HH:mm:ss'}> = '23:59:59';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.StringTime<{format: 'HH:mm:ss'}> = '23:59:59';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.StringTime<{format: 'HH:mm:ss'}>>>(),
    validateSchema: () => createValidateFn(TF.stringTime({format: 'HH:mm:ss'})),
    getValidationErrors: () => createGetValidationErrorsFn<TF.StringTime<{format: 'HH:mm:ss'}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.StringTime<{format: 'HH:mm:ss'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.stringTime({format: 'HH:mm:ss'})),
    mockType: () => createMockDataFn<TF.StringTime<{format: 'HH:mm:ss'}>>(),
    getSamples: () => ({valid: ['23:59:59'], invalid: ['99:99:99', '23:59', '24:00:00']}),
    expectedFormatErrors: () => [{name: 'time', val: 'HH:mm:ss'}, null, null],
  },
  time_HHmmss_ms: {
    title: 'String time with ms',
    description: 'TF.StringTime with the `HH:mm:ss[.mmm]` layout where milliseconds are optional and capped at 3 digits.',
    validateNotes: [
      'Milliseconds are optional — both `12:30:45` and `12:30:45.999` pass. A 4-digit fraction (`12:30:45.9999`) exceeds the `.mmm` width and fails with `val` `HH:mm:ss[.mmm]`.',
    ],
    validate: () => createValidateFn<TF.StringTime<{format: 'HH:mm:ss[.mmm]'}>>(),
    standardSchema: () => createStandardSchema<TF.StringTime<{format: 'HH:mm:ss[.mmm]'}>>(),
    validateReflect: () => {
      const v: TF.StringTime<{format: 'HH:mm:ss[.mmm]'}> = '12:30:45';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.StringTime<{format: 'HH:mm:ss[.mmm]'}>>(),
    deserializeValidateReflect: () => {
      const v: TF.StringTime<{format: 'HH:mm:ss[.mmm]'}> = '12:30:45';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.StringTime<{format: 'HH:mm:ss[.mmm]'}> = '12:30:45';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.StringTime<{format: 'HH:mm:ss[.mmm]'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.StringTime<{format: 'HH:mm:ss[.mmm]'}> = '12:30:45';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.StringTime<{format: 'HH:mm:ss[.mmm]'}> = '12:30:45';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.StringTime<{format: 'HH:mm:ss[.mmm]'}>>>(),
    validateSchema: () => createValidateFn(TF.stringTime({format: 'HH:mm:ss[.mmm]'})),
    getValidationErrors: () => createGetValidationErrorsFn<TF.StringTime<{format: 'HH:mm:ss[.mmm]'}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.StringTime<{format: 'HH:mm:ss[.mmm]'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.stringTime({format: 'HH:mm:ss[.mmm]'})),
    mockType: () => createMockDataFn<TF.StringTime<{format: 'HH:mm:ss[.mmm]'}>>(),
    getSamples: () => ({valid: ['12:30:45', '12:30:45.999'], invalid: ['12:30:45.9999']}),
    expectedFormatErrors: () => [{name: 'time', val: 'HH:mm:ss[.mmm]'}],
  },
  time_minMax_absolute: {
    title: 'String time min/max',
    description:
      'TF.StringTime with inclusive absolute `min`/`max` time bounds (HH:mm, business hours), accepting times within [`min`, `max`].',
    validateNotes: [
      'Bounds `09:00`..`17:00` are inclusive — both endpoints pass. `08:59` fails on `min` (formatPathTail `min`); `17:01` fails on `max` (formatPathTail `max`).',
    ],
    validate: () => createValidateFn<TF.StringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>(),
    standardSchema: () => createStandardSchema<TF.StringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>(),
    validateReflect: () => {
      const v: TF.StringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}> = '09:00';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.StringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>(),
    deserializeValidateReflect: () => {
      const v: TF.StringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}> = '09:00';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.StringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}> = '09:00';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<TF.StringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.StringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}> = '09:00';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.StringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}> = '09:00';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.StringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>>(),
    validateSchema: () => createValidateFn(TF.stringTime({format: 'HH:mm', min: '09:00', max: '17:00'})),
    getValidationErrors: () => createGetValidationErrorsFn<TF.StringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrorsFn<DataOnly<TF.StringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.stringTime({format: 'HH:mm', min: '09:00', max: '17:00'})),
    mockType: () => createMockDataFn<TF.StringTime<{format: 'HH:mm'; min: '09:00'; max: '17:00'}>>(),
    getSamples: () => ({
      valid: ['09:00', '12:30', '17:00'],
      invalid: ['08:59', '17:01'],
    }),
    expectedFormatErrors: () => [
      {name: 'time', formatPathTail: 'min'},
      {name: 'time', formatPathTail: 'max'},
    ],
  },

  // ───────────────────────────── DateTime ─────────────────────────
  dateTime_default: {
    title: 'String dateTime default',
    description:
      'TF.StringDateTime (format `dateTime`) with the default ISO layout: ISO date, `T` split char, ISO tz-aware time.',
    validateNotes: [
      'Both halves must be individually valid and joined by `T`; `2024-02-29T12:30:45Z` passes.',
      'A space separator (`2024-02-29 12:30:45Z`) fails on the split char (formatPathTail `splitChar`).',
      'A non-leap date (`2023-02-29`), an out-of-range hour (`25:30:45`), and `not-a-datetime` are all rejected.',
    ],
    validate: () => createValidateFn<TF.StringDateTime>(),
    standardSchema: () => createStandardSchema<TF.StringDateTime>(),
    validateReflect: () => {
      const v: TF.StringDateTime = '2024-02-29T12:30:45Z';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.StringDateTime>(),
    deserializeValidateReflect: () => {
      const v: TF.StringDateTime = '2024-02-29T12:30:45Z';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.StringDateTime = '2024-02-29T12:30:45Z';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.StringDateTime>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.StringDateTime = '2024-02-29T12:30:45Z';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.StringDateTime = '2024-02-29T12:30:45Z';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.StringDateTime>>(),
    validateSchema: () => createValidateFn(TF.stringDateTime()),
    getValidationErrors: () => createGetValidationErrorsFn<TF.StringDateTime>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.StringDateTime>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.stringDateTime()),
    mockType: () => createMockDataFn<TF.StringDateTime>(),
    getSamples: () => ({
      valid: ['2024-02-29T12:30:45Z', '2026-05-28T00:00:00.500+02:00'],
      invalid: ['2024-02-29 12:30:45Z', '2023-02-29T12:30:45Z', '2024-02-29T25:30:45Z', 'not-a-datetime'],
    }),
    expectedFormatErrors: () => [{name: 'dateTime', formatPathTail: 'splitChar'}, null, null, null],
  },
  dateTime_custom: {
    title: 'String dateTime custom',
    description:
      'TF.StringDateTime with custom nested `date`/`time` layouts and a space `splitChar`, each part validated independently.',
    validateNotes: [
      'Layout is `DD-MM-YYYY` date + `HH:mm` time joined by a space; `29-02-2024 23:59` passes.',
      'An ISO-ordered date (`2024-02-29 23:59`) fails on the date half (formatPathTail `date`).',
      'A `T` separator (`29-02-2024T23:59`) fails the split char (formatPathTail `splitChar`); hour 24 (`29-02-2024 24:00`) fails the time half (formatPathTail `time`).',
    ],
    validate: () =>
      createValidateFn<TF.StringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>>(),
    standardSchema: () =>
      createStandardSchema<TF.StringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>>(),
    validateReflect: () => {
      const v: TF.StringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}> = '29-02-2024 23:59';
      return createValidateFn(v);
    },
    deserializeValidate: () =>
      deserializeValidate<TF.StringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>>(),
    deserializeValidateReflect: () => {
      const v: TF.StringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}> = '29-02-2024 23:59';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.StringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}> = '29-02-2024 23:59';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<
        TF.StringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>
      >(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.StringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}> = '29-02-2024 23:59';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.StringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}> = '29-02-2024 23:59';
      return createMockDataFn(v);
    },
    validateDataOnly: () =>
      createValidateFn<DataOnly<TF.StringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>>>(),
    validateSchema: () =>
      createValidateFn(TF.stringDateTime({date: {format: 'DD-MM-YYYY'}, time: {format: 'HH:mm'}, splitChar: ' '})),
    getValidationErrors: () =>
      createGetValidationErrorsFn<TF.StringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrorsFn<
        DataOnly<TF.StringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>>
      >(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(TF.stringDateTime({date: {format: 'DD-MM-YYYY'}, time: {format: 'HH:mm'}, splitChar: ' '})),
    mockType: () =>
      createMockDataFn<TF.StringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>>(),
    getSamples: () => ({
      valid: ['29-02-2024 23:59'],
      invalid: ['2024-02-29 23:59', '29-02-2024T23:59', '29-02-2024 24:00'],
    }),
    expectedFormatErrors: () => [
      {name: 'dateTime', formatPathTail: 'date'},
      {name: 'dateTime', formatPathTail: 'splitChar'},
      {name: 'dateTime', formatPathTail: 'time'},
    ],
  },
  dateTime_minMax_absolute: {
    title: 'String dateTime min/max',
    description: 'TF.StringDateTime with inclusive absolute `min`/`max` datetime bounds, accepting values within [`min`, `max`].',
    validateNotes: [
      'Bounds `2020-01-01T00:00:00`..`2020-12-31T23:59:59` are inclusive — both endpoints pass. `2019-12-31T23:59:59` fails on `min` (formatPathTail `min`); `2021-01-01T00:00:00` fails on `max` (formatPathTail `max`).',
    ],
    validate: () =>
      createValidateFn<
        TF.StringDateTime<{
          date: {format: 'YYYY-MM-DD'};
          time: {format: 'HH:mm:ss'};
          splitChar: 'T';
          min: '2020-01-01T00:00:00';
          max: '2020-12-31T23:59:59';
        }>
      >(),
    standardSchema: () =>
      createStandardSchema<
        TF.StringDateTime<{
          date: {format: 'YYYY-MM-DD'};
          time: {format: 'HH:mm:ss'};
          splitChar: 'T';
          min: '2020-01-01T00:00:00';
          max: '2020-12-31T23:59:59';
        }>
      >(),
    validateReflect: () => {
      const v: TF.StringDateTime<{
        date: {format: 'YYYY-MM-DD'};
        time: {format: 'HH:mm:ss'};
        splitChar: 'T';
        min: '2020-01-01T00:00:00';
        max: '2020-12-31T23:59:59';
      }> = '';
      return createValidateFn(v);
    },
    deserializeValidate: () =>
      deserializeValidate<
        TF.StringDateTime<{
          date: {format: 'YYYY-MM-DD'};
          time: {format: 'HH:mm:ss'};
          splitChar: 'T';
          min: '2020-01-01T00:00:00';
          max: '2020-12-31T23:59:59';
        }>
      >(),
    deserializeValidateReflect: () => {
      const v: TF.StringDateTime<{
        date: {format: 'YYYY-MM-DD'};
        time: {format: 'HH:mm:ss'};
        splitChar: 'T';
        min: '2020-01-01T00:00:00';
        max: '2020-12-31T23:59:59';
      }> = '';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.StringDateTime<{
        date: {format: 'YYYY-MM-DD'};
        time: {format: 'HH:mm:ss'};
        splitChar: 'T';
        min: '2020-01-01T00:00:00';
        max: '2020-12-31T23:59:59';
      }> = '2020-01-01T00:00:00';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<
        TF.StringDateTime<{
          date: {format: 'YYYY-MM-DD'};
          time: {format: 'HH:mm:ss'};
          splitChar: 'T';
          min: '2020-01-01T00:00:00';
          max: '2020-12-31T23:59:59';
        }>
      >(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.StringDateTime<{
        date: {format: 'YYYY-MM-DD'};
        time: {format: 'HH:mm:ss'};
        splitChar: 'T';
        min: '2020-01-01T00:00:00';
        max: '2020-12-31T23:59:59';
      }> = '2020-01-01T00:00:00';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.StringDateTime<{
        date: {format: 'YYYY-MM-DD'};
        time: {format: 'HH:mm:ss'};
        splitChar: 'T';
        min: '2020-01-01T00:00:00';
        max: '2020-12-31T23:59:59';
      }> = '';
      return createMockDataFn(v);
    },
    validateDataOnly: () =>
      createValidateFn<
        DataOnly<
          TF.StringDateTime<{
            date: {format: 'YYYY-MM-DD'};
            time: {format: 'HH:mm:ss'};
            splitChar: 'T';
            min: '2020-01-01T00:00:00';
            max: '2020-12-31T23:59:59';
          }>
        >
      >(),
    validateSchema: () =>
      createValidateFn(
        TF.stringDateTime({
          date: {format: 'YYYY-MM-DD'},
          time: {format: 'HH:mm:ss'},
          splitChar: 'T',
          min: '2020-01-01T00:00:00',
          max: '2020-12-31T23:59:59',
        })
      ),
    getValidationErrors: () =>
      createGetValidationErrorsFn<
        TF.StringDateTime<{
          date: {format: 'YYYY-MM-DD'};
          time: {format: 'HH:mm:ss'};
          splitChar: 'T';
          min: '2020-01-01T00:00:00';
          max: '2020-12-31T23:59:59';
        }>
      >(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrorsFn<
        DataOnly<
          TF.StringDateTime<{
            date: {format: 'YYYY-MM-DD'};
            time: {format: 'HH:mm:ss'};
            splitChar: 'T';
            min: '2020-01-01T00:00:00';
            max: '2020-12-31T23:59:59';
          }>
        >
      >(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(
        TF.stringDateTime({
          date: {format: 'YYYY-MM-DD'},
          time: {format: 'HH:mm:ss'},
          splitChar: 'T',
          min: '2020-01-01T00:00:00',
          max: '2020-12-31T23:59:59',
        })
      ),
    mockType: () =>
      createMockDataFn<
        TF.StringDateTime<{
          date: {format: 'YYYY-MM-DD'};
          time: {format: 'HH:mm:ss'};
          splitChar: 'T';
          min: '2020-01-01T00:00:00';
          max: '2020-12-31T23:59:59';
        }>
      >(),
    getSamples: () => ({
      valid: ['2020-01-01T00:00:00', '2020-06-15T12:00:00'],
      invalid: ['2019-12-31T23:59:59', '2021-01-01T00:00:00'],
    }),
    expectedFormatErrors: () => [
      {name: 'dateTime', formatPathTail: 'min'},
      {name: 'dateTime', formatPathTail: 'max'},
    ],
  },

  // ──────────────────────────────── IP ────────────────────────────
  ipv4: {
    title: 'IPv4',
    description: 'TF.IPv4 (format `ip`, version 4) accepting dotted-quad IPv4 addresses only.',
    validateNotes: [
      'Each octet must be 0–255 in plain decimal; `192.168.0.1`, `0.0.0.0`, and `255.255.255.255` pass.',
      'Out-of-range octets (`999.999.999.999`, `256.0.0.1`), a 3-octet address (`1.2.3`), an IPv6 address (`::1`), hex/empty octets (`0x7f.0.0.1`, `192.168..1`) and trailing whitespace all fail; the first failure carries `val` 4.',
      'The hostname `localhost` is NOT an address, so it fails here; `TF.IPv4<{allowLocalHost: true}>` opts back into it.',
    ],
    validate: () => createValidateFn<TF.IPv4>(),
    standardSchema: () => createStandardSchema<TF.IPv4>(),
    validateReflect: () => {
      const v: TF.IPv4 = '192.168.0.1';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.IPv4>(),
    deserializeValidateReflect: () => {
      const v: TF.IPv4 = '192.168.0.1';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.IPv4 = '192.168.0.1';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.IPv4>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.IPv4 = '192.168.0.1';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.IPv4 = '192.168.0.1';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.IPv4>>(),
    validateSchema: () => createValidateFn(TF.ipv4()),
    getValidationErrors: () => createGetValidationErrorsFn<TF.IPv4>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.IPv4>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.ipv4()),
    mockType: () => createMockDataFn<TF.IPv4>(),
    getSamples: () => ({
      valid: ['192.168.0.1', '0.0.0.0', '255.255.255.255'],
      invalid: ['999.999.999.999', '256.0.0.1', '1.2.3', '::1', 'localhost', '0x7f.0.0.1', '192.168..1', '192.168.0.1 '],
    }),
    expectedFormatErrors: () => [{name: 'ip', val: 4}, null, null, null, null, null, null, null],
  },
  ipv4_localhost: {
    title: 'IPv4 with localhost',
    description:
      'TF.IPv4<{allowLocalHost: true}> (format `ip`, version 4) opting back into the hostname `localhost` beside the dotted quad.',
    validateNotes: [
      'The opt-in widens the format by exactly one spelling: `localhost` passes here and fails under the default `TF.IPv4`.',
      'It widens nothing else — a malformed address (`256.0.0.1`) and a near-miss hostname (`localhost.localdomain`) still fail with `val` 4.',
    ],
    validate: () => createValidateFn<TF.IPv4<{allowLocalHost: true}>>(),
    standardSchema: () => createStandardSchema<TF.IPv4<{allowLocalHost: true}>>(),
    validateReflect: () => {
      const v: TF.IPv4<{allowLocalHost: true}> = 'localhost';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.IPv4<{allowLocalHost: true}>>(),
    deserializeValidateReflect: () => {
      const v: TF.IPv4<{allowLocalHost: true}> = 'localhost';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.IPv4<{allowLocalHost: true}> = 'localhost';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.IPv4<{allowLocalHost: true}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.IPv4<{allowLocalHost: true}> = 'localhost';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.IPv4<{allowLocalHost: true}> = 'localhost';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.IPv4<{allowLocalHost: true}>>>(),
    validateSchema: () => createValidateFn(TF.ipv4({allowLocalHost: true})),
    getValidationErrors: () => createGetValidationErrorsFn<TF.IPv4<{allowLocalHost: true}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.IPv4<{allowLocalHost: true}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.ipv4({allowLocalHost: true})),
    mockType: () => createMockDataFn<TF.IPv4<{allowLocalHost: true}>>(),
    getSamples: () => ({
      valid: ['localhost', '192.168.0.1', '127.0.0.1'],
      invalid: ['256.0.0.1', 'localhost.localdomain', '::1'],
    }),
    expectedFormatErrors: () => [{name: 'ip', val: 4}, null, null],
  },
  ipv6: {
    title: 'IPv6',
    description:
      'TF.IPv6 (format `ip`, version 6) accepting colon-separated IPv6 addresses including `::` compression and loopback.',
    validateNotes:
      'Full, compressed (`::1`), and link-local (`fe80::1`) forms pass. An IPv4 address (`192.168.0.1`) and a group exceeding 4 hex digits (`12345::1`) each fail with `val` 6.',
    validate: () => createValidateFn<TF.IPv6>(),
    standardSchema: () => createStandardSchema<TF.IPv6>(),
    validateReflect: () => {
      const v: TF.IPv6 = '2001:db8:0:0:0:0:0:1';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.IPv6>(),
    deserializeValidateReflect: () => {
      const v: TF.IPv6 = '2001:db8:0:0:0:0:0:1';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.IPv6 = '2001:db8:0:0:0:0:0:1';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.IPv6>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.IPv6 = '2001:db8:0:0:0:0:0:1';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.IPv6 = '2001:db8:0:0:0:0:0:1';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.IPv6>>(),
    validateSchema: () => createValidateFn(TF.ipv6()),
    getValidationErrors: () => createGetValidationErrorsFn<TF.IPv6>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.IPv6>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.ipv6()),
    mockType: () => createMockDataFn<TF.IPv6>(),
    getSamples: () => ({valid: ['2001:db8:0:0:0:0:0:1', '::1', 'fe80::1'], invalid: ['192.168.0.1', '12345::1']}),
    expectedFormatErrors: () => [
      {name: 'ip', val: 6},
      {name: 'ip', val: 6},
    ],
  },
  ip_any: {
    title: 'IP any',
    description: 'TF.IP (format `ip`, version `any`) accepting either an IPv4 or an IPv6 address.',
    validateNotes: [
      'Both `10.0.0.1` (v4) and `2001:db8::1` (v6) pass. A non-IP string (`definitely not an ip`) fails with `val` `any`.',
    ],
    validate: () => createValidateFn<TF.IP>(),
    standardSchema: () => createStandardSchema<TF.IP>(),
    validateReflect: () => {
      const v: TF.IP = '10.0.0.1';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.IP>(),
    deserializeValidateReflect: () => {
      const v: TF.IP = '10.0.0.1';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.IP = '10.0.0.1';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.IP>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.IP = '10.0.0.1';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.IP = '10.0.0.1';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.IP>>(),
    validateSchema: () => createValidateFn(TF.ip()),
    getValidationErrors: () => createGetValidationErrorsFn<TF.IP>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.IP>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.ip()),
    mockType: () => createMockDataFn<TF.IP>(),
    getSamples: () => ({valid: ['10.0.0.1', '2001:db8::1'], invalid: ['definitely not an ip']}),
    expectedFormatErrors: () => [{name: 'ip', val: 'any'}],
  },
  ipv4_port: {
    title: 'IPv4 with port',
    description: 'TF.IPv4WithPort (format `ip`, version 4, port allowed) accepting `ipv4:port`.',
    validateNotes: [
      'The port must be in range; `192.168.0.1:8080` passes, while `192.168.0.1:70000` (port > 65535) fails with `val` 4.',
    ],
    validate: () => createValidateFn<TF.IPv4WithPort>(),
    standardSchema: () => createStandardSchema<TF.IPv4WithPort>(),
    validateReflect: () => {
      const v: TF.IPv4WithPort = '192.168.0.1:8080';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.IPv4WithPort>(),
    deserializeValidateReflect: () => {
      const v: TF.IPv4WithPort = '192.168.0.1:8080';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.IPv4WithPort = '192.168.0.1:8080';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.IPv4WithPort>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.IPv4WithPort = '192.168.0.1:8080';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.IPv4WithPort = '192.168.0.1:8080';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.IPv4WithPort>>(),
    validateSchema: () => createValidateFn(TF.ipv4WithPort()),
    getValidationErrors: () => createGetValidationErrorsFn<TF.IPv4WithPort>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.IPv4WithPort>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.ipv4WithPort()),
    mockType: () => createMockDataFn<TF.IPv4WithPort>(),
    getSamples: () => ({valid: ['192.168.0.1:8080'], invalid: ['192.168.0.1:70000']}),
    expectedFormatErrors: () => [{name: 'ip', val: 4}],
  },
  ipv6_port: {
    title: 'IPv6 with port',
    description: 'TF.IPv6WithPort (format `ip`, version 6, port allowed) accepting bracketed `[ipv6]:port`.',
    validateNotes: [
      'The port must be in range; `[2001:db8::1]:443` passes, while `[2001:db8::1]:99999` (port > 65535) fails with `val` 6.',
    ],
    validate: () => createValidateFn<TF.IPv6WithPort>(),
    standardSchema: () => createStandardSchema<TF.IPv6WithPort>(),
    validateReflect: () => {
      const v: TF.IPv6WithPort = '[2001:db8::1]:443';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.IPv6WithPort>(),
    deserializeValidateReflect: () => {
      const v: TF.IPv6WithPort = '[2001:db8::1]:443';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.IPv6WithPort = '[2001:db8::1]:443';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.IPv6WithPort>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.IPv6WithPort = '[2001:db8::1]:443';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.IPv6WithPort = '[2001:db8::1]:443';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.IPv6WithPort>>(),
    validateSchema: () => createValidateFn(TF.ipv6WithPort()),
    getValidationErrors: () => createGetValidationErrorsFn<TF.IPv6WithPort>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.IPv6WithPort>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.ipv6WithPort()),
    mockType: () => createMockDataFn<TF.IPv6WithPort>(),
    getSamples: () => ({valid: ['[2001:db8::1]:443'], invalid: ['[2001:db8::1]:99999']}),
    expectedFormatErrors: () => [{name: 'ip', val: 6}],
  },

  // ────────────────────────────── Domain ──────────────────────────
  domain: {
    title: 'Domain',
    description: 'TF.Domain (format `domain`) enforcing the baked domain pattern plus `minLength` 5 / `maxLength` 253.',
    validateNotes: [
      'Multi-label hostnames pass (`mion.io`, `example.com`, `sub.example.co.uk`, `a-b.example.org`).',
      'Rejected: a bare label (`not-a-domain`), a leading dot (`.com`), a single-char TLD (`example.c`), a leading-hyphen label (`-bad.com`), an embedded space (`exa mple.com`), and the empty string. The format error is `{name: domain}` (no `val`).',
    ],
    validate: () => createValidateFn<TF.Domain>(),
    standardSchema: () => createStandardSchema<TF.Domain>(),
    validateReflect: () => {
      const v: TF.Domain = 'mion.io';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.Domain>(),
    deserializeValidateReflect: () => {
      const v: TF.Domain = 'mion.io';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.Domain = 'mion.io';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.Domain>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.Domain = 'mion.io';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.Domain = 'mion.io';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.Domain>>(),
    validateSchema: () => createValidateFn(TF.domain()),
    // `format: 'hostname'` now lowers to TF.Hostname (a single label is a valid
    // host name), not TF.Domain — so this brand has no schema spelling of its own.
    getValidationErrors: () => createGetValidationErrorsFn<TF.Domain>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.Domain>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.domain()),
    mockType: () => createMockDataFn<TF.Domain>(),
    getSamples: () => ({
      valid: ['mion.io', 'example.com', 'sub.example.co.uk', 'a-b.example.org'],
      invalid: ['not-a-domain', '.com', 'example.c', '-bad.com', 'exa mple.com', ''],
    }),
    expectedFormatErrors: () => [{name: 'domain'}, null, null, null, null, null],
  },
  domainStrict: {
    title: 'Domain strict',
    description:
      'TF.DomainStrict (format `domain`) stricter than TF.Domain with ≤6 labels, ≥2 parts, strict name/TLD patterns, and hyphen-edge rejection.',
    validateNotes: [
      'Up to 6 labels pass (`mion.io`, `sub.example.com`, `aa.bb.cc.dd.ee.com`).',
      'Rejected: a leading-hyphen label (`-bad.com`), more than 6 labels (`aa.bb.cc.dd.ee.ff.com`), a numeric TLD (`example.123`), an underscore in a label (`ex_ample.com`), and a single-part name (`localhost`). The format error is `{name: domain}` (no `val`).',
    ],
    validate: () => createValidateFn<TF.DomainStrict>(),
    standardSchema: () => createStandardSchema<TF.DomainStrict>(),
    validateReflect: () => {
      const v: TF.DomainStrict = 'mion.io';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.DomainStrict>(),
    deserializeValidateReflect: () => {
      const v: TF.DomainStrict = 'mion.io';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.DomainStrict = 'mion.io';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.DomainStrict>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.DomainStrict = 'mion.io';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.DomainStrict = 'mion.io';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.DomainStrict>>(),
    validateSchema: () => createValidateFn(TF.domainStrict()),
    getValidationErrors: () => createGetValidationErrorsFn<TF.DomainStrict>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.DomainStrict>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.domainStrict()),
    mockType: () => createMockDataFn<TF.DomainStrict>(),
    getSamples: () => ({
      valid: ['mion.io', 'sub.example.com', 'aa.bb.cc.dd.ee.com'],
      invalid: ['-bad.com', 'aa.bb.cc.dd.ee.ff.com', 'example.123', 'ex_ample.com', 'localhost'],
    }),
    expectedFormatErrors: () => [{name: 'domain'}, null, null, null, null],
  },

  // ─────────────────────────────── Email ──────────────────────────
  email: {
    title: 'Email',
    description: 'TF.Email (format `email`) enforcing the baked email pattern plus `minLength` 7 / `maxLength` 254.',
    validateNotes: [
      'Standard addresses pass, including subaddressing (`user+tag@sub.example.org`).',
      'Rejected: no `@` (`not-an-email`), too short (`a@b.co`, below `minLength` 7), missing local part (`@example.com`), missing domain (`john@`), a TLD-less domain (`john@example`), an embedded space (`john doe@example.com`), and the empty string. The format error is `{name: email}` (no `val`).',
    ],
    validate: () => createValidateFn<TF.Email>(),
    standardSchema: () => createStandardSchema<TF.Email>(),
    validateReflect: () => {
      const v: TF.Email = 'john@example.com';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.Email>(),
    deserializeValidateReflect: () => {
      const v: TF.Email = 'john@example.com';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.Email = 'john@example.com';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.Email>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.Email = 'john@example.com';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.Email = 'john@example.com';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.Email>>(),
    validateSchema: () => createValidateFn(TF.email()),
    // `format: 'email'` now lowers to TF.EmailAddress (the full RFC 5321
    // grammar), not this everyday brand, so it has no schema spelling.
    getValidationErrors: () => createGetValidationErrorsFn<TF.Email>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.Email>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.email()),
    mockType: () => createMockDataFn<TF.Email>(),
    getSamples: () => ({
      valid: ['john@example.com', 'jane.doe@mion.io', 'ab@cd.co', 'user+tag@sub.example.org'],
      invalid: ['not-an-email', 'a@b.co', '@example.com', 'john@', 'john@example', 'john doe@example.com', ''],
    }),
    expectedFormatErrors: () => [{name: 'email'}, null, null, null, null, null, null],
  },
  emailPunycode: {
    title: 'Email punycode',
    description: 'TF.EmailPunycode (format `email`) whose email pattern additionally accepts punycode (`xn--`) domain labels.',
    validateNotes: [
      'A punycode-TLD address (`john@example.xn--fiqs8s`) passes, as does an all-punycode domain (`user@xn--e1afmkfd.xn--p1ai`) — the digit/hyphen TLD that plain `Email` rejects.',
      'A non-email string (`not-an-email`), an empty label before the TLD (`john@.xn--fiqs8s`), and a single-char TLD (`john@example.x`) all fail with `{name: email}` (no `val`).',
    ],
    validate: () => createValidateFn<TF.EmailPunycode>(),
    standardSchema: () => createStandardSchema<TF.EmailPunycode>(),
    validateReflect: () => {
      const v: TF.EmailPunycode = 'john@example.xn--fiqs8s';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.EmailPunycode>(),
    deserializeValidateReflect: () => {
      const v: TF.EmailPunycode = 'john@example.xn--fiqs8s';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.EmailPunycode = 'john@example.xn--fiqs8s';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.EmailPunycode>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.EmailPunycode = 'john@example.xn--fiqs8s';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.EmailPunycode = 'john@example.xn--fiqs8s';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.EmailPunycode>>(),
    validateSchema: () => createValidateFn(TF.emailPunycode()),
    getValidationErrors: () => createGetValidationErrorsFn<TF.EmailPunycode>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.EmailPunycode>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.emailPunycode()),
    mockType: () => createMockDataFn<TF.EmailPunycode>(),
    getSamples: () => ({
      valid: ['john@example.xn--fiqs8s', 'user@xn--e1afmkfd.xn--p1ai'],
      invalid: ['not-an-email', 'john@.xn--fiqs8s', 'john@example.x'],
    }),
    expectedFormatErrors: () => [{name: 'email'}, {name: 'email'}, {name: 'email'}],
  },
  emailStrict: {
    title: 'Email strict',
    description:
      'TF.EmailStrict (format `email`) that splits on the last `@` then applies a strict local-part pattern plus strict domain.',
    validateNotes: [
      'Plain addresses pass (`john@example.com`, `jane.doe@mion.io`).',
      'A disallowed local-part char (`a+b@x.com`) fails with `val` `Invalid characters in email local part`.',
      'Also rejected: a space in the local part (`a b@example.com`), a doubled `@` (`john@@example.com`), an underscore in the domain (`john@bad_domain.com`), and no `@` at all (`no-at-symbol`).',
    ],
    validate: () => createValidateFn<TF.EmailStrict>(),
    standardSchema: () => createStandardSchema<TF.EmailStrict>(),
    validateReflect: () => {
      const v: TF.EmailStrict = 'john@example.com';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.EmailStrict>(),
    deserializeValidateReflect: () => {
      const v: TF.EmailStrict = 'john@example.com';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.EmailStrict = 'john@example.com';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.EmailStrict>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.EmailStrict = 'john@example.com';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.EmailStrict = 'john@example.com';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.EmailStrict>>(),
    validateSchema: () => createValidateFn(TF.emailStrict()),
    getValidationErrors: () => createGetValidationErrorsFn<TF.EmailStrict>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.EmailStrict>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.emailStrict()),
    mockType: () => createMockDataFn<TF.EmailStrict>(),
    getSamples: () => ({
      valid: ['john@example.com', 'jane.doe@mion.io'],
      invalid: ['a+b@x.com', 'a b@example.com', 'john@@example.com', 'john@bad_domain.com', 'no-at-symbol'],
    }),
    expectedFormatErrors: () => [{name: 'email', val: 'Invalid characters in email local part'}, null, null, null, null],
  },

  // ──────────────────────────────── URL ───────────────────────────
  url: {
    title: 'URL',
    description: 'TF.Url (format `url`, `maxLength` 2048) accepting common schemes (http, ftp, ws/wss).',
    validateNotes: [
      'Multiple schemes pass (`https://`, `http://` with path+query, `ftp://`, `wss://`).',
      'Rejected: a scheme-less string (`not-a-url`), a bare host (`example.com`), a `mailto:` URI, and a scheme with no host (`https://`). The format error is `{name: url}` (no `val`).',
    ],
    validate: () => createValidateFn<TF.Url>(),
    standardSchema: () => createStandardSchema<TF.Url>(),
    validateReflect: () => {
      const v: TF.Url = 'https://example.com';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.Url>(),
    deserializeValidateReflect: () => {
      const v: TF.Url = 'https://example.com';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.Url = 'https://example.com';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.Url>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.Url = 'https://example.com';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.Url = 'https://example.com';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.Url>>(),
    validateSchema: () => createValidateFn(TF.url()),
    // `format: 'uri'` now lowers to TF.Uri (RFC 3986, any scheme), not TF.Url —
    // the narrow web-address brand has no schema spelling of its own.
    getValidationErrors: () => createGetValidationErrorsFn<TF.Url>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.Url>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.url()),
    mockType: () => createMockDataFn<TF.Url>(),
    getSamples: () => ({
      valid: ['https://example.com', 'http://mion.io/path?q=1', 'ftp://files.example.org', 'wss://socket.example.com'],
      invalid: ['not-a-url', 'example.com', 'mailto:john@example.com', 'https://'],
    }),
    expectedFormatErrors: () => [{name: 'url'}, null, null, null],
  },
  urlHttp: {
    title: 'URL http',
    description: 'TF.UrlHttp (format `url`) restricting the scheme to `http` / `https`.',
    validateNotes: [
      'Both `https://example.com` and `http://example.com` pass; a non-http scheme (`ftp://example.com`) fails with `{name: url}` (no `val`).',
    ],
    validate: () => createValidateFn<TF.UrlHttp>(),
    standardSchema: () => createStandardSchema<TF.UrlHttp>(),
    validateReflect: () => {
      const v: TF.UrlHttp = 'https://example.com';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.UrlHttp>(),
    deserializeValidateReflect: () => {
      const v: TF.UrlHttp = 'https://example.com';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.UrlHttp = 'https://example.com';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.UrlHttp>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.UrlHttp = 'https://example.com';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.UrlHttp = 'https://example.com';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.UrlHttp>>(),
    validateSchema: () => createValidateFn(TF.urlHttp()),
    getValidationErrors: () => createGetValidationErrorsFn<TF.UrlHttp>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.UrlHttp>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.urlHttp()),
    mockType: () => createMockDataFn<TF.UrlHttp>(),
    getSamples: () => ({valid: ['https://example.com', 'http://example.com'], invalid: ['ftp://example.com']}),
    expectedFormatErrors: () => [{name: 'url'}],
  },
  urlFile: {
    title: 'URL file',
    description: 'TF.UrlFile (format `url`) restricting the scheme to `file:`.',
    validateNotes: [
      'A `file:///etc/hosts` URL passes; a non-file scheme (`https://example.com`) fails with `{name: url}` (no `val`).',
    ],
    validate: () => createValidateFn<TF.UrlFile>(),
    standardSchema: () => createStandardSchema<TF.UrlFile>(),
    validateReflect: () => {
      const v: TF.UrlFile = 'file:///etc/hosts';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.UrlFile>(),
    deserializeValidateReflect: () => {
      const v: TF.UrlFile = 'file:///etc/hosts';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.UrlFile = 'file:///etc/hosts';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.UrlFile>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.UrlFile = 'file:///etc/hosts';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.UrlFile = 'file:///etc/hosts';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.UrlFile>>(),
    validateSchema: () => createValidateFn(TF.urlFile()),
    getValidationErrors: () => createGetValidationErrorsFn<TF.UrlFile>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.UrlFile>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.urlFile()),
    mockType: () => createMockDataFn<TF.UrlFile>(),
    getSamples: () => ({valid: ['file:///etc/hosts'], invalid: ['https://example.com']}),
    expectedFormatErrors: () => [{name: 'url'}],
  },

  // ─────────────────── registerFormatPattern ──────────────────
  pattern_slug: {
    title: 'Slug',
    description:
      'stringFormat with a registered `pattern` (slug `^[a-z0-9-]+$`, recovered from the call site) where only lowercase letters, digits, and hyphens pass.',
    validateNotes: [
      'Lowercase slug strings pass (`my-slug`, `a-b-c`).',
      'Rejected: capitals (`Has Capitals`, `UPPER`), an embedded space (`has space`), and the empty string.',
      'The pattern registers a custom message (`must be a slug`) and getValidationErrors surfaces it as the format `val` (message is id-relevant, so no cache-identity risk).',
    ],
    validate: () => createValidateFn<Slug>(),
    standardSchema: () => createStandardSchema<Slug>(),
    validateReflect: () => {
      const v: Slug = 'my-slug';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<Slug>(),
    deserializeValidateReflect: () => {
      const v: Slug = 'my-slug';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: Slug = 'my-slug';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Slug>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: Slug = 'my-slug';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: Slug = 'my-slug';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<Slug>>(),
    // Value-first can't reference the OPAQUE `registerFormatPattern` result
    // (its source/flags erase to `string`), so the schema re-authors the same
    // regex inline. The pattern's {source, flags} ARE part of the structural id,
    // so `flags: ''` must be supplied explicitly to match the type-first form.
    validateSchema: () =>
      createValidateFn(
        TF.string({
          pattern: {source: '^[a-z0-9-]+$', flags: '', mockSamples: ['my-slug', 'abc', 'a-b-c'], message: 'must be a slug'},
        })
      ),
    getValidationErrors: () => createGetValidationErrorsFn<Slug>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<Slug>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(
        TF.string({
          pattern: {source: '^[a-z0-9-]+$', flags: '', mockSamples: ['my-slug', 'abc', 'a-b-c'], message: 'must be a slug'},
        })
      ),
    mockType: () => createMockDataFn<Slug>(),
    getSamples: () => ({valid: ['my-slug', 'a-b-c'], invalid: ['Has Capitals', 'UPPER', 'has space', '']}),
    // The pattern's custom `message` IS the error val now: every format param
    // is id-relevant (mockSamples/message included — typeid/formats.go), so
    // shared.go messageLiteral surfaces it without cache-identity risk. This
    // was registerFormatPattern's documented behavior all along; it used to
    // fall back to the static 'Invalid pattern' default.
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 'must be a slug'},
      {name: 'stringFormat', val: 'must be a slug'},
      {name: 'stringFormat', val: 'must be a slug'},
      {name: 'stringFormat', val: 'must be a slug'},
    ],
  },
  json_pointer: {
    title: 'JsonPointer',
    description:
      'TF.JsonPointer (format `stringFormat`) — RFC 6901 JSON pointer — the path syntax `$ref` and patch documents use.',
    validateNotes: [
      'The empty string is the whole document and is valid; `/store/book/0` walks in.',
      '`~0` and `~1` are the escapes for `~` and `/`; a bare `~` or a path not starting with `/` fails.',
    ],
    validate: () => createValidateFn<TF.JsonPointer>(),
    standardSchema: () => createStandardSchema<TF.JsonPointer>(),
    validateReflect: () => {
      const v: TF.JsonPointer = '';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.JsonPointer>(),
    deserializeValidateReflect: () => {
      const v: TF.JsonPointer = '';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.JsonPointer = '';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.JsonPointer>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.JsonPointer = '';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.JsonPointer = '';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.JsonPointer>>(),
    validateSchema: () => createValidateFn(TF.jsonPointer()),
    getValidationErrors: () => createGetValidationErrorsFn<TF.JsonPointer>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.JsonPointer>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.jsonPointer()),
    mockType: () => createMockDataFn<TF.JsonPointer>(),
    getSamples: () => ({
      valid: ['', '/foo', '/foo/0', '/a~1b', '/c~0d'],
      invalid: ['foo', '/~', '/a~2b', '#/foo'],
    }),
    expectedFormatErrors: () => [null, null, null, null],
  },
  relative_json_pointer: {
    title: 'RelativeJsonPointer',
    description:
      'TF.RelativeJsonPointer (format `stringFormat`) — RFC 6901 relative JSON pointer — a hop count up the tree, then a pointer or `#`.',
    validateNotes: [
      '`0` is here, `1/foo` is one level up then into `foo`, `2#` is the key two levels up.',
      'A leading zero on the hop count (`01`), a missing hop count, and `#` in the middle all fail.',
    ],
    validate: () => createValidateFn<TF.RelativeJsonPointer>(),
    standardSchema: () => createStandardSchema<TF.RelativeJsonPointer>(),
    validateReflect: () => {
      const v: TF.RelativeJsonPointer = '0';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.RelativeJsonPointer>(),
    deserializeValidateReflect: () => {
      const v: TF.RelativeJsonPointer = '0';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.RelativeJsonPointer = '0';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.RelativeJsonPointer>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.RelativeJsonPointer = '0';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.RelativeJsonPointer = '0';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.RelativeJsonPointer>>(),
    validateSchema: () => createValidateFn(TF.relativeJsonPointer()),
    getValidationErrors: () => createGetValidationErrorsFn<TF.RelativeJsonPointer>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.RelativeJsonPointer>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.relativeJsonPointer()),
    mockType: () => createMockDataFn<TF.RelativeJsonPointer>(),
    getSamples: () => ({
      valid: ['0', '1/foo', '2#', '0/a~1b'],
      invalid: ['01', '/foo', '1#/foo', '-1/foo'],
    }),
    expectedFormatErrors: () => [null, null, null, null],
  },
  string_duration: {
    title: 'StringDuration',
    description:
      'TF.StringDuration (format `stringFormat`) — RFC 3339 duration string — a LENGTH of time (`P4DT12H30M5S`), not an instant.',
    validateNotes: [
      'Components nest: a year may be followed by a month, a month by a day, never skipping, so `P1Y2M3D` passes and `P1Y2D` does not.',
      'The week form stands alone (`P2W`), fractions are not allowed (`PT0.5S`), and this is deliberately stricter than the `now±P…` bound syntax.',
    ],
    validate: () => createValidateFn<TF.StringDuration>(),
    standardSchema: () => createStandardSchema<TF.StringDuration>(),
    validateReflect: () => {
      const v: TF.StringDuration = 'P4DT12H30M5S';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.StringDuration>(),
    deserializeValidateReflect: () => {
      const v: TF.StringDuration = 'P4DT12H30M5S';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.StringDuration = 'P4DT12H30M5S';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.StringDuration>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.StringDuration = 'P4DT12H30M5S';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.StringDuration = 'P4DT12H30M5S';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.StringDuration>>(),
    validateSchema: () => createValidateFn(TF.stringDuration()),
    getValidationErrors: () => createGetValidationErrorsFn<TF.StringDuration>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.StringDuration>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.stringDuration()),
    mockType: () => createMockDataFn<TF.StringDuration>(),
    getSamples: () => ({
      valid: ['P4DT12H30M5S', 'P1Y2M3D', 'PT1H30M', 'P2W', 'PT0S'],
      invalid: ['P', 'PT', 'P1Y2D', 'PT1H2S', 'P1Y2W', 'PT0.5S', 'P1D '],
    }),
    expectedFormatErrors: () => [null, null, null, null, null, null, null],
  },
  uri: {
    title: 'Uri',
    description: 'TF.Uri (format `url`) — RFC 3986 URI — any scheme, not just the web ones `TF.Url` accepts.',
    validateNotes: [
      '`mailto:`, `urn:` and `tel:` are URIs and pass here while failing `TF.Url`, which is the narrow web-address form.',
      'A scheme is required, so a relative reference like `../a` fails; use `TF.UriReference` for those.',
    ],
    validate: () => createValidateFn<TF.Uri>(),
    standardSchema: () => createStandardSchema<TF.Uri>(),
    validateReflect: () => {
      const v: TF.Uri = 'https://example.com/path';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.Uri>(),
    deserializeValidateReflect: () => {
      const v: TF.Uri = 'https://example.com/path';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.Uri = 'https://example.com/path';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.Uri>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.Uri = 'https://example.com/path';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.Uri = 'https://example.com/path';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.Uri>>(),
    validateSchema: () => createValidateFn(TF.uri()),
    getValidationErrors: () => createGetValidationErrorsFn<TF.Uri>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.Uri>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.uri()),
    mockType: () => createMockDataFn<TF.Uri>(),
    getSamples: () => ({
      valid: ['https://example.com/path', 'mailto:ada@example.com', 'urn:isbn:0451450523', 'ftp://files.example.org/pub'],
      invalid: ['../a', '//example.com', 'http://example.com/ä', '1http://example.com'],
    }),
    expectedFormatErrors: () => [null, null, null, null],
  },
  uri_reference: {
    title: 'UriReference',
    description: 'TF.UriReference (format `url`) — RFC 3986 URI reference — a URI, or a relative one resolved against a base.',
    validateNotes: [
      'Absolute URIs pass, and so do `/abs/path`, `../up` and a bare `#fragment`.',
      'The character repertoire stays ASCII; a non-ASCII path fails (that is `TF.IriReference`).',
    ],
    validate: () => createValidateFn<TF.UriReference>(),
    standardSchema: () => createStandardSchema<TF.UriReference>(),
    validateReflect: () => {
      const v: TF.UriReference = '/relative/path';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.UriReference>(),
    deserializeValidateReflect: () => {
      const v: TF.UriReference = '/relative/path';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.UriReference = '/relative/path';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.UriReference>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.UriReference = '/relative/path';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.UriReference = '/relative/path';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.UriReference>>(),
    validateSchema: () => createValidateFn(TF.uriReference()),
    getValidationErrors: () => createGetValidationErrorsFn<TF.UriReference>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.UriReference>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.uriReference()),
    mockType: () => createMockDataFn<TF.UriReference>(),
    getSamples: () => ({
      valid: ['/relative/path', '../up', '#fragment', 'https://example.com'],
      invalid: ['\\\\\\\\host\\\\share', 'http://example.com/ä', 'a b'],
    }),
    expectedFormatErrors: () => [null, null, null],
  },
  iri: {
    title: 'Iri',
    description: 'TF.Iri (format `url`) — RFC 3987 IRI — the same grammar as a URI with non-ASCII characters allowed.',
    validateNotes: [
      '`https://例え.テスト/ページ` passes here and fails `TF.Uri`, which is ASCII only.',
      'A scheme is still required; relative forms belong to `TF.IriReference`.',
    ],
    validate: () => createValidateFn<TF.Iri>(),
    standardSchema: () => createStandardSchema<TF.Iri>(),
    validateReflect: () => {
      const v: TF.Iri = 'https://example.com/päth';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.Iri>(),
    deserializeValidateReflect: () => {
      const v: TF.Iri = 'https://example.com/päth';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.Iri = 'https://example.com/päth';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.Iri>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.Iri = 'https://example.com/päth';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.Iri = 'https://example.com/päth';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.Iri>>(),
    validateSchema: () => createValidateFn(TF.iri()),
    getValidationErrors: () => createGetValidationErrorsFn<TF.Iri>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.Iri>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.iri()),
    mockType: () => createMockDataFn<TF.Iri>(),
    getSamples: () => ({
      valid: ['https://example.com/päth', 'https://例え.テスト/ページ', 'mailto:ada@example.com'],
      invalid: ['../päth', 'http://example.com/a b', '1http://example.com'],
    }),
    expectedFormatErrors: () => [null, null, null],
  },
  iri_reference: {
    title: 'IriReference',
    description: 'TF.IriReference (format `url`) — RFC 3987 IRI reference — an IRI, or a relative one.',
    validateNotes: [
      'Absolute IRIs pass, and so do relative paths and fragments carrying non-ASCII characters.',
      'Whitespace is still not a URI character, so `a b` fails.',
    ],
    validate: () => createValidateFn<TF.IriReference>(),
    standardSchema: () => createStandardSchema<TF.IriReference>(),
    validateReflect: () => {
      const v: TF.IriReference = '/relative/päth';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.IriReference>(),
    deserializeValidateReflect: () => {
      const v: TF.IriReference = '/relative/päth';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.IriReference = '/relative/päth';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.IriReference>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.IriReference = '/relative/päth';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.IriReference = '/relative/päth';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.IriReference>>(),
    validateSchema: () => createValidateFn(TF.iriReference()),
    getValidationErrors: () => createGetValidationErrorsFn<TF.IriReference>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.IriReference>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.iriReference()),
    mockType: () => createMockDataFn<TF.IriReference>(),
    getSamples: () => ({
      valid: ['/relative/päth', '#フラグ', 'https://例え.テスト'],
      invalid: ['a b', '\\\\\\\\host\\\\share'],
    }),
    expectedFormatErrors: () => [null, null],
  },
  uri_template: {
    title: 'UriTemplate',
    description: 'TF.UriTemplate (format `url`) — RFC 6570 URI template — a URI with `{…}` expressions still to be filled in.',
    validateNotes: [
      '`http://example.com/search{?q,lang}` and `{/path*}` pass; the operators, prefix (`:3`) and explode (`*`) modifiers are all understood.',
      'An unclosed or empty expression fails, as does a stray `}`.',
    ],
    validate: () => createValidateFn<TF.UriTemplate>(),
    standardSchema: () => createStandardSchema<TF.UriTemplate>(),
    validateReflect: () => {
      const v: TF.UriTemplate = 'http://example.com/{id}';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.UriTemplate>(),
    deserializeValidateReflect: () => {
      const v: TF.UriTemplate = 'http://example.com/{id}';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.UriTemplate = 'http://example.com/{id}';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.UriTemplate>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.UriTemplate = 'http://example.com/{id}';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.UriTemplate = 'http://example.com/{id}';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.UriTemplate>>(),
    validateSchema: () => createValidateFn(TF.uriTemplate()),
    getValidationErrors: () => createGetValidationErrorsFn<TF.UriTemplate>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.UriTemplate>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.uriTemplate()),
    mockType: () => createMockDataFn<TF.UriTemplate>(),
    getSamples: () => ({
      valid: ['http://example.com/{id}', 'http://example.com/~{username}/', 'http://example.com/search{?q,lang}', '{/path*}'],
      invalid: ['http://example.com/{id', 'http://example.com/{}', 'http://example.com/}'],
    }),
    expectedFormatErrors: () => [null, null, null],
  },
  hostname: {
    title: 'Hostname',
    description:
      'TF.Hostname (format `domain`) — RFC 1123 host name — labels of letters, digits and hyphens, a single label allowed.',
    validateNotes: [
      'A bare `localhost` or `db1` is a valid host name, which is where this differs from `TF.Domain` (that one wants a dotted name with a TLD).',
      'A label may not start or end with a hyphen, may not exceed 63 characters, and the whole name may not exceed 253.',
    ],
    validate: () => createValidateFn<TF.Hostname>(),
    standardSchema: () => createStandardSchema<TF.Hostname>(),
    validateReflect: () => {
      const v: TF.Hostname = 'example.com';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.Hostname>(),
    deserializeValidateReflect: () => {
      const v: TF.Hostname = 'example.com';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.Hostname = 'example.com';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.Hostname>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.Hostname = 'example.com';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.Hostname = 'example.com';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.Hostname>>(),
    validateSchema: () => createValidateFn(TF.hostname()),
    getValidationErrors: () => createGetValidationErrorsFn<TF.Hostname>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.Hostname>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.hostname()),
    mockType: () => createMockDataFn<TF.Hostname>(),
    getSamples: () => ({
      valid: ['example.com', 'hostname', 'sub.example.co.uk', 'h0stn4me', 'a--b.com', 'xn--9n2bp8q.xn--9t4b11yi5a'],
      invalid: ['-hostname', 'hostname-', 'host_name', '.example', 'example.', '', 'xn--X', 'xn--hello-zed'],
    }),
    expectedFormatErrors: () => [null, null, null, null, null, null, null, null],
  },
  idn_hostname: {
    title: 'IdnHostname',
    description:
      'TF.IdnHostname (format `idn-hostname`) — an internationalized host name: labels in their own script, with the IDNA contextual and bidirectional rules.',
    validateNotes: [
      'A name written in its own script passes (`실례.테스트`), as does the punycode spelling of the same name.',
      'The rules a pattern cannot express are enforced: an `xn--` label is decoded and must re-encode to itself, a contextual character is judged by its neighbours, and one right-to-left letter puts the whole name under the bidi rule.',
    ],
    validate: () => createValidateFn<TF.IdnHostname>(),
    standardSchema: () => createStandardSchema<TF.IdnHostname>(),
    validateReflect: () => {
      const v: TF.IdnHostname = '실례.테스트';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<TF.IdnHostname>(),
    deserializeValidateReflect: () => {
      const v: TF.IdnHostname = '실례.테스트';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.IdnHostname = '실례.테스트';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.IdnHostname>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.IdnHostname = '실례.테스트';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.IdnHostname = '실례.테스트';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<TF.IdnHostname>>(),
    validateSchema: () => createValidateFn(TF.idnHostname()),
    getValidationErrors: () => createGetValidationErrorsFn<TF.IdnHostname>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<TF.IdnHostname>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(TF.idnHostname()),
    mockType: () => createMockDataFn<TF.IdnHostname>(),
    getSamples: () => ({
      valid: ['실례.테스트', 'example.com', 'l·l', 'ヲ・ァ'],
      invalid: ['a·l', 'xn--X', 'א0٠', '-nope', ''],
    }),
    expectedFormatErrors: () => [null, null, null, null, null],
  },
  pattern_generated: {
    title: 'Generated pattern samples',
    description:
      'stringFormat with a sample-less inline `pattern`: the build auto-generates its mockSamples from the regex (deterministic per pattern), so mocking works with nothing declared.',
    validateNotes: [
      'Matching ticket codes pass (`ab-12`, `cd-09`); a wrong letter range (`zz-12`), a short number (`ab-1`), capitals (`AB-12`), and the empty string fail with `val` `Invalid pattern`.',
      'No mockSamples are declared anywhere: the mock lanes only work because the build generated the pool.',
    ],
    validate: () => createValidateFn<Generated>(),
    standardSchema: () => createStandardSchema<Generated>(),
    validateReflect: () => {
      const v: Generated = 'ab-12';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<Generated>(),
    deserializeValidateReflect: () => {
      const v: Generated = 'ab-12';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: Generated = 'ab-12';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Generated>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: Generated = 'ab-12';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: Generated = 'ab-12';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<Generated>>(),
    // Value-first sample-less pattern: the same generated pool serves this
    // form (identical {source, flags} params intern to the same node).
    validateSchema: () => createValidateFn(TF.string({pattern: {source: '^[a-d]{2}-[0-9]{2}$', flags: 'u'}})),
    getValidationErrors: () => createGetValidationErrorsFn<Generated>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<Generated>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(TF.string({pattern: {source: '^[a-d]{2}-[0-9]{2}$', flags: 'u'}})),
    mockType: () => createMockDataFn<Generated>(),
    getSamples: () => ({valid: ['ab-12', 'cd-09'], invalid: ['zz-12', 'ab-1', 'AB-12', '']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 'Invalid pattern'},
      {name: 'stringFormat', val: 'Invalid pattern'},
      {name: 'stringFormat', val: 'Invalid pattern'},
      {name: 'stringFormat', val: 'Invalid pattern'},
    ],
  },
  pattern_hex: {
    title: 'Hex pattern',
    description:
      'stringFormat with a registered case-insensitive `pattern` (hex `^[0-9a-f]+$`, flag `i`) accepting hex digits in either case.',
    validateNotes: [
      'The `i` flag folds case, so both `0042` and `DEADbeef` pass. A non-hex string (`xyz`) and the empty string each fail with `val` `Invalid pattern`.',
    ],
    validate: () => createValidateFn<Hex>(),
    standardSchema: () => createStandardSchema<Hex>(),
    validateReflect: () => {
      const v: Hex = '0042';
      return createValidateFn(v);
    },
    deserializeValidate: () => deserializeValidate<Hex>(),
    deserializeValidateReflect: () => {
      const v: Hex = '0042';
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: Hex = '0042';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Hex>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: Hex = '0042';
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: Hex = '0042';
      return createMockDataFn(v);
    },
    validateDataOnly: () => createValidateFn<DataOnly<Hex>>(),
    validateSchema: () =>
      createValidateFn(TF.string({pattern: {source: '^[0-9a-f]+$', flags: 'i', mockSamples: ['DEADbeef', '0042']}})),
    getValidationErrors: () => createGetValidationErrorsFn<Hex>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<Hex>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(TF.string({pattern: {source: '^[0-9a-f]+$', flags: 'i', mockSamples: ['DEADbeef', '0042']}})),
    mockType: () => createMockDataFn<Hex>(),
    getSamples: () => ({valid: ['0042', 'DEADbeef'], invalid: ['xyz', '']}),
    expectedFormatErrors: () => [
      {name: 'stringFormat', val: 'Invalid pattern'},
      {name: 'stringFormat', val: 'Invalid pattern'},
    ],
  },
} as const satisfies Record<string, FormatValidationCase>;
