// Marker calls in function-argument position — regression for two marker calls
// with the same typeid in one statement not being injected.
//
// A `getRunTypeId<T>()` call returns the branded `InjectRunTypeId<T>` handle, so
// when it is the argument to a GENERIC function the function's type parameter
// infers that branded type. vitest's `expect` is exactly such a function:
// `expect(getRunTypeId<T>())` is `Assertion<InjectRunTypeId<T>>`, and
// `Assertion<U>.toBe(expected: U)` instantiates `expected` to `InjectRunTypeId<T>`.
// The scanner's enclosedByInjectionMarker used to match `.toBe` off that RESOLVED
// parameter type and treat it as an enclosing marker — silently dropping the
// injection on BOTH inner `getRunTypeId` calls, which then threw "no id injected"
// at runtime. The fix gates enclosure on the WRITTEN annotation (`expected: U` is
// not a marker), so a passer-through never swallows its argument's injection.
//
// This is the exact reported shape, driven through the real vitest matchers.
// (Marker rule: both call shapes — static <T>() and reflection — plus a paired
// hash-equivalence assertion.)
import {describe, it, expect} from 'vitest';
import {getRunTypeId} from '@mionjs/run-types';

describe('markers in expect(...).toBe(...) argument position', () => {
  it('(static) expect(marker).toBe(marker) injects BOTH calls and runs without throwing', () => {
    // Known-good baseline on its own statement (never affected by the bug).
    const direct = getRunTypeId<{q: number}>();
    expect(typeof direct).toBe('string');
    expect(direct.length).toBeGreaterThan(0);
    // The reported failing shape: a marker in the expect() arg AND the toBe() arg.
    // Pre-fix both were dropped ("no id injected"); now both resolve to `direct`.
    expect(getRunTypeId<{q: number}>()).toBe(getRunTypeId<{q: number}>());
    expect(getRunTypeId<{q: number}>()).toBe(direct);
  });

  it('(reflect) expect(marker).toBe(marker) injects BOTH calls with T inferred from a value', () => {
    const value = {q: 1};
    const direct = getRunTypeId(value);
    expect(typeof direct).toBe('string');
    expect(getRunTypeId(value)).toBe(getRunTypeId(value));
    expect(getRunTypeId(value)).toBe(direct);
  });

  it('(paired) the static and reflection forms converge on the same id in arg position', () => {
    const value: {q: number} = {q: 1};
    // Both forms sit in expect() arg position, the shape that used to drop them.
    expect(getRunTypeId<{q: number}>()).toBe(getRunTypeId(value));
  });

  it('two DIFFERENT-type markers in expect().not.toBe() both inject (distinct ids)', () => {
    expect(getRunTypeId<{q: number}>()).not.toBe(getRunTypeId<{r: string}>());
  });

  it('marker in a nested-scope one-liner assertion (the it() callback body)', () => {
    // The original todo framed this as a "same type twice in one statement inside
    // a nested scope" problem; the real trigger was arg-position, reproduced here.
    const assertSame = (): void => expect(getRunTypeId<{n: number}>()).toBe(getRunTypeId<{n: number}>());
    expect(assertSame).not.toThrow();
  });
});
