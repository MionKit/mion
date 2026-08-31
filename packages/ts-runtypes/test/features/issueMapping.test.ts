// Unit test for the pure RTValidationError -> Standard Schema Issue mapping. No
// marker calls, so the plugin never transforms this file — it exercises
// `runTypeErrorsToIssues` directly over hand-built error arrays.
//
// This is the INDEPENDENT check on the mapping itself (message + path
// derivation). It is not the only guard: each validation / format-validation
// suite file also hand-authors getExpectedStandardErrors on one case, so any
// change to how we GENERATE errors (the Go validator/validationErrors emitters)
// OR how we MAP them to issues here will also fail those individual suite cases.
// So a change to the error format must update BOTH this file and those pins.

import {describe, test, expect} from 'vitest';
import {runTypeErrorsToIssues} from '@mionjs/run-types';
import type {RTValidationError} from '@mionjs/run-types';

describe('runTypeErrorsToIssues', () => {
  test('string / number path segments pass through as PropertyKeys', () => {
    const errs: RTValidationError[] = [{path: ['profile', 'age'], expected: 'number'}];
    expect(runTypeErrorsToIssues(errs)).toEqual([{message: 'Expected number', path: ['profile', 'age'], expected: 'number'}]);
  });

  test('array index segment stays a numeric PropertyKey', () => {
    const errs: RTValidationError[] = [{path: ['tags', 2], expected: 'string'}];
    expect(runTypeErrorsToIssues(errs)[0].path).toEqual(['tags', 2]);
  });

  test('Map entry segment passes through unchanged (index key + failed role)', () => {
    const errs: RTValidationError[] = [{path: ['m', {key: 0, failed: 'mapValue'}], expected: 'number'}];
    expect(runTypeErrorsToIssues(errs)[0].path).toEqual(['m', {key: 0, failed: 'mapValue'}]);
  });

  test('Set entry segment passes through unchanged (index key + setKey role)', () => {
    const errs: RTValidationError[] = [{path: ['s', {key: 0, failed: 'setKey'}], expected: 'string'}];
    expect(runTypeErrorsToIssues(errs)[0].path).toEqual(['s', {key: 0, failed: 'setKey'}]);
  });

  test('format constraint with a primitive bound names the constraint + bound', () => {
    const errs: RTValidationError[] = [
      {path: ['name'], expected: 'string', format: {name: 'stringFormat', val: 3, formatPath: ['minLength']}},
    ];
    expect(runTypeErrorsToIssues(errs)[0].message).toBe('Failed minLength constraint (3)');
  });

  test('format constraint with a non-primitive bound omits the bound', () => {
    const errs: RTValidationError[] = [
      {path: ['x'], expected: 'string', format: {name: 'pattern', val: [], formatPath: ['pattern']}},
    ];
    expect(runTypeErrorsToIssues(errs)[0].message).toBe('Failed pattern constraint');
  });

  test('format with no formatPath tail falls back to the format name', () => {
    const errs: RTValidationError[] = [{path: [], expected: 'string', format: {name: 'uuid', val: true, formatPath: []}}];
    expect(runTypeErrorsToIssues(errs)[0].message).toBe('Failed uuid constraint (true)');
  });

  test('circular error renders "Circular reference" with a plain path', () => {
    const errs: RTValidationError[] = [{path: ['root', 'next'], expected: 'circular'}];
    expect(runTypeErrorsToIssues(errs)).toEqual([{message: 'Circular reference', path: ['root', 'next'], expected: 'circular'}]);
  });

  test('issue carries structured expected + format (lossless) alongside message + path', () => {
    const errs: RTValidationError[] = [
      {path: ['email'], expected: 'string', format: {name: 'email', val: 'pattern', formatPath: ['pattern']}},
    ];
    expect(runTypeErrorsToIssues(errs)).toEqual([
      {
        // The 'pattern' bound merely echoes the constraint name, so the
        // parenthesized clause is dropped; the structured format keeps it.
        message: 'Failed pattern constraint',
        path: ['email'],
        expected: 'string',
        format: {name: 'email', val: 'pattern', formatPath: ['pattern']},
      },
    ]);
  });

  test('a wildcard bound names the FORMAT and drops the bound clause', () => {
    const errs: RTValidationError[] = [
      {path: ['id'], expected: 'string', format: {name: 'uuid', val: 'any', formatPath: ['version']}},
    ];
    expect(runTypeErrorsToIssues(errs)[0].message).toBe('Failed uuid constraint');
  });

  test('no-format error omits the format field (not set to undefined)', () => {
    const [issue] = runTypeErrorsToIssues([{path: [], expected: 'number'}]);
    expect('format' in issue).toBe(false);
  });

  test('the message option overrides the default derivation', () => {
    const errs: RTValidationError[] = [{path: ['a'], expected: 'string'}];
    const issues = runTypeErrorsToIssues(errs, {message: (e) => `custom:${e.expected}`});
    expect(issues[0].message).toBe('custom:string');
  });

  test('maps one issue per error (flat, no grouping)', () => {
    const errs: RTValidationError[] = [
      {path: ['a'], expected: 'string'},
      {path: ['b'], expected: 'number'},
    ];
    expect(runTypeErrorsToIssues(errs)).toHaveLength(2);
  });
});
