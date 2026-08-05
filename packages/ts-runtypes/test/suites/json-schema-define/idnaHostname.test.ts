// The IDNA host-name engine, end-to-end through the door. `hostname` and
// `idn-hostname` share one set of pure fns (punycodeDecode / punycodeEncode /
// isIdnaLabel / satisfiesBidi / isIdnHostname), so these cover the rules that
// no pattern could express: decoding an A-label before judging its characters,
// the contextual rules that read a character's neighbours, and the
// bidirectional rule that reads every label at once.
import {describe, expect, it} from 'vitest';
import {createValidateFn, createMockDataFn, createGetValidationErrorsFn} from '@ts-runtypes/core';
import {runTypeFromJsonSchema} from '@ts-runtypes/core/json-schema';
import type * as TF from '@ts-runtypes/core/formats';

const isHostname = createValidateFn(runTypeFromJsonSchema({type: 'string', format: 'hostname'} as const));
const isIdnHostname = createValidateFn(runTypeFromJsonSchema({type: 'string', format: 'idn-hostname'} as const));

describe('hostname — RFC 1123 plus A-label decoding', () => {
  it('accepts a single label, which is where it differs from a domain', () => {
    expect(isHostname('localhost')).toBe(true);
    expect(isHostname('db1')).toBe(true);
    expect(isHostname('example.com')).toBe(true);
    expect(isHostname('sub.example.co.uk')).toBe(true);
  });

  it('applies the ordinary label rules', () => {
    expect(isHostname('-leading')).toBe(false);
    expect(isHostname('trailing-')).toBe(false);
    expect(isHostname('under_score')).toBe(false);
    expect(isHostname('.leading-dot')).toBe(false);
    expect(isHostname('trailing.dot.')).toBe(false);
    expect(isHostname('')).toBe(false);
    expect(isHostname(`${'a'.repeat(64)}.com`)).toBe(false);
    expect(isHostname(`${'a'.repeat(63)}.com`)).toBe(true);
  });

  it('decodes an xn-- label instead of taking it on trust', () => {
    // Valid punycode for a real Hangul name.
    expect(isHostname('xn--9n2bp8q.xn--9t4b11yi5a')).toBe(true);
    // Not decodable at all.
    expect(isHostname('xn--X')).toBe(false);
    // Decodes to a label whose first character is a combining mark.
    expect(isHostname('xn--hello-zed')).toBe(false);
  });

  it('rejects the wide stops, which are separators only for idn-hostname', () => {
    expect(isHostname('example．com')).toBe(false);
    expect(isIdnHostname('example．com')).toBe(true);
  });
});

describe('idn-hostname — the U-label rules', () => {
  it('accepts a name written in its own script', () => {
    expect(isIdnHostname('실례.테스트')).toBe(true);
    expect(isIdnHostname('a'.repeat(63))).toBe(true);
    expect(isIdnHostname('a'.repeat(64))).toBe(false);
  });

  it('applies the RFC 5892 exception tables', () => {
    // PVALID exceptions: these are allowed even though nothing derives them.
    expect(isIdnHostname('ßς་〇')).toBe(true);
    // DISALLOWED exceptions.
    expect(isIdnHostname('ـߺ')).toBe(false);
    expect(isIdnHostname('〱〲〳〴〵〮〯〻')).toBe(false);
  });

  it('reads a contextual character by its neighbours', () => {
    // MIDDLE DOT is only allowed between two 'l's.
    expect(isIdnHostname('l·l')).toBe(true);
    expect(isIdnHostname('a·l')).toBe(false);
    expect(isIdnHostname('l·a')).toBe(false);
    // Greek KERAIA must be followed by Greek; Hebrew GERESH must follow Hebrew.
    expect(isIdnHostname('α͵α')).toBe(true);
    expect(isIdnHostname('α͵S')).toBe(false);
    expect(isIdnHostname('א׳')).toBe(true);
    expect(isIdnHostname('a׳')).toBe(false);
    // KATAKANA MIDDLE DOT needs Hiragana, Katakana or Han in the label.
    expect(isIdnHostname('ヲ・ァ')).toBe(true);
    expect(isIdnHostname('abc・def')).toBe(false);
  });

  it('allows a joiner only where a joiner belongs', () => {
    // ZWJ / ZWNJ directly after a Virama.
    expect(isIdnHostname('क्‍ष')).toBe(true);
    expect(isIdnHostname('क्‌ष')).toBe(true);
    expect(isIdnHostname('क‍ष')).toBe(false);
    // ZWNJ also sits between joining letters, which Latin ones are not — and
    // EVERY occurrence has to qualify, not just the first.
    expect(isIdnHostname('بي‌بي')).toBe(true);
    expect(isIdnHostname('क्‌षx‌y')).toBe(false);
  });

  it('applies the bidirectional rule across the whole name', () => {
    // One RTL letter anywhere makes the whole name a Bidi domain.
    expect(isIdnHostname('א0٠')).toBe(false); // both digit kinds in one RTL label
    expect(isIdnHostname('0א')).toBe(false); // a digit-first label
    // A digit that merely lives in an RTL script is not an RTL letter.
    expect(isIdnHostname('۰0')).toBe(true);
  });

  it('requires an A-label to be the canonical spelling of what it decodes to', () => {
    // Decodes to pure ASCII, so the xn-- form should never have been used.
    expect(isIdnHostname('xn--example-')).toBe(false);
    // Decodes fine but is not the spelling punycode would produce for it.
    expect(isIdnHostname('xn---9uc')).toBe(false);
  });
});

describe('the engine through the other factories', () => {
  it('reports an error rather than throwing', () => {
    const errors = createGetValidationErrorsFn(runTypeFromJsonSchema({type: 'string', format: 'hostname'} as const));
    expect(errors('example.com')).toEqual([]);
    expect(errors('-nope').length).toBe(1);
  });

  it('mocks host names that pass their own validator', () => {
    const mockHostname = createMockDataFn<TF.Hostname>();
    const validateHostname = createValidateFn<TF.Hostname>();
    for (let draw = 0; draw < 50; draw++) expect(validateHostname(mockHostname())).toBe(true);

    const mockIdn = createMockDataFn<TF.IdnHostname>();
    const validateIdn = createValidateFn<TF.IdnHostname>();
    for (let draw = 0; draw < 50; draw++) expect(validateIdn(mockIdn())).toBe(true);
  });
});
