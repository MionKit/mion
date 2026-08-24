import type * as TF from '@ts-runtypes/core/formats';
import type {FormatTransformCase} from './types.ts';
import '@ts-runtypes/core/formats';
import {createFormatTransformFn} from '@ts-runtypes/core';

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
    title: 'TF.String trim — trims surrounding whitespace',
    formatTransform: () => createFormatTransformFn<TF.String<{trim: true}>>(),
    getCases: () => [{input: '  padded  ', expected: 'padded'}],
  },
  replace: {
    title: 'TF.String replace — replaces the first match only',
    formatTransform: () => createFormatTransformFn<TF.String<{replace: {searchValue: 'a'; replaceValue: 'X'}}>>(),
    getCases: () => [
      {input: 'banana', expected: 'bXnana'},
      {input: 'no-match', expected: 'no-mXtch'},
    ],
  },
  replaceAll: {
    title: 'TF.String replaceAll — replaces every match',
    formatTransform: () => createFormatTransformFn<TF.String<{replaceAll: {searchValue: 'a'; replaceValue: 'X'}}>>(),
    getCases: () => [
      {input: 'banana', expected: 'bXnXnX'},
      {input: 'aaa', expected: 'XXX'},
    ],
  },
  email_lowercase: {
    title: 'TF.Email — lowercases the value (case-insensitive emails)',
    formatTransform: () => createFormatTransformFn<TF.Email>(),
    getCases: () => [
      {input: 'John@Example.COM', expected: 'john@example.com'},
      {input: 'already@lower.io', expected: 'already@lower.io'},
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
