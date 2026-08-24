// cloning / Realworld — the payload case through the universal assert, plus
// two flow-level checks the case data can't express: an explicit
// mutate-every-position isolation proof, and the intended
// validate-then-clone pipeline.
import {describe, expect, it} from 'vitest';
import {createValidateFn} from '@ts-runtypes/core';
import {REALWORLD, makePayload, type Payload} from './Realworld.ts';
import {assertCloneCase} from '../../util/cloningAsserts.ts';

describe('cloning / Realworld', () => {
  for (const c of Object.values(REALWORLD)) {
    it(`clone - ${c.title}`, () => assertCloneCase(c));
  }

  it('mutating every position of the clone never touches the input', () => {
    const clone = REALWORLD.payload.clone();
    const input = makePayload(false);
    const out = clone(input) as Payload;
    out.id = 99;
    out.nested.tag = 'mutated';
    out.nested.when.setTime(0);
    out.tags.push('b');
    out.index.set('k2', 2);
    expect(input).toEqual(makePayload(false));
  });

  it('composes with validate for the parseSafe flow', () => {
    const validate = createValidateFn<Payload>();
    const clone = REALWORLD.payload.clone();
    const parseSafe = (v: unknown): Payload => {
      if (!validate(v)) throw new Error('wrong type');
      return clone(v) as Payload;
    };
    expect(parseSafe(makePayload(true))).toEqual(makePayload(false));
    expect(() => parseSafe({id: 'nope'})).toThrow();
  });
});
