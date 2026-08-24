import type {SharedCase} from '../types.ts';

export const TEMPLATE_LITERAL = {
  url_with_number_id: {
    title: 'Template literal URL with a number placeholder',
    description:
      "templateLiteral.spec.ts 'URL pattern api/user/${number}'. Compiled to `^api\\/user\\/-?(?:\\d+\\.?\\d*|\\.\\d+)$` at RT-build time; validate emits `typeof v === 'string' && regex.test(v)`.",
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
  },
  multi_segment_url: {
    title: 'Template literal URL with multiple placeholders',
    description: "templateLiteral.spec.ts 'multi-segment URL'. Multiple placeholders + literal segments.",
    getSamples: () => ({
      valid: ['/api/v1/user/jane/posts/7', '/api/v2/user/joe/posts/0'],
      invalid: ['api/v1/user/jane/posts/7', '/api/v1/user/jane/posts/abc', '/api/vx/user/jane/posts/7', null, undefined, 42, ''],
    }),
  },
  leading_string_placeholder: {
    title: 'Template literal starting with a string placeholder',
    description:
      "templateLiteral.spec.ts 'leading ${string} placeholder' — empty-string prefix accepted (string span uses `[\\s\\S]*`, not `+`).",
    getSamples: () => ({
      valid: ['/42', 'users/42'],
      invalid: ['users', '/abc', null, undefined, '', 42, 'abc/abc'],
    }),
  },
  regex_special_chars: {
    title: 'Template literal with regex metacharacters in literal segments',
    description:
      "templateLiteral.spec.ts 'regex special chars in literal' — parens (and other regex metacharacters) in the literal segments must be escaped in the compiled regex.",
    getSamples: () => ({
      valid: ['(42)', '(0)', '(-3.14)'],
      invalid: ['42', '(abc)', '()', '(42', null, undefined, '', '42)', '(NaN)'],
    }),
  },
  template_literal_nested_in_object: {
    title: 'Object with a template-literal-typed string property',
    description:
      "templateLiteral.spec.ts 'nested in object' — template literal as a property value; the parent object's AND chain composes the typeof+regex check against `v.url`.",
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
  },
  template_literal_index_key: {
    title: 'Index signature whose key is a template literal pattern',
    description:
      "templateLiteral.spec.ts 'as index signature key' — index signature whose key type is a template literal pattern. The IndexSignature emit now compiles the key pattern to a regex (same path as standalone template literals) and adds a per-key `regex.test(k)` check to the for-in loop, mirroring the getKeyPatternVar logic.",
    getSamples: () => ({
      valid: [{}, {'api/users': 1}, {'api/users': 1, 'api/admin': 2}],
      invalid: [{foo: 1}, {'api/users': 'not number'}, {'api/users': 1, foo: 2}, null, undefined, {'api/users': NaN}],
    }),
  },
  template_literal_union_placeholder: {
    title: 'Template literal with a union-of-literals placeholder',
    description:
      'Template literal with a union placeholder. tsgo distributes the union internally, so the type-checker hands the projector either a union span or a pre-distributed set of template literals; either way the compiled regex must constrain the placeholder to {a, b} — anything outside the union must be rejected.',
    getSamples: () => ({
      valid: ['a-42', 'b-0', 'a--3.14'],
      invalid: ['c-1', 'a-', '-1', 'a-foo', 'ab-1', null, undefined, '', 'A-1', 42],
    }),
  },
} as const satisfies Record<string, SharedCase>;
