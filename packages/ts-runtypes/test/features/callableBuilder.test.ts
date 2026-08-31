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
// types now: distinct cache entries with IDENTICAL validator behavior. Both
// facts are pinned below.
//
// `createValidateFn` returns the cached factory for a structural id, so `toBe`
// (reference identity) is a same-id assertion (and `not.toBe` a distinct-id one).

import * as TF from '@mionjs/run-types/formats';
import {describe, expect, it} from 'vitest';
import {createValidateFn, type InferType} from '@mionjs/run-types';
import * as RT from '@mionjs/run-types/builders';

type CallableIface = {(a: number, b: boolean): string; extra: string};

describe('value-first callable builder', () => {
  const schema = RT.callable(RT.func({params: [TF.number(), RT.boolean()], ret: TF.string()}), RT.object({extra: TF.string()}));

  it('is a DISTINCT cache entry from the named type-first callable interface, with identical behavior', () => {
    const fromSchema = createValidateFn(schema);
    const fromType = createValidateFn<CallableIface>();
    // Param names are id-relevant; the named interface and the unnamed builder
    // form must NOT share a canonical node (per-site parameters[].name).
    expect(fromSchema).not.toBe(fromType);
    // ... while validating identically (params are behaviour-neutral).
    const fnWithExtra = Object.assign((_a: number, _b: boolean) => 'x', {extra: 'x'});
    expect(fromSchema(fnWithExtra)).toBe(true);
    expect(fromType(fnWithExtra)).toBe(true);
    expect(fromSchema({extra: 'x'})).toBe(false);
    expect(fromType({extra: 'x'})).toBe(false);
  });

  it('validates a callable interface (function value PLUS data props)', () => {
    const isCallable = createValidateFn(schema);
    // The call-signature half is notSupported (functions aren't validated): the
    // emitted validator checks `typeof === 'function'` PLUS the declared props.
    const fnWithExtra = Object.assign((_a: number, _b: boolean) => 'x', {extra: 'x'});
    expect(isCallable(fnWithExtra), 'function carrying extra').toBe(true);
    expect(isCallable({extra: 'x'}), 'plain object is not a function').toBe(false);
    const fnNoExtra = (_a: number, _b: boolean) => 'x';
    expect(isCallable(fnNoExtra), 'function missing the required extra prop').toBe(false);
  });

  it('InferType recovers the callable interface (assignment-equivalent)', () => {
    type Recovered = InferType<typeof schema>;
    const value: CallableIface = Object.assign((_a: number, _b: boolean) => 'x', {extra: 'x'});
    const fromType: Recovered = value; // type-first value -> recovered type
    const toType: CallableIface = fromType; // recovered type -> type-first
    expect([fromType, toType]).toBeDefined();
  });
});
