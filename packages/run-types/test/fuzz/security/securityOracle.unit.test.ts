// Negative controls for the security oracles (the iron rule: a red lane must
// mean a real bug, so every oracle is proven to FIRE on a deliberately broken
// decoder).

import {describe, expect, it} from 'vitest';
import {
  checkJsonDecode,
  checkPrototypes,
  checkGlobals,
  snapshotGlobals,
  checkFormatCall,
  type SecurityViolation,
} from './securityOracle.ts';
import {defineOwn} from './attackDictionary.ts';

const ctx = {target: 'control', seed: 0x1234};

const oracles = (violations: SecurityViolation[]): string[] => violations.map((v) => v.oracle);

describe('SJ oracles fire on broken JSON decoders (negative controls)', () => {
  const identity = (text: string): unknown => JSON.parse(text);
  const accepting = (): boolean => true;

  it('SJ-PROTO fires on a polluted result', () => {
    const polluter = (): unknown => {
      const out: Record<string, unknown> = {};
      out['__proto__'] = {polluted: true};
      return out;
    };
    const result = checkJsonDecode({decoders: {bad: polluter}, validate: accepting}, {id: 'x', expect: 'any', text: '{}'}, ctx);
    expect(oracles(result.violations)).toEqual(['SJ-PROTO']);
  });

  it('SJ-PROTO fires when an encoder writes a prototype-named key back onto the wire', () => {
    const result = checkJsonDecode(
      {
        decoders: {ok: () => ({a: 1})},
        validate: accepting,
        encoders: {bad: () => '{"a":1,"nested":{"__proto__":{"polluted":true}}}'},
      },
      {id: 'object.proto-key', expect: 'any', text: '{}'},
      ctx
    );
    expect(oracles(result.violations)).toEqual(['SJ-PROTO']);
    expect(result.violations[0].message).toContain("'__proto__'");
  });

  it('SJ-PROTO fires when the clone of a decoded value carries a foreign prototype', () => {
    const polluter = (): unknown => {
      const out: Record<string, unknown> = {};
      out['__proto__'] = {polluted: true};
      return out;
    };
    const result = checkJsonDecode(
      {decoders: {ok: () => ({a: 1})}, validate: accepting, clone: polluter},
      {id: 'record.proto-key', expect: 'any', text: '{}'},
      ctx
    );
    expect(oracles(result.violations)).toEqual(['SJ-PROTO']);
    expect(result.violations[0].message).toContain('ok→clone');
  });

  it('SJ-PROTO stays quiet on an own __proto__ key, a class instance, Map/Set/Date and null prototypes', () => {
    class Point {
      x = 1;
    }
    const out: SecurityViolation[] = [];
    checkPrototypes(defineOwn({}, '__proto__', {polluted: true}), 'p', 'x', ctx, out, '');
    checkPrototypes(new Point(), 'p', 'x', ctx, out, '');
    checkPrototypes({a: new Map([[1, new Set([new Date()])]]), b: Object.create(null)}, 'p', 'x', ctx, out, '');
    expect(out).toEqual([]);
  });

  it('SJ-REJECT fires when a decoder turns a rejected payload into an accepted value', () => {
    const result = checkJsonDecode(
      {decoders: {lenient: identity}, validate: accepting},
      {id: 'x', expect: 'reject', text: '"wrong"'},
      ctx
    );
    expect(oracles(result.violations)).toEqual(['SJ-REJECT']);
  });

  it('a decoder throw is a histogram entry, not a violation', () => {
    const throwing = (): unknown => {
      throw new RangeError('nope');
    };
    const result = checkJsonDecode({decoders: {t: throwing}, validate: accepting}, {id: 'x', expect: 'reject', text: '1'}, ctx);
    expect(result.violations).toEqual([]);
    expect(result.throws).toEqual({'t:RangeError': 1});
  });

  it('SJ-GLOBAL fires when Object.prototype gained a key', () => {
    const before = snapshotGlobals();
    (Object.prototype as unknown as Record<string, unknown>).zzSecurityCanary = 1;
    try {
      expect(checkGlobals(before, 'x', ctx)?.oracle).toBe('SJ-GLOBAL');
    } finally {
      delete (Object.prototype as unknown as Record<string, unknown>).zzSecurityCanary;
    }
    expect(checkGlobals(before, 'x', ctx)).toBeNull();
  });
});

describe('SF oracles fire on a slow or throwing validator (negative controls)', () => {
  it('SF-PATTERN-TIME fires on catastrophic backtracking', () => {
    // 2^24 backtracking steps: a few hundred ms, well past the 250 ms budget
    // and well short of the test timeout.
    const evil = /^(a+)+$/;
    const result = checkFormatCall('evil', (s) => evil.test(s), 'a'.repeat(24) + '!', 'pump', ctx, 'SF-PATTERN-TIME');
    expect(oracles(result.violations)).toContain('SF-PATTERN-TIME');
  }, 60_000);

  it('SF-TOTAL fires on a throw and on a non-boolean', () => {
    const throwing = checkFormatCall(
      't',
      () => {
        throw new Error('x');
      },
      'in',
      'pump',
      ctx,
      'SF-TIME'
    );
    expect(oracles(throwing.violations)).toEqual(['SF-TOTAL']);
    const stringy = checkFormatCall('s', () => 'yes', 'in', 'pump', ctx, 'SF-TIME');
    expect(oracles(stringy.violations)).toEqual(['SF-TOTAL']);
  });

  it('stays quiet on a linear validator', () => {
    const result = checkFormatCall('ok', (s) => s.length > 0, 'a'.repeat(65536), 'pump', ctx, 'SF-TIME');
    expect(result.violations).toEqual([]);
  });
});
