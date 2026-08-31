// Regression for the verr/validate record-vs-array disagreement.
//
// The invariant: createValidateFn<T>() and createGetValidationErrorsFn<T>() must
// ALWAYS agree — for every value v, `validate(v) === (getValidationErrors(v).length === 0)`
// (fuzz oracle O4). It broke for record / index-signature types fed a
// non-plain-object input: `validate([])` correctly returned false (an array is
// not a valid `Record<string, T>`), but `getValidationErrors([])` returned zero
// errors — a `for...in` over an empty array enumerates no own string keys, so
// the per-key value check was vacuously satisfied. `validate` carried a
// plain-object brand guard for index-signature objects; `getValidationErrors`
// did not.
//
// Drives the full vite-plugin pipeline, complementing the Go emitter test in
// internal/cachegen/typefunctions/index_sig_array_reject_test.go.

import {describe, test, expect} from 'vitest';
import {createValidateFn, createGetValidationErrorsFn} from '@mionjs/run-types';

describe('verr/validate agreement on non-plain-object inputs to record types (O4)', () => {
  test('Record<string, number> — [] is the minimal disagreement repro', () => {
    const validate = createValidateFn<Record<string, number>>();
    const errors = createGetValidationErrorsFn<Record<string, number>>();
    // Before the fix: validate=false but errors returned [] (0 errors) → O4 violated.
    expect(validate([])).toBe(false);
    expect(errors([])).toEqual([{path: [], expected: 'objectLiteral'}]);
  });

  test('Record<string, number> — reflect form agrees too', () => {
    const rec: Record<string, number> = {};
    const validate = createValidateFn(rec);
    const errors = createGetValidationErrorsFn(rec);
    expect(validate([])).toBe(false);
    expect(errors([]).length).toBeGreaterThan(0);
  });

  test('Record<string, number> — full repro table', () => {
    const validate = createValidateFn<Record<string, number>>();
    const errors = createGetValidationErrorsFn<Record<string, number>>();

    // {} — valid (an empty record)
    expect(validate({})).toBe(true);
    expect(errors({})).toEqual([]);

    // {k: <good>} — valid
    expect(validate({k: 1})).toBe(true);
    expect(errors({k: 1})).toEqual([]);

    // {k: <bad>} — one error at the key's path
    expect(validate({k: 'nope' as unknown as number})).toBe(false);
    expect(errors({k: 'nope' as unknown as number})).toEqual([{path: ['k'], expected: 'number'}]);

    // [] — rejected (was the bug: errors under-reported)
    expect(validate([])).toBe(false);
    expect(errors([])).toEqual([{path: [], expected: 'objectLiteral'}]);
  });

  test('Record<string, Date> — full repro table', () => {
    const validate = createValidateFn<Record<string, Date>>();
    const errors = createGetValidationErrorsFn<Record<string, Date>>();
    const good = new Date('2020-01-01T00:00:00.000Z');

    expect(validate({})).toBe(true);
    expect(errors({})).toEqual([]);

    expect(validate({k: good})).toBe(true);
    expect(errors({k: good})).toEqual([]);

    expect(validate({k: 'not-a-date' as unknown as Date})).toBe(false);
    expect(errors({k: 'not-a-date' as unknown as Date})).toEqual([{path: ['k'], expected: 'date'}]);

    expect(validate([])).toBe(false);
    expect(errors([])).toEqual([{path: [], expected: 'objectLiteral'}]);
  });

  // The O4 invariant, asserted directly over a battery of non-plain-object
  // inputs — the shapes the type-fuzz soak flattened to `{}` / `[]` at seeds
  // 634470631 (Rec<Date>), 2251443285 (Rec<Set<…>>), 1320769502 (Rec<Rec<…[]>>).
  test('validate and getValidationErrors agree on every non-plain-object input', () => {
    const inputs: unknown[] = [
      {},
      {k: 1},
      {k: 'bad'},
      [],
      [1, 2, 3],
      new Date('2020-01-01T00:00:00.000Z'),
      new Map<string, number>([['k', 1]]),
      new Set<number>([1, 2]),
      Object.create(null) as object,
      null,
      undefined,
      42,
      'string',
    ];
    const validate = createValidateFn<Record<string, number>>();
    const errors = createGetValidationErrorsFn<Record<string, number>>();
    for (const input of inputs) {
      const ok = validate(input);
      const errs = errors(input);
      const noErrors = Array.isArray(errs) && errs.length === 0;
      expect(ok, `O4: validate=${ok} but getValidationErrors returned ${errs.length} error(s) for ${describe0(input)}`).toBe(
        noErrors
      );
    }
  });
});

/** Compact label for an assertion message — avoids JSON.stringify choking on a
 *  Map / Set / null-proto object. */
function describe0(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return `array(len=${value.length})`;
  if (value instanceof Date) return 'Date';
  if (value instanceof Map) return 'Map';
  if (value instanceof Set) return 'Set';
  return typeof value === 'object' ? 'object' : `${typeof value}(${String(value)})`;
}
