// Pins why RT-AGREE re-encodes through compact too: a loss clone and mutate share shows only against the compact wire.

import {describe, it, expect} from 'vitest';
import {checkRoundtrip, type RoundtripViolation} from './roundtripOracle.ts';
import type {CompiledCodecs, WiredCodec} from './roundtripHarness.ts';

type Pair = {a: number; b?: number};

// A keyed lane whose encoder forgets `b`, the loss under test.
const lossyKeyed: WiredCodec = {
  encode: (value) => JSON.stringify({a: (value as Pair).a}),
  decode: (wire) => JSON.parse(wire),
};
const positional: WiredCodec = {
  encode: (value) => JSON.stringify([(value as Pair).a, (value as Pair).b ?? null]),
  decode: (wire) => {
    const [a, b] = JSON.parse(wire) as [number, number | null];
    return b === null ? {a} : {a, b};
  },
};

function compiled(codecs: CompiledCodecs['codecs']): CompiledCodecs {
  const gen = {decls: [], root: {kind: 'object' as const, props: []}};
  return {
    gen,
    title: 'stub',
    source: '',
    diagnostics: [],
    errorDiagnostics: [],
    warningDiagnostics: [],
    fnSiteCount: 0,
    validate: () => true,
    codecs,
    wireErrors: {},
  };
}

function agreeViolations(codecs: CompiledCodecs['codecs']): RoundtripViolation[] {
  const out: RoundtripViolation[] = [];
  checkRoundtrip(compiled(codecs), {a: 1, b: 2}, 1, out);
  return out.filter((violation) => violation.oracle === 'RT-AGREE');
}

describe('RT-AGREE reference encoders', () => {
  it('a loss clone and mutate share is caught by the compact reference', () => {
    const violations = agreeViolations({clone: lossyKeyed, mutate: lossyKeyed, compact: positional});
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.every((violation) => violation.message.includes('disagrees with compact'))).toBe(true);
  });

  it('without the compact lane the same loss goes unseen', () => {
    expect(agreeViolations({clone: lossyKeyed, mutate: lossyKeyed})).toEqual([]);
  });
});
