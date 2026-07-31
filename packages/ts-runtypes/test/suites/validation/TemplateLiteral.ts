import * as TF from '@ts-runtypes/core/formats';
import type {ValidationCase} from './types.ts';
import {
  createValidateFn,
  createGetValidationErrorsFn,
  createMockDataFn,
  createStandardSchema,
  type DataOnly,
} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/schema';
import {deserializeValidate, deserializeGetValidationErrors} from '../../util/deserializeRTFunctions.ts';

export const TEMPLATE_LITERAL = {
  url_with_number_id: {
    title: 'Number placeholder',
    description:
      "templateLiteral.spec.ts 'URL pattern api/user/${number}': the `${number}` placeholder is compiled to `^api\\/user\\/-?(?:\\d+\\.?\\d*|\\.\\d+)$` at RT-build time, and validate emits `typeof v === 'string' && regex.test(v)`.",
    validateNotes: [
      'Template literal types are compiled to a JS RegExp at build time and matched at runtime with `regex.test(v)`.',
      'The `${number}` placeholder expects digit-strings (`42`, `-7`, `3.14`) — NOT the words "NaN" or "Infinity" even though those are typeof "number" at the JS level.',
    ],
    validate: () => createValidateFn<`api/user/${number}`>(),
    standardSchema: () => createStandardSchema<`api/user/${number}`>(),
    // One hand-authored Standard Schema expectation per file. Every other case
    // derives its expected issues from getExpectedErrors via runTypeErrorsToIssues
    // (the same mapping the factory uses), so this single case pins the real
    // consumer-facing {message, path} output independently: it trips if error
    // generation or the issue mapping changes. One case per file covers this
    // file's shapes without the ~265x maintenance of authoring every case.
    getExpectedStandardErrors: () => [
      [{message: 'Expected templateLiteral', path: [], expected: 'templateLiteral'}],
      [{message: 'Expected templateLiteral', path: [], expected: 'templateLiteral'}],
      [{message: 'Expected templateLiteral', path: [], expected: 'templateLiteral'}],
      [{message: 'Expected templateLiteral', path: [], expected: 'templateLiteral'}],
      [{message: 'Expected templateLiteral', path: [], expected: 'templateLiteral'}],
      [{message: 'Expected templateLiteral', path: [], expected: 'templateLiteral'}],
      [{message: 'Expected templateLiteral', path: [], expected: 'templateLiteral'}],
      [{message: 'Expected templateLiteral', path: [], expected: 'templateLiteral'}],
      [{message: 'Expected templateLiteral', path: [], expected: 'templateLiteral'}],
      [{message: 'Expected templateLiteral', path: [], expected: 'templateLiteral'}],
    ],
    validateDataOnly: () => createValidateFn<DataOnly<`api/user/${number}`>>(),
    validateSchema: () => createValidateFn(RT.templateLiteral(['api/user/', TF.number()])),
    deserializeValidate: () => deserializeValidate<`api/user/${number}`>(),
    validateReflect: () => {
      const v: `api/user/${number}` = 'api/user/42';
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: `api/user/${number}` = 'api/user/42';
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<`api/user/${number}`>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<`api/user/${number}`>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.templateLiteral(['api/user/', TF.number()])),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<`api/user/${number}`>(),
    getValidationErrorsReflect: () => {
      const v: `api/user/${number}` = 'api/user/42';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: `api/user/${number}` = 'api/user/42';
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<`api/user/${number}`>(),
    mockTypeReflect: () => {
      const v: `api/user/${number}` = 'api/user/42';
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: ['api/user/42', 'api/user/0', 'api/user/3.14', 'api/user/-7'],
      invalid: [
        'api/user/abc',
        '/api/user/42',
        'api/user/',
        42,
        null,
        'api/user/42x',
        undefined,
        '',
        'api/user/NaN', // NaN is a name, not a digit-pattern
        'api/user/Infinity', // same
      ],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
    ],
  },

  multi_segment_url: {
    title: 'Multiple placeholders',
    description: "templateLiteral.spec.ts 'multi-segment URL' combines multiple placeholders with literal segments.",
    validateNotes:
      'Every literal segment and placeholder is matched positionally in one regex — the `${number}` spans require digit-strings while the `${string}` span accepts any characters; a single mismatched segment fails the whole match.',
    validate: () => createValidateFn<`/api/v${number}/user/${string}/posts/${number}`>(),
    standardSchema: () => createStandardSchema<`/api/v${number}/user/${string}/posts/${number}`>(),
    validateDataOnly: () => createValidateFn<DataOnly<`/api/v${number}/user/${string}/posts/${number}`>>(),
    validateSchema: () =>
      createValidateFn(RT.templateLiteral(['/api/v', TF.number(), '/user/', TF.string(), '/posts/', TF.number()])),
    deserializeValidate: () => deserializeValidate<`/api/v${number}/user/${string}/posts/${number}`>(),
    validateReflect: () => {
      const v: `/api/v${number}/user/${string}/posts/${number}` = '/api/v1/user/jane/posts/7';
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: `/api/v${number}/user/${string}/posts/${number}` = '/api/v1/user/jane/posts/7';
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<`/api/v${number}/user/${string}/posts/${number}`>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<`/api/v${number}/user/${string}/posts/${number}`>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(RT.templateLiteral(['/api/v', TF.number(), '/user/', TF.string(), '/posts/', TF.number()])),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<`/api/v${number}/user/${string}/posts/${number}`>(),
    getValidationErrorsReflect: () => {
      const v: `/api/v${number}/user/${string}/posts/${number}` = '/api/v1/user/jane/posts/7';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: `/api/v${number}/user/${string}/posts/${number}` = '/api/v1/user/jane/posts/7';
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<`/api/v${number}/user/${string}/posts/${number}`>(),
    mockTypeReflect: () => {
      const v: `/api/v${number}/user/${string}/posts/${number}` = '/api/v1/user/jane/posts/7';
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: ['/api/v1/user/jane/posts/7', '/api/v2/user/joe/posts/0'],
      invalid: ['api/v1/user/jane/posts/7', '/api/v1/user/jane/posts/abc', '/api/vx/user/jane/posts/7', null, undefined, 42, ''],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
    ],
  },

  leading_string_placeholder: {
    title: 'Leading string placeholder',
    description:
      "templateLiteral.spec.ts 'leading ${string} placeholder' accepts an empty-string prefix because the string span uses `[\\s\\S]*`, not `+`.",
    validateNotes:
      'A leading `${string}` placeholder matches the empty string too — `"/42"` is valid (no characters before the slash).',
    validate: () => createValidateFn<`${string}/${number}`>(),
    standardSchema: () => createStandardSchema<`${string}/${number}`>(),
    validateDataOnly: () => createValidateFn<DataOnly<`${string}/${number}`>>(),
    validateSchema: () => createValidateFn(RT.templateLiteral([TF.string(), '/', TF.number()])),
    deserializeValidate: () => deserializeValidate<`${string}/${number}`>(),
    validateReflect: () => {
      const v: `${string}/${number}` = '/42';
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: `${string}/${number}` = '/42';
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<`${string}/${number}`>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<`${string}/${number}`>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.templateLiteral([TF.string(), '/', TF.number()])),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<`${string}/${number}`>(),
    getValidationErrorsReflect: () => {
      const v: `${string}/${number}` = '/42';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: `${string}/${number}` = '/42';
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<`${string}/${number}`>(),
    mockTypeReflect: () => {
      const v: `${string}/${number}` = '/42';
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: ['/42', 'users/42'],
      invalid: ['users', '/abc', null, undefined, '', 42, 'abc/abc'],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
    ],
  },

  regex_special_chars: {
    title: 'Regex metacharacters',
    description:
      "templateLiteral.spec.ts 'regex special chars in literal' requires that parens and other regex metacharacters in the literal segments be escaped in the compiled regex.",
    validateNotes:
      'Regex metacharacters in literal segments are escaped, so the parens are matched literally — `(42)` passes but `42` (no parens) fails.',
    validate: () => createValidateFn<`(${number})`>(),
    standardSchema: () => createStandardSchema<`(${number})`>(),
    validateDataOnly: () => createValidateFn<DataOnly<`(${number})`>>(),
    validateSchema: () => createValidateFn(RT.templateLiteral(['(', TF.number(), ')'])),
    deserializeValidate: () => deserializeValidate<`(${number})`>(),
    validateReflect: () => {
      const v: `(${number})` = '(42)';
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: `(${number})` = '(42)';
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<`(${number})`>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<`(${number})`>>(),
    getValidationErrorsSchema: () => createGetValidationErrorsFn(RT.templateLiteral(['(', TF.number(), ')'])),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<`(${number})`>(),
    getValidationErrorsReflect: () => {
      const v: `(${number})` = '(42)';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: `(${number})` = '(42)';
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<`(${number})`>(),
    mockTypeReflect: () => {
      const v: `(${number})` = '(42)';
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: ['(42)', '(0)', '(-3.14)'],
      invalid: ['42', '(abc)', '()', '(42', null, undefined, '', '42)', '(NaN)'],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
      [{path: [], expected: 'templateLiteral'}],
    ],
  },

  template_literal_nested_in_object: {
    title: 'Nested in object',
    description:
      "templateLiteral.spec.ts 'nested in object' uses a template literal as a property value, and the parent object's AND chain composes the typeof+regex check against `v.url`.",
    validateNotes:
      'The `url` property is checked with the same typeof+regex as a standalone template literal, so a numeric `url: 42` fails (`expected: "templateLiteral"`) even though it would pass a plain `string` property.',
    validate: () => createValidateFn<{url: `api/user/${number}`; method: string}>(),
    standardSchema: () => createStandardSchema<{url: `api/user/${number}`; method: string}>(),
    validateDataOnly: () => createValidateFn<DataOnly<{url: `api/user/${number}`; method: string}>>(),
    validateSchema: () => createValidateFn(RT.object({url: RT.templateLiteral(['api/user/', TF.number()]), method: TF.string()})),
    deserializeValidate: () => deserializeValidate<{url: `api/user/${number}`; method: string}>(),
    validateReflect: () => {
      const v: {url: `api/user/${number}`; method: string} = {url: 'api/user/42', method: 'GET'};
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: {url: `api/user/${number}`; method: string} = {url: 'api/user/42', method: 'GET'};
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<{url: `api/user/${number}`; method: string}>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<{url: `api/user/${number}`; method: string}>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(RT.object({url: RT.templateLiteral(['api/user/', TF.number()]), method: TF.string()})),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<{url: `api/user/${number}`; method: string}>(),
    getValidationErrorsReflect: () => {
      const v: {url: `api/user/${number}`; method: string} = {url: 'api/user/42', method: 'GET'};
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: {url: `api/user/${number}`; method: string} = {url: 'api/user/42', method: 'GET'};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<{url: `api/user/${number}`; method: string}>(),
    mockTypeReflect: () => {
      const v: {url: `api/user/${number}`; method: string} = {url: 'api/user/42', method: 'GET'};
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [{url: 'api/user/42', method: 'GET'}],
      invalid: [
        {url: 'api/admin/42', method: 'GET'},
        {url: 'api/user/42'},
        null,
        undefined,
        {url: 42, method: 'GET'},
        {method: 'GET'},
        {url: 'api/user/42', method: 42},
      ],
    }),
    getExpectedErrors: () => [
      [{path: ['url'], expected: 'templateLiteral'}],
      [{path: ['method'], expected: 'string'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['url'], expected: 'templateLiteral'}],
      [{path: ['url'], expected: 'templateLiteral'}],
      [{path: ['method'], expected: 'string'}],
    ],
  },

  template_literal_index_key: {
    title: 'Index signature key',
    description:
      "templateLiteral.spec.ts 'as index signature key' uses a template literal pattern as the index signature's key type; the IndexSignature emit compiles the key pattern to a regex (same path as standalone template literals) and adds a per-key `regex.test(k)` check to the for-in loop, mirroring the getKeyPatternVar.",
    validateNotes:
      'Index-signature keys constrained by a template literal pattern: every own key on the object must match the compiled regex AND its value must satisfy the value type.',
    validate: () => createValidateFn<{[key: `api/${string}`]: number}>(),
    standardSchema: () => createStandardSchema<{[key: `api/${string}`]: number}>(),
    validateDataOnly: () => createValidateFn<DataOnly<{[key: `api/${string}`]: number}>>(),
    validateSchema: () => createValidateFn(RT.record(RT.templateLiteral(['api/', TF.string()]), TF.number())),
    deserializeValidate: () => deserializeValidate<{[key: `api/${string}`]: number}>(),
    validateReflect: () => {
      const v: {[key: `api/${string}`]: number} = {};
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: {[key: `api/${string}`]: number} = {};
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<{[key: `api/${string}`]: number}>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<{[key: `api/${string}`]: number}>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(RT.record(RT.templateLiteral(['api/', TF.string()]), TF.number())),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<{[key: `api/${string}`]: number}>(),
    getValidationErrorsReflect: () => {
      const v: {[key: `api/${string}`]: number} = {};
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: {[key: `api/${string}`]: number} = {};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<{[key: `api/${string}`]: number}>(),
    mockTypeReflect: () => {
      const v: {[key: `api/${string}`]: number} = {};
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: [{}, {'api/users': 1}, {'api/users': 1, 'api/admin': 2}],
      invalid: [{foo: 1}, {'api/users': 'not number'}, {'api/users': 1, foo: 2}, null, undefined, {'api/users': NaN}],
    }),
    // A key that fails the template-literal KEY pattern is reported as `never`
    // (the key is excess/disallowed), NOT `templateLiteral`. The `templateLiteral`
    // token only fires for a template-literal VALUE position. See the index-sig
    // key-regex emit in internal/cachegen/typefunctions/validationerrors.go (keyRegexVar
    // branch records `callRTErr('never', keyVar)`).
    getExpectedErrors: () => [
      // {foo: 1} — key 'foo' fails the template-literal pattern.
      [{path: ['foo'], expected: 'never'}],
      // {'api/users': 'not number'} — key passes, value fails number.
      [{path: ['api/users'], expected: 'number'}],
      // {'api/users': 1, foo: 2} — 'foo' fails key pattern; 'api/users' OK.
      [{path: ['foo'], expected: 'never'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['api/users'], expected: 'number'}],
    ],
  },

  template_literal_union_placeholder: {
    title: 'Union placeholder',
    description:
      'A template literal with a union placeholder, where tsgo distributes the union internally so the type-checker hands the projector either a union span or a pre-distributed set of template literals; either way the compiled regex must constrain the placeholder to {a, b} and reject anything outside the union.',
    validateNotes:
      'Union placeholders inside a template literal compile to a character-class / alternation in the regex — only the listed literal values pass.',
    validate: () => createValidateFn<`${'a' | 'b'}-${number}`>(),
    standardSchema: () => createStandardSchema<`${'a' | 'b'}-${number}`>(),
    validateDataOnly: () => createValidateFn<DataOnly<`${'a' | 'b'}-${number}`>>(),
    validateSchema: () => createValidateFn(RT.templateLiteral([RT.union([RT.literal('a'), RT.literal('b')]), '-', TF.number()])),
    deserializeValidate: () => deserializeValidate<`${'a' | 'b'}-${number}`>(),
    validateReflect: () => {
      const v: `${'a' | 'b'}-${number}` = 'a-42';
      return createValidateFn(v);
    },
    deserializeValidateReflect: () => {
      const v: `${'a' | 'b'}-${number}` = 'a-42';
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrorsFn<`${'a' | 'b'}-${number}`>(),
    getValidationErrorsDataOnly: () => createGetValidationErrorsFn<DataOnly<`${'a' | 'b'}-${number}`>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrorsFn(RT.templateLiteral([RT.union([RT.literal('a'), RT.literal('b')]), '-', TF.number()])),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<`${'a' | 'b'}-${number}`>(),
    getValidationErrorsReflect: () => {
      const v: `${'a' | 'b'}-${number}` = 'a-42';
      return createGetValidationErrorsFn(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: `${'a' | 'b'}-${number}` = 'a-42';
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockDataFn<`${'a' | 'b'}-${number}`>(),
    mockTypeReflect: () => {
      const v: `${'a' | 'b'}-${number}` = 'a-42';
      return createMockDataFn(v);
    },
    getSamples: () => ({
      valid: ['a-42', 'b-0', 'a--3.14'],
      invalid: ['c-1', 'a-', '-1', 'a-foo', 'ab-1', null, undefined, '', 'A-1', 42],
    }),
    // The resolver distributes ${'a'|'b'} into a union of two template
    // literals (`'a-${number}'` | `'b-${number}'`), so the top-level
    // kind is KindUnion not KindTemplateLiteral. Expected kindname is
    // 'union'.
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },
} as const satisfies Record<string, ValidationCase>;
