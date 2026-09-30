// Negative controls for D1–D3: each rule fires on a broken outcome and stays quiet on a sound one.

import {describe, expect, it} from 'vitest';
import {checkDropNoted, checkReportedThrows, checkThrowReported, controlledCode, droppedPaths} from './diagOracle.ts';

const ctx = {target: 'T', seed: 1, source: 'type T = …'};

describe('diagOracle', () => {
  it('D1 fires on a throw its call site never reported', () => {
    expect(checkThrowReported({key: 'validate', codesAtSite: new Set(), thrownCode: 'VL002'}, ctx)?.oracle).toBe('D1');
    expect(checkThrowReported({key: 'validate', codesAtSite: new Set(['VL002']), thrownCode: 'VL002'}, ctx)).toBeNull();
    expect(checkThrowReported({key: 'validate', codesAtSite: new Set()}, ctx)).toBeNull();
  });

  it('D2 fires on a reported always-throw code the function never threw', () => {
    expect(checkReportedThrows({key: 'jsonEncode', codesAtSite: new Set(['PJS003'])}, ctx)?.oracle).toBe('D2');
    expect(checkReportedThrows({key: 'jsonEncode', codesAtSite: new Set(['PJS003']), thrownCode: 'PJS003'}, ctx)).toBeNull();
    expect(checkReportedThrows({key: 'jsonEncode', codesAtSite: new Set(['PJS010'])}, ctx)).toBeNull();
  });

  it('D3 fires on a dropped member with no drop note', () => {
    expect(checkDropNoted('jsonEncode', ['$.f'], new Set(), ctx)?.oracle).toBe('D3');
    expect(checkDropNoted('jsonEncode', ['$.f'], new Set(['PJS010']), ctx)).toBeNull();
    expect(checkDropNoted('jsonEncode', [], new Set(), ctx)).toBeNull();
  });

  it('reads the code a controlled throw opens with', () => {
    expect(controlledCode('[VL002] Type `symbol` can never be validated')).toBe('VL002');
    expect(controlledCode('TypeError: x is not a function')).toBeUndefined();
  });

  it('finds dropped members at any depth, symbol keys included', () => {
    const tag = Symbol('tag');
    const input = {a: 1, f: () => 1, nested: [{g: () => 2, b: 'x'}], [tag]: 'v', skip: undefined};
    const output = {a: 1, nested: [{b: 'x'}]};
    expect(droppedPaths(input, output).sort()).toEqual(['$.[tag]', '$.f', '$.nested[0].g']);
    expect(droppedPaths({a: 1}, {a: 1})).toEqual([]);
  });
});
