import {jitUtils} from '@mionkit/core';
import type {Mutable} from '../types';
import {BaseFnCompiler, getJitFnCode, createJitFnWithContext} from './jitFnCompiler';

export function createJitFunction(comp: BaseFnCompiler): (...args: any[]) => any {
    if (comp.fn) return comp.fn;
    if (comp.stack.length !== 0) throw new Error('Can not get compiled function before the compile operation is finished');
    if (jitUtils.hasJitFn(comp.jitFnHash)) return jitUtils.getJitFn(comp.jitFnHash);
    const {fnCode, fnName, contextCode} = getJitFnCode(comp);
    const {closureFn, fn, code} = createJitFnWithContext(comp, fnName, fnCode, contextCode);
    (comp as Mutable<BaseFnCompiler>).code = code;
    (comp as Mutable<BaseFnCompiler>).fn = fn;
    (comp as Mutable<BaseFnCompiler>).closureFn = closureFn;
    return fn;
}
