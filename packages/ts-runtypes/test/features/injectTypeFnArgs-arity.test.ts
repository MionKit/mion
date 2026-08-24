// Type-level regression guard for the InjectTypeFnArgs fn-key arity.
//
// markers.ts widened the marker from a fixed three keys to `F1`…`F12` (a TS type
// alias cannot be variadic, so this generous fixed arity stands in for "any
// list"). Every devtools / resolver / third-party test resolves an INDEPENDENT
// overlay copy of the marker, so none of them would catch a narrowing of the
// real `@ts-runtypes/core` type. This file does: it resolves the marker from the
// package's own `src/index.ts` via the `source` exports condition (the marker
// package's `tsconfig.test.json` sets `customConditions: ["source"]`), so
// narrowing `markers.ts` below the arity below fails `pnpm --filter
// @ts-runtypes/core typecheck:test` — which `pnpm run typecheck` and CI run.
import {describe, expect, it} from 'vitest';
import type {InjectTypeFnArgs} from '@ts-runtypes/core';

// SIX distinct families — comfortably past the retired three-key cap. If
// markers.ts is narrowed below six type parameters, this alias reports
// "Expected N type arguments, but got 7" and the typecheck fails.
type SixFamilyMarker = InjectTypeFnArgs<{id: number}, 'verr', 'jsonDecoder', 'jsonEncoder', 'huk', 'suk', 'uke'>;

// A twelve-family alias pins the current F12 cap boundary (all distinct). It is
// well beyond any realistic marker but proves the full declared arity resolves.
type TwelveFamilyMarker = InjectTypeFnArgs<
  {id: number},
  'val',
  'verr',
  'jsonDecoder',
  'jsonEncoder',
  'huk',
  'suk',
  'uke',
  'uku',
  'fmt',
  'tb',
  'fb',
  'pj'
>;

// Instantiate the aliases so the arity is actually checked (a bare unused type
// alias can be under-checked). The marker's declared type is `string & {brand}`,
// so a plain string satisfies it.
const sixFamilyGuard: SixFamilyMarker = 'six' as SixFamilyMarker;
const twelveFamilyGuard: TwelveFamilyMarker = 'twelve' as TwelveFamilyMarker;

describe('InjectTypeFnArgs fn-key arity (real @ts-runtypes/core type)', () => {
  it('accepts far more than three families (regression guard, enforced at typecheck:test)', () => {
    // The real assertion is the typecheck above; these keep the file a live test
    // and stop the guards being tree-shaken as unused.
    expect(typeof sixFamilyGuard).toBe('string');
    expect(typeof twelveFamilyGuard).toBe('string');
  });
});
