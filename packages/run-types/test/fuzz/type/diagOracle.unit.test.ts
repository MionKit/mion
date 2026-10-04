// Negative controls for D1–D3: each rule fires on a broken outcome and stays quiet on a sound one.

import {describe, expect, it} from 'vitest';
import {
  checkDropNoted,
  checkReportedThrows,
  checkThrowReported,
  classifyThrow,
  controlledCode,
  droppedPaths,
} from './diagOracle.ts';

const ctx = {target: 'T', seed: 1, source: 'type T = …'};

describe('diagOracle', () => {
  it('D1 fires on a throw its call site never reported', () => {
    expect(checkThrowReported({key: 'validate', codesAtSite: new Set(), thrownCode: 'validate-symbol-root'}, ctx)?.oracle).toBe(
      'D1'
    );
    expect(
      checkThrowReported(
        {key: 'validate', codesAtSite: new Set(['validate-symbol-root']), thrownCode: 'validate-symbol-root'},
        ctx
      )
    ).toBeNull();
    expect(checkThrowReported({key: 'validate', codesAtSite: new Set()}, ctx)).toBeNull();
  });

  it('D1 fires on an error with no code, which no diagnostic can name', () => {
    const crash = classifyThrow(new TypeError('x is not a function'));
    expect(crash).toEqual({uncontrolledError: 'x is not a function'});
    expect(
      checkThrowReported({key: 'mutateDecode', codesAtSite: new Set(['json-restore-function-property-dropped']), ...crash}, ctx)
        ?.oracle
    ).toBe('D1');
    expect(classifyThrow(new Error('[json-restore-non-data-root] never decoded'))).toEqual({
      thrownCode: 'json-restore-non-data-root',
    });
  });

  it('D2 fires on a reported always-throw code the function never threw', () => {
    expect(
      checkReportedThrows({key: 'jsonEncode', codesAtSite: new Set(['json-prepare-clone-function-root'])}, ctx)?.oracle
    ).toBe('D2');
    expect(
      checkReportedThrows(
        {
          key: 'jsonEncode',
          codesAtSite: new Set(['json-prepare-clone-function-root']),
          thrownCode: 'json-prepare-clone-function-root',
        },
        ctx
      )
    ).toBeNull();
    expect(
      checkReportedThrows({key: 'jsonEncode', codesAtSite: new Set(['json-prepare-clone-function-property-dropped'])}, ctx)
    ).toBeNull();
  });

  it('D3 fires on a dropped member with no drop note', () => {
    expect(checkDropNoted('jsonEncode', ['$.f'], new Set(), ctx)?.oracle).toBe('D3');
    expect(checkDropNoted('jsonEncode', ['$.f'], new Set(['json-prepare-clone-function-property-dropped']), ctx)).toBeNull();
    expect(checkDropNoted('jsonEncode', [], new Set(), ctx)).toBeNull();
  });

  it('reads the code a controlled throw opens with', () => {
    expect(controlledCode('[validate-symbol-root] Type `symbol` can never be validated')).toBe('validate-symbol-root');
    expect(controlledCode('TypeError: x is not a function')).toBeUndefined();
  });

  it('finds dropped members at any depth, symbol keys included', () => {
    const tag = Symbol('tag');
    const input = {a: 1, f: () => 1, nested: [{g: () => 2, b: 'x'}], [tag]: 'v', skip: undefined};
    const output = {a: 1, nested: [{b: 'x'}]};
    expect(droppedPaths(input, output).sort()).toEqual(['$.[tag]', '$.f', '$.nested[0].g']);
    expect(droppedPaths({a: 1}, {a: 1})).toEqual([]);
  });

  it('looks inside Set elements and pairs object Map keys by position', () => {
    expect(droppedPaths(new Set([{a: 1, f: () => 1}]), new Set([{a: 1}]))).toEqual(['$[0].f']);
    const key = {id: 'k', f: () => 1};
    const input = new Map([[key, {v: 1, g: () => 2}]]);
    const output = new Map([[{id: 'k'}, {v: 1}]]);
    expect(droppedPaths(input, output).sort()).toEqual(['$.get([object Object]).g', '$.keys()[0].f']);
  });

  it('lets a null member vanish only where compact cannot tell it from absent', () => {
    expect(droppedPaths({a: 1, n: null}, {a: 1})).toEqual(['$.n']);
    expect(droppedPaths({a: 1, n: null}, {a: 1}, true)).toEqual([]);
  });
});
