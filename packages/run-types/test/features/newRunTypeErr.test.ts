// The `newRunTypeErr` pure fn builds each error's path without spreads; every branch must still snapshot the path.

import {describe, expect, it} from 'vitest';
import {newRunTypeErr} from '../../src/runtypes/pure-fns-utils.ts';
import {getRTUtils} from '../../src/runtypes/rtUtils.ts';
import type {RTValidationError} from '../../src/createRTFunctions.ts';

type ErrFn = (pth: (string | number)[], er: RTValidationError[], expected: string, accessPath?: (string | number)[]) => void;
const factory = getRTUtils().getCompiledPureFn(newRunTypeErr)?.createPureFn;
if (typeof factory !== 'function') throw new Error('newRunTypeErr has no factory');
const pushErr = factory(undefined as any) as ErrFn;

describe('newRunTypeErr', () => {
  it('copies the running path when there is no access path', () => {
    const pth = ['a', 0];
    const er: RTValidationError[] = [];
    pushErr(pth, er, 'string');
    pushErr(pth, er, 'string', []);
    pth.push('later');
    expect(er).toEqual([
      {expected: 'string', path: ['a', 0]},
      {expected: 'string', path: ['a', 0]},
    ]);
    expect(er[0].path).not.toBe(er[1].path);
  });

  it('joins the running path and the access path into a new array', () => {
    const pth = ['root'];
    const accessPath = ['x', 1];
    const er: RTValidationError[] = [];
    pushErr(pth, er, 'number', accessPath);
    pth.push('later');
    expect(er).toEqual([{expected: 'number', path: ['root', 'x', 1]}]);
    expect(accessPath).toEqual(['x', 1]);
  });

  it('keeps the access path as is under an empty running path, never aliasing the running path', () => {
    const pth: (string | number)[] = [];
    const er: RTValidationError[] = [];
    pushErr(pth, er, 'number', ['x']);
    pushErr(pth, er, 'objectLiteral');
    pth.push('later');
    expect(er).toEqual([
      {expected: 'number', path: ['x']},
      {expected: 'objectLiteral', path: []},
    ]);
  });
});
