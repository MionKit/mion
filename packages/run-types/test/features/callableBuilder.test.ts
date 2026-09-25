// `RT.callable` is a TS intersection that the Go scanner projects as one object literal (see src/builders/compose.ts).
// Param names are id-relevant and `RT.func` leaves them unnamed, so it gets a distinct id from the named interface.
// A callable interface is not data, so validate refuses both forms at the root (VL003).

import * as TF from '@mionjs/run-types/formats';
import {describe, expect, it} from 'vitest';
import {createValidateFn, getRunTypeId, type InferType} from '@mionjs/run-types';
import * as RT from '@mionjs/run-types/builders';

type CallableIface = {(a: number, b: boolean): string; extra: string};

describe('value-first callable builder', () => {
  const schema = RT.callable(RT.func({params: [TF.number(), RT.boolean()], ret: TF.string()}), RT.object({extra: TF.string()}));

  it('is a DISTINCT type id from the named type-first callable interface', () => {
    expect(getRunTypeId(schema)).not.toBe(getRunTypeId<CallableIface>());
  });

  it('refuses a callable interface at the root, in both forms', () => {
    // @mion-downgrade-error VL003
    expect(() => createValidateFn(schema)).toThrow(/VL003/);
    // @mion-downgrade-error VL003
    expect(() => createValidateFn<CallableIface>()).toThrow(/VL003/);
  });

  it('InferType recovers the callable interface (assignment-equivalent)', () => {
    type Recovered = InferType<typeof schema>;
    const value: CallableIface = Object.assign((_a: number, _b: boolean) => 'x', {extra: 'x'});
    const fromType: Recovered = value; // type-first value -> recovered type
    const toType: CallableIface = fromType; // recovered type -> type-first
    expect([fromType, toType]).toBeDefined();
  });
});
