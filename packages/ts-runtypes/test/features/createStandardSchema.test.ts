// End-to-end acceptance test for createStandardSchema<T>. Drives the FULL
// vite-plugin pipeline via vitest's vite integration: the plugin transforms
// this file, injecting the ARRAY of two entry tuples (val + verr) at the single
// trailing InjectTypeFnArgs<T,'val','verr'> slot; at runtime the factory
// resolves both compiled fns and builds the two-tier `validate`.
//
// Per the CLAUDE.md marker-coverage rule both call shapes are exercised — the
// static `createStandardSchema<T>()` form and the value-first
// `createStandardSchema(rt)` form — with a hash-equivalence assertion that the
// two forms resolve to behaviourally identical validators.

import {describe, test, expect} from 'vitest';
import {createStandardSchema} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/builders';
import * as TF from '@ts-runtypes/core/formats';
import type {StandardSchemaResult} from '@ts-runtypes/core';

// Our validate is always synchronous; this asserts that and narrows the
// `Result | Promise<Result>` return type to the plain Result the spec lets a
// sync-only implementer return.
function sync<T>(result: StandardSchemaResult<T> | Promise<StandardSchemaResult<T>>): StandardSchemaResult<T> {
  if (result instanceof Promise) throw new Error('createStandardSchema validate must be synchronous');
  return result;
}

describe('createStandardSchema<T> — Standard Schema v1 surface', () => {
  test('static form: ~standard metadata + success/failure results', () => {
    const schema = createStandardSchema<string>();
    expect(schema['~standard'].version).toBe(1);
    expect(schema['~standard'].vendor).toBe('ts-runtypes');

    expect(schema['~standard'].validate('abc')).toEqual({value: 'abc'});

    // Spec discrimination: a truthy `issues` is a failure.
    const result = sync(schema['~standard'].validate(42));
    expect(result.issues).toBeDefined();
    if (result.issues) {
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0].message).toBe('Expected string');
    }
  });

  test('value-first schema form validates object shapes with per-field issue paths', () => {
    const schema = createStandardSchema(RT.object({a: RT.boolean()}));

    expect(schema['~standard'].validate({a: true})).toEqual({value: {a: true}});

    const result = sync(schema['~standard'].validate({a: 'nope'}));
    expect(result.issues).toBeDefined();
    if (result.issues) {
      expect(result.issues[0].path).toEqual(['a']);
    }
  });

  test('success value is the input passed through (no coercion)', () => {
    const schema = createStandardSchema<{a: boolean}>();
    const input = {a: true};
    const result = sync(schema['~standard'].validate(input));
    expect(result.issues).toBeUndefined();
    if (!result.issues) expect(result.value).toBe(input);
  });

  // CLAUDE.md marker-coverage: hash-equivalence between the two call shapes.
  // The factory returns a fresh adapter object each call (so `.toBe` does not
  // apply), so assert BEHAVIOURAL convergence — both forms accept/reject the
  // same samples identically, proving they resolved the same compiled fns.
  test('static and value-first forms resolve equivalent validators', () => {
    const fromType = createStandardSchema<string>();
    const fromSchema = createStandardSchema(TF.string());
    for (const sample of ['abc', 42, undefined, null, {}, []]) {
      expect(fromType['~standard'].validate(sample)).toEqual(fromSchema['~standard'].validate(sample));
    }
  });
});
