// A written any or unknown is data, kept for third-party types: every family accepts it at every position.

import {describe, expect, it} from 'vitest';
import {
  createValidateFn,
  createGetValidationErrorsFn,
  createJsonEncoderFn,
  createJsonDecoderFn,
  createRemoveUnknownKeysFn,
} from '@mionjs/run-types';

type Loose = {
  a: any;
  b?: unknown;
  list: unknown[];
  map: Map<string, any>;
  record: {[key: string]: unknown};
  either: any | number;
};

interface LooseFns {
  isValid: (value: unknown) => boolean;
  errors: (value: unknown) => unknown[];
  roundTrip: (value: Loose) => unknown;
  strip: (value: Loose) => unknown;
}

// JSON-safe values, so a round trip must give each one back.
const samples: Loose[] = [
  {a: 1, list: [], map: new Map(), record: {}, either: 2},
  {
    a: {deep: [1, 'x', null]},
    b: 'text',
    list: [1, 'x', {y: true}],
    map: new Map([['k', {v: 1}]]),
    record: {r: [1]},
    either: 'any',
  },
  {a: null, b: null, list: [null], map: new Map([['k', null]]), record: {r: false}, either: null},
];

function expectAccepted({isValid, errors, roundTrip, strip}: LooseFns) {
  for (const sample of samples) {
    expect(isValid(sample)).toBe(true);
    expect(errors(sample)).toEqual([]);
    expect(roundTrip(sample)).toEqual(sample);
    expect(strip(sample)).toEqual(sample);
  }
  expect(isValid({...samples[0], a: undefined})).toBe(true);
  const {a: _a, ...withoutA} = samples[0];
  expect(isValid(withoutA), 'a required any member still needs its key').toBe(false);
  expect(errors(withoutA)).not.toEqual([]);
}

describe('a written any or unknown is accepted at every position', () => {
  it('in every family (static)', () => {
    const encode = createJsonEncoderFn<Loose>();
    const decode = createJsonDecoderFn<Loose>();
    expectAccepted({
      isValid: createValidateFn<Loose>(),
      errors: createGetValidationErrorsFn<Loose>(),
      roundTrip: (value) => decode(JSON.parse(JSON.stringify(encode(value)))),
      strip: createRemoveUnknownKeysFn<Loose>(),
    });
  });

  it('in every family (value)', () => {
    const sample = samples[0];
    const encode = createJsonEncoderFn(sample);
    const decode = createJsonDecoderFn(sample);
    expectAccepted({
      isValid: createValidateFn(sample),
      errors: createGetValidationErrorsFn(sample),
      roundTrip: (value) => decode(JSON.parse(JSON.stringify(encode(value)))),
      strip: createRemoveUnknownKeysFn(sample),
    });
  });
});
