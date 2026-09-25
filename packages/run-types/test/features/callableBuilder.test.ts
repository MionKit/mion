// Value-first callable-interface builder — `RT.callable(func, object)` mixes a
// call-signature schema with an interface's data properties to author a value
// that is BOTH callable AND carries data props, e.g.
// `{(a: number, b: boolean): string; extra: string}`. The mix is an intersection
// (TS can't express a single object literal with a call signature + mapped props),
// but the Go scanner projects it as an object literal carrying the call signature
// + members. See src/builders/compose.ts.
//
// Signature param NAMES are id-relevant (`parameters[].name` must be per-site
// reliable), and TS call-signature syntax REQUIRES param names while `RT.func` brands an
// unnamed positional expansion — so the two forms are informationally different
// types now: distinct type ids. A callable interface is not data, so validate refuses both forms at the root (VL003).

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
