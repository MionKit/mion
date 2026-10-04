// One injected tuple array supplies validation and errors; both forms must behave equally (AGENTS.md marker coverage).

import {describe, test, expect} from 'vitest';
import {createStandardSchema} from '@mionjs/run-types';
import * as RT from '@mionjs/run-types/builders';
import * as TF from '@mionjs/run-types/formats';
import type {StandardSchemaResult} from '@mionjs/run-types';

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
    expect(schema['~standard'].vendor).toBe('mion');

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

  // Fresh adapter objects require behavior comparison rather than identity (AGENTS.md marker coverage).
  test('static and value-first forms resolve equivalent validators', () => {
    const fromType = createStandardSchema<string>();
    const fromSchema = createStandardSchema(TF.string());
    for (const sample of ['abc', 42, undefined, null, {}, []]) {
      expect(fromType['~standard'].validate(sample)).toEqual(fromSchema['~standard'].validate(sample));
    }
  });
});
