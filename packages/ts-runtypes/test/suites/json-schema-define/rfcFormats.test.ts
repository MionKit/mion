// The formats whose rules are engines rather than patterns: `regex` (does the
// string compile?), `email` / `idn-email` (RFC 5321 addressing), and the
// RFC 3339 time rules, where a leap second is only real at one instant.
import {describe, expect, it} from 'vitest';
import {createValidateFn, createMockDataFn} from '@ts-runtypes/core';
import {runTypeFromJsonSchema} from '@ts-runtypes/core/json-schema';
import type * as TF from '@ts-runtypes/core/formats';

const isRegex = createValidateFn(runTypeFromJsonSchema({type: 'string', format: 'regex'} as const));
const isEmail = createValidateFn(runTypeFromJsonSchema({type: 'string', format: 'email'} as const));
const isIdnEmail = createValidateFn(runTypeFromJsonSchema({type: 'string', format: 'idn-email'} as const));
const isTime = createValidateFn(runTypeFromJsonSchema({type: 'string', format: 'time'} as const));
const isDateTime = createValidateFn(runTypeFromJsonSchema({type: 'string', format: 'date-time'} as const));

describe('regex — the string must compile', () => {
  it('accepts real regular expressions', () => {
    expect(isRegex('([abc])+\\s+$')).toBe(true);
    expect(isRegex('(?<name>x)')).toBe(true);
    expect(isRegex('(?<=a+)b')).toBe(true);
  });

  it('turns down other dialects, which plain mode would read as literals', () => {
    expect(isRegex('^(abc]')).toBe(false); // unclosed
    expect(isRegex('(?i)abc')).toBe(false); // inline flag group
    expect(isRegex('(?#comment)a')).toBe(false); // comment group
    expect(isRegex('(?P<name>x)')).toBe(false); // Python named group
    expect(isRegex('\\a')).toBe(false); // not an ECMA escape
  });

  it('mocks values that compile', () => {
    const mock = createMockDataFn<TF.RegexString>();
    for (let draw = 0; draw < 30; draw++) expect(isRegex(mock())).toBe(true);
  });
});

describe('email — the full RFC 5321 grammar', () => {
  it('accepts the everyday shape', () => {
    expect(isEmail('joe.bloggs@example.com')).toBe(true);
    expect(isEmail('te~st@example.com')).toBe(true);
    expect(isEmail('te.s.t@example.com')).toBe(true);
  });

  it('accepts a quoted local part, which a pattern cannot express', () => {
    expect(isEmail('"joe bloggs"@example.com')).toBe(true);
    expect(isEmail('"joe..bloggs"@example.com')).toBe(true);
    // Even an @ of its own, which is why the LAST @ is the separator.
    expect(isEmail('"joe@bloggs"@example.com')).toBe(true);
  });

  it('accepts an address literal for the domain', () => {
    expect(isEmail('joe.bloggs@[127.0.0.1]')).toBe(true);
    expect(isEmail('joe.bloggs@[IPv6:::1]')).toBe(true);
    // The literal is a real address check, not a bracket check.
    expect(isEmail('joe.bloggs@[127.0.0.300]')).toBe(false);
  });

  it('applies the dot-atom rules to an unquoted local part', () => {
    expect(isEmail('.test@example.com')).toBe(false);
    expect(isEmail('test.@example.com')).toBe(false);
    expect(isEmail('te..st@example.com')).toBe(false);
    expect(isEmail('joe bloggs@example.com')).toBe(false);
    expect(isEmail('@example.com')).toBe(false);
    expect(isEmail('joe.bloggs@')).toBe(false);
    expect(isEmail('user1@oceania.org, user2@oceania.org')).toBe(false);
  });

  it('idn-email widens the repertoire, not the grammar', () => {
    expect(isIdnEmail('실례@실례.테스트')).toBe(true);
    expect(isIdnEmail('δοκιμή@example.com')).toBe(true);
    expect(isIdnEmail('"δοκιμή"@example.com')).toBe(true);
    // A fullwidth commercial at is not a separator.
    expect(isIdnEmail('user＠example.com')).toBe(false);
    // The ASCII form still rejects a non-ASCII local part.
    expect(isEmail('δοκιμή@example.com')).toBe(false);
  });

  it('mocks addresses that pass their own validator', () => {
    const mock = createMockDataFn<TF.EmailAddress>();
    for (let draw = 0; draw < 30; draw++) expect(isEmail(mock())).toBe(true);
  });
});

describe('time and date-time — RFC 3339', () => {
  it('requires two digits per segment', () => {
    expect(isTime('08:30:06Z')).toBe(true);
    expect(isTime('8:3:6Z')).toBe(false);
    expect(isTime('008:030:006Z')).toBe(false);
  });

  it('takes a second fraction of any length', () => {
    expect(isTime('23:20:50.52Z')).toBe(true);
    expect(isTime('08:30:06.283185Z')).toBe(true);
    expect(isDateTime('1985-04-12T00:59:59.999999999999999Z')).toBe(true);
  });

  it('allows a leap second only at the instant one exists', () => {
    expect(isTime('23:59:60Z')).toBe(true);
    expect(isTime('23:59:60+00:00')).toBe(true);
    // Same instant as 23:59:60Z once the offset is applied.
    expect(isTime('01:29:60+01:30')).toBe(true);
    expect(isTime('15:59:60-08:00')).toBe(true);
    // Not that instant.
    expect(isTime('22:59:60Z')).toBe(false);
    expect(isTime('23:58:60Z')).toBe(false);
    expect(isTime('23:59:60+01:00')).toBe(false);
    expect(isTime('00:00:61Z')).toBe(false);
  });

  it('reads the date-time separator either way round', () => {
    expect(isDateTime('1963-06-19T08:30:06.283185Z')).toBe(true);
    expect(isDateTime('1963-06-19t08:30:06.283185z')).toBe(true);
  });
});
