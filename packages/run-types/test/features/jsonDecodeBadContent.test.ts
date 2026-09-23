// Pins the decoder contract for a WELL-SHAPED wire value with bad content: a wrong shape is left for validate to
// refuse (jsonDecodeWireForm.test.ts pins the arms), bad content (`"12x"` for a bigint) throws or yields a value
// validate refuses, and nesting past the engine stack makes validate throw RangeError promptly. The plain decoders
// carry no try/catch on purpose (the hot path).

import {describe, expect, it} from 'vitest';
import {createJsonDecoderFn, createJsonEncoderFn, createValidateFn} from '@mionjs/run-types';

interface Wire {
  big: bigint;
  when: Date;
  instant: Temporal.Instant;
  day: Temporal.PlainDate;
  tags: Set<string>;
  lookup: Map<string, number>;
  either: Date | bigint;
  box?: Wire;
}

// The valid wire comes from the encoder itself, so the union envelope carries
// whatever member index the build assigned to Date.
const encode = createJsonEncoderFn<Wire>();
const valid = JSON.parse(
  encode({
    big: 42n,
    when: new Date('2024-01-01T00:00:00.000Z'),
    instant: Temporal.Instant.from('1970-01-01T00:00:00Z'),
    day: Temporal.PlainDate.from('2024-02-29'),
    tags: new Set(['a']),
    lookup: new Map([['k', 1]]),
    either: new Date('2024-01-01T00:00:00.000Z'),
  }) as string
) as Record<string, unknown>;
const dateIndex = (valid.either as [number, string])[0];
const otherIndex = dateIndex === 0 ? 1 : 0;

const validate = createValidateFn<Wire>();
const decoders = {
  strip: createJsonDecoderFn<Wire>(undefined, {strategy: 'strip'}),
  preserve: createJsonDecoderFn<Wire>(undefined, {strategy: 'preserve'}),
};

// [field, bad content, what a plain decoder does with it]
const cases: Array<[keyof Wire, unknown, 'throws' | 'validate-refuses']> = [
  // BigInt() itself takes '', ' 42 ', '0x1f' and '1e3' (BigInt('') is 0n),
  // so the arm converts only the exact decimal wire form or a whole number.
  ['big', '12x', 'validate-refuses'],
  ['big', 1.5, 'validate-refuses'],
  ['big', '', 'validate-refuses'],
  ['big', ' 42 ', 'validate-refuses'],
  ['big', '0x1f', 'validate-refuses'],
  ['big', '1e3', 'validate-refuses'],
  ['when', 'garbage', 'validate-refuses'],
  ['when', '', 'validate-refuses'],
  ['instant', 'nope', 'throws'],
  ['instant', '2024-13-45T99:99:99Z', 'throws'],
  ['day', 'not-a-date', 'throws'],
  ['day', '2024-02-30', 'throws'],
  ['tags', [1, 2], 'validate-refuses'],
  ['lookup', [['k', 'v']], 'validate-refuses'],
  ['lookup', [[1]], 'validate-refuses'],
  ['either', [dateIndex, 'garbage'], 'validate-refuses'],
  ['either', [otherIndex, 'garbage'], 'validate-refuses'],
  ['either', null, 'throws'],
  ['either', [9, '1'], 'throws'],
];

describe('a well-shaped wire value with bad content', () => {
  it('the valid wire round-trips and validates', () => {
    for (const decode of Object.values(decoders)) expect(validate(decode(JSON.stringify(valid)))).toBe(true);
  });

  for (const [field, bad, outcome] of cases) {
    const body = () => ({...structuredClone(valid), [field]: bad});

    it(`${field} = ${JSON.stringify(bad)}: no plain decoder returns a value validate accepts`, () => {
      for (const [name, decode] of Object.entries(decoders)) {
        let value: unknown;
        let threw = false;
        try {
          value = decode(JSON.stringify(body()));
        } catch {
          threw = true;
        }
        if (outcome === 'throws') {
          expect(threw, `${name} decoder should throw`).toBe(true);
          continue;
        }
        expect(threw, `${name} decoder should leave the value for validate`).toBe(false);
        expect(validate(value), `${name} decoder output must not validate`).toBe(false);
      }
    });
  }
});

describe('nesting deeper than the engine stack', () => {
  interface Chain {
    n: number;
    next?: Chain;
  }
  const validateChain = createValidateFn<Chain>();

  function deepChain(depth: number): Chain {
    const root: Chain = {n: 0};
    let cursor = root;
    for (let i = 1; i < depth; i++) {
      const next: Chain = {n: i};
      cursor.next = next;
      cursor = next;
    }
    return root;
  }

  it('a shallow chain validates', () => {
    expect(validateChain(deepChain(100))).toBe(true);
  });

  it('validate throws RangeError promptly rather than hanging', () => {
    const started = performance.now();
    expect(() => validateChain(deepChain(500_000))).toThrow(RangeError);
    expect(performance.now() - started).toBeLessThan(5_000);
  });
});
