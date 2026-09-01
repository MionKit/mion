import type * as TF from '@mionjs/run-types/formats';
import type {FormatTransformCase} from './types.ts';
import {transform, email} from '@mionjs/run-types/formats';
import {createFormatTransformFn} from '@mionjs/run-types';

export const STRING_FORMAT = {
  lowercase: {
    title: 'TF.Lowercase — lowercases the value',
    formatTransform: () => createFormatTransformFn<TF.Lowercase>(),
    getCases: () => [
      {input: 'ABC', expected: 'abc'},
      {input: 'MixedCase', expected: 'mixedcase'},
    ],
  },
  uppercase: {
    title: 'TF.Uppercase — uppercases the value',
    formatTransform: () => createFormatTransformFn<TF.Uppercase>(),
    getCases: () => [{input: 'abc', expected: 'ABC'}],
  },
  capitalize: {
    title: 'TF.Capitalize — capitalizes the first letter',
    formatTransform: () => createFormatTransformFn<TF.Capitalize>(),
    getCases: () => [{input: 'hello', expected: 'Hello'}],
  },
  trim: {
    title: 'TF.String transform trim — trims surrounding whitespace',
    formatTransform: () => createFormatTransformFn<TF.String<{transform: {trim: true}}>>(),
    getCases: () => [{input: '  padded  ', expected: 'padded'}],
  },
  trim_then_lowercase: {
    title: 'TF.String transform — trim runs before the case change, next to a validation param',
    formatTransform: () => createFormatTransformFn<TF.String<{maxLength: 32; transform: {trim: true; lowercase: true}}>>(),
    getCases: () => [{input: '  MiXeD  ', expected: 'mixed'}],
  },
  replace: {
    title: 'TF.String transform replace — replaces the first match only',
    formatTransform: () => createFormatTransformFn<TF.String<{transform: {replace: {searchValue: 'a'; replaceValue: 'X'}}}>>(),
    getCases: () => [
      {input: 'banana', expected: 'bXnana'},
      {input: 'no-match', expected: 'no-mXtch'},
    ],
  },
  replaceAll: {
    title: 'TF.String transform replaceAll — replaces every match',
    formatTransform: () => createFormatTransformFn<TF.String<{transform: {replaceAll: {searchValue: 'a'; replaceValue: 'X'}}}>>(),
    getCases: () => [
      {input: 'banana', expected: 'bXnXnX'},
      {input: 'aaa', expected: 'XXX'},
    ],
  },
  wrapper_email: {
    title: 'TF.Transform<TF.Email, {trim, lowercase}> — the wrapper spelling of the same key',
    formatTransform: () => createFormatTransformFn<TF.Transform<TF.Email, {trim: true; lowercase: true}>>(),
    getCases: () => [
      {input: ' John@Example.COM ', expected: 'john@example.com'},
      {input: 'already@lower.io', expected: 'already@lower.io'},
    ],
  },
  wrapper_plain_string: {
    title: 'TF.Transform<string, {uppercase}> — a plain string can carry a transform',
    formatTransform: () => createFormatTransformFn<TF.Transform<string, {uppercase: true}>>(),
    getCases: () => [{input: 'abc', expected: 'ABC'}],
  },
  wrapper_keeps_brand: {
    title: 'TF.Transform over a nominal brand — the brand rides along, the transform applies',
    formatTransform: () => createFormatTransformFn<TF.Transform<TF.String<{maxLength: 8}, 'UserTag'>, {lowercase: true}>>(),
    getCases: () => [{input: 'ADMIN', expected: 'admin'}],
  },
  wrapper_replaces_preset_transform: {
    title: 'TF.Transform<TF.Lowercase, {trim}> — the wrapper REPLACES the transform the preset carried',
    formatTransform: () => createFormatTransformFn<TF.Transform<TF.Lowercase, {trim: true}>>(),
    getCases: () => [{input: '  ABC  ', expected: 'ABC'}],
  },
  value_first_transform: {
    title: 'TF.transform(TF.email(), {lowercase}) — the value-first twin',
    formatTransform: () => createFormatTransformFn(transform(email(), {lowercase: true})),
    getCases: () => [{input: 'John@Example.COM', expected: 'john@example.com'}],
  },
  email_identity_by_default: {
    title: 'TF.Email — no rewrite unless the type asks: the local part is case-sensitive by the RFC',
    formatTransform: () => createFormatTransformFn<TF.Email>(),
    getCases: () => [{input: 'John@Example.COM', expected: 'John@Example.COM'}],
  },
  email_opt_in_lowercase: {
    title: 'TF.Email<{transform: {lowercase}}> — lowercases when asked',
    formatTransform: () => createFormatTransformFn<TF.Email<{transform: {lowercase: true}}>>(),
    getCases: () => [
      {input: 'John@Example.COM', expected: 'john@example.com'},
      {input: 'already@lower.io', expected: 'already@lower.io'},
    ],
  },
  domain_identity_by_default: {
    title: 'TF.Domain — no rewrite unless the type asks',
    formatTransform: () => createFormatTransformFn<TF.Domain>(),
    getCases: () => [{input: 'Example.COM', expected: 'Example.COM'}],
  },
  domain_opt_in_lowercase: {
    title: 'TF.Domain<{transform: {lowercase}}> — lowercases when asked',
    formatTransform: () => createFormatTransformFn<TF.Domain<{transform: {lowercase: true}}>>(),
    getCases: () => [{input: 'Example.COM', expected: 'example.com'}],
  },
  ip_identity_by_default: {
    title: 'TF.IPv6 — no rewrite unless the type asks',
    formatTransform: () => createFormatTransformFn<TF.IPv6>(),
    getCases: () => [{input: '2001:DB8::1', expected: '2001:DB8::1'}],
  },
  ip_opt_in_lowercase: {
    title: 'TF.IPv6<{transform: {lowercase}}> — canonicalises the hex digits when asked',
    formatTransform: () => createFormatTransformFn<TF.IPv6<{transform: {lowercase: true}}>>(),
    getCases: () => [{input: '2001:DB8::1', expected: '2001:db8::1'}],
  },
  url_identity_by_default: {
    title: 'TF.Url — no rewrite unless the type asks: a URL path is case-sensitive',
    formatTransform: () => createFormatTransformFn<TF.Url>(),
    getCases: () => [{input: 'https://Example.com/Path', expected: 'https://Example.com/Path'}],
  },
  url_opt_in_lowercase: {
    title: 'TF.Url<{transform: {lowercase}}> — lowercases the whole URL when asked',
    formatTransform: () => createFormatTransformFn<TF.Url<{transform: {lowercase: true}}>>(),
    getCases: () => [{input: 'https://Example.com/Path', expected: 'https://example.com/path'}],
  },
  creditCard_strip_separators: {
    title: 'TF.CreditCard<{transform: {stripSeparators}}> — rewrites a grouped number to bare digits',
    formatTransform: () => createFormatTransformFn<TF.CreditCard<{transform: {stripSeparators: true}}>>(),
    getCases: () => [
      {input: '4111 1111 1111 1111', expected: '4111111111111111'},
      {input: '4111-1111-1111-1111', expected: '4111111111111111'},
      {input: '4111111111111111', expected: '4111111111111111'},
    ],
  },
  creditCard_wrapper_strip: {
    title: 'TF.Transform<TF.CreditCard, {stripSeparators}> — the wrapper spelling',
    formatTransform: () => createFormatTransformFn<TF.Transform<TF.CreditCard, {trim: true; stripSeparators: true}>>(),
    getCases: () => [{input: ' 4111 1111 1111 1111 ', expected: '4111111111111111'}],
  },
  identity_credit_card: {
    title: 'TF.CreditCard — accepts the grouping but leaves it alone unless asked to strip',
    formatTransform: () => createFormatTransformFn<TF.CreditCard>(),
    getCases: () => [
      {input: '4111 1111 1111 1111', expected: '4111 1111 1111 1111'},
      {input: '4111111111111111', expected: '4111111111111111'},
    ],
  },
  identity_plain_string: {
    title: 'plain string — passes through unchanged',
    formatTransform: () => createFormatTransformFn<string>(),
    getCases: () => [{input: 'ABC', expected: 'ABC'}],
  },
  identity_length_only: {
    title: 'length-only TF.String — no transform',
    formatTransform: () => createFormatTransformFn<TF.String<{maxLength: 10}>>(),
    getCases: () => [{input: 'ABC', expected: 'ABC'}],
  },
  identity_uuid: {
    title: 'TF.UUIDv4 — no transform, passes through unchanged',
    formatTransform: () => createFormatTransformFn<TF.UUIDv4>(),
    getCases: () => [{input: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA', expected: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'}],
  },
  nested_object: {
    title: 'nested object — transforms only the format-branded field',
    formatTransform: () => createFormatTransformFn<{name: TF.Lowercase; age: number; tag: string}>(),
    getCases: () => [{input: {name: 'ALICE', age: 30, tag: 'KEEP'}, expected: {name: 'alice', age: 30, tag: 'KEEP'}}],
  },
  branded_array_elements: {
    title: 'array of TF.Lowercase — transforms each element',
    formatTransform: () => createFormatTransformFn<TF.Lowercase[]>(),
    getCases: () => [{input: ['A', 'Bc', 'DEF'], expected: ['a', 'bc', 'def']}],
  },
} as const satisfies Record<string, FormatTransformCase>;
