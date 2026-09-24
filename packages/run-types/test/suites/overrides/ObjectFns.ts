// Override fixture for the unknown-keys group and formatTransform, which the other suites do not cover standalone.
// Their distinct signatures do not fit OverrideCase, hence their own registrar (called from overrides.test.ts).

import {it, expect} from 'vitest';
import {
  createHasUnknownKeysFn,
  overrideHasUnknownKeys,
  createRemoveUnknownKeysFn,
  overrideRemoveUnknownKeys,
  createUnknownKeyErrorsFn,
  overrideUnknownKeyErrors,
  createFormatTransformFn,
  overrideFormatTransform,
} from '@mionjs/run-types';

type HukTarget = {readonly __brand: 'hukOverride'; a: number};
overrideHasUnknownKeys<HukTarget>((v) => (v as {x?: number}).x === 1);

type CesTarget = {readonly __brand: 'cesOverride'; a: number};
overrideRemoveUnknownKeys<CesTarget>(() => ({cloned: true}) as never);

type UkeTarget = {readonly __brand: 'ukeOverride'; a: number};
overrideUnknownKeyErrors<UkeTarget>((value, path, errors) => {
  const out = errors ?? [];
  out.push({path: path ?? [], expected: 'override'} as never);
  return out;
});

type FmtTarget = {readonly __brand: 'fmtOverride'; a: number};
overrideFormatTransform<FmtTarget>(() => ({fmt: true}) as never);

/** Registers the four object-family it()s (call inside a describe). */
export function registerObjectFnsCase(): void {
  it('ObjectFns — hasUnknownKeys', () => {
    const huk = createHasUnknownKeysFn<HukTarget>();
    expect(huk({x: 1} as never)).toBe(true);
    expect(huk({x: 2} as never)).toBe(false);
  });

  it('ObjectFns — removeUnknownKeys', () => {
    const out = createRemoveUnknownKeysFn<CesTarget>()({a: 1} as never) as unknown as {cloned?: boolean};
    expect(out.cloned).toBe(true);
  });

  it('ObjectFns — unknownKeyErrors', () => {
    const errors = createUnknownKeyErrorsFn<UkeTarget>()({a: 1} as never);
    expect(errors).toHaveLength(1);
    expect((errors[0] as {expected?: string}).expected).toBe('override');
  });

  it('ObjectFns — formatTransform', () => {
    const out = createFormatTransformFn<FmtTarget>()({a: 1} as never) as {fmt?: boolean};
    expect(out.fmt).toBe(true);
  });
}
