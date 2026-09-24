// Override fixture for removeUnknownKeys and formatTransform, which the other suites do not cover standalone.
// Their distinct signatures do not fit OverrideCase, hence their own registrar (called from overrides.test.ts).

import {it, expect} from 'vitest';
import {
  createRemoveUnknownKeysFn,
  overrideRemoveUnknownKeys,
  createFormatTransformFn,
  overrideFormatTransform,
} from '@mionjs/run-types';

type CesTarget = {readonly __brand: 'cesOverride'; a: number};
overrideRemoveUnknownKeys<CesTarget>(() => ({cloned: true}) as never);

type FmtTarget = {readonly __brand: 'fmtOverride'; a: number};
overrideFormatTransform<FmtTarget>(() => ({fmt: true}) as never);

/** Registers the two object-family it()s (call inside a describe). */
export function registerObjectFnsCase(): void {
  it('ObjectFns — removeUnknownKeys', () => {
    const out = createRemoveUnknownKeysFn<CesTarget>()({a: 1} as never) as unknown as {cloned?: boolean};
    expect(out.cloned).toBe(true);
  });

  it('ObjectFns — formatTransform', () => {
    const out = createFormatTransformFn<FmtTarget>()({a: 1} as never) as {fmt?: boolean};
    expect(out.fmt).toBe(true);
  });
}
