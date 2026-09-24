// Type-level guard for the InjectTypeFnArgs fn-key arity: markers.ts stands `F1`…`F12` in for "any list"
// because a TS alias cannot be variadic. Every other test resolves an INDEPENDENT overlay copy of the marker,
// so only this file catches a narrowing of the real `@mionjs/run-types` type: it reaches src/index.ts through
// the `source` condition the package tsconfig declares, so a narrowing fails `typecheck:test` and CI.
import {describe, expect, it} from 'vitest';
import type {InjectTypeFnArgs} from '@mionjs/run-types';

// SIX distinct families — comfortably past the retired three-key cap. If
// markers.ts is narrowed below six type parameters, this alias reports
// "Expected N type arguments, but got 7" and the typecheck fails.
type SixFamilyMarker = InjectTypeFnArgs<
  {id: number},
  'validationErrors',
  'jsonDecoder',
  'jsonEncoder',
  'validateStrict',
  'removeUnknownKeys',
  'validationErrorsStrict'
>;

// A twelve-family alias pins the current F12 cap boundary (all distinct). It is
// well beyond any realistic marker but proves the full declared arity resolves.
type TwelveFamilyMarker = InjectTypeFnArgs<
  {id: number},
  'validate',
  'validationErrors',
  'jsonDecoder',
  'jsonEncoder',
  'validateStrict',
  'removeUnknownKeys',
  'validationErrorsStrict',
  'restoreFromJsonClone',
  'formatTransform',
  'compactForJson',
  'compactFromJson',
  'prepareForJsonMutate'
>;

// Instantiate the aliases so the arity is actually checked (a bare unused type
// alias can be under-checked). The marker's declared type is `string & {brand}`,
// so a plain string satisfies it.
const sixFamilyGuard: SixFamilyMarker = 'six' as SixFamilyMarker;
const twelveFamilyGuard: TwelveFamilyMarker = 'twelve' as TwelveFamilyMarker;

describe('InjectTypeFnArgs fn-key arity (real @mionjs/run-types type)', () => {
  it('accepts far more than three families (regression guard, enforced at typecheck:test)', () => {
    // The real assertion is the typecheck above; these keep the file a live test
    // and stop the guards being tree-shaken as unused.
    expect(typeof sixFamilyGuard).toBe('string');
    expect(typeof twelveFamilyGuard).toBe('string');
  });
});
