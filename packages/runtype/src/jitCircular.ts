/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {JitCompileOperation, RunType} from './types';
import {CollectionRunType} from './baseRunTypes';
import {addReturnCode, callJitCachedFn, createJitCachedFn} from './jitCompiler';
import {isAtomicRunType, isCollectionRunType, isMemberRunType} from './guards';

/** Types should be added to Jit cache when they are circular so they can call themselves
 * TODO: we could also add named types to the cache to avoid recompiling them.
 */
export function shouldCallJitCache(rt: RunType): boolean {
    // Every time a type is added to the cache it adds a new call to jutUtils.getCachedFn inside the Jit generated code.
    // so we should never add a function to the cache if that code already did non need a self invoking function.
    // if a type can be embedded in the code, it should not be added to the cache.
    return (rt as CollectionRunType<any>).constants().isCircularRef;
}

/** wrapper function to handle circular types compiling */
export function handleCircularStackAndJitCacheCompiling(
    /** functions that compiles code, only called if required */
    compile: (op: JitCompileOperation) => string,
    rt: RunType,
    op: JitCompileOperation,
    addReturnToJit: boolean,
    /** name to identify the function in the jit cache */
    fnName: string
): string {
    // if (isCollectionRunType(rt)) console.log('handleJitCacheCompiling for', rt);
    // if it is not a circular type, we can return the code directly
    if (!shouldCallJitCache(rt)) return compile(op);

    // if is a circular type, we need to create a jit function to handle the circular reference and call it
    const jitIdFnName = `${rt.getJitId()}:${fnName}`;
    const compileJit = addReturnToJit ? () => `return ${compile(op)}` : compile;
    const defaultArgs = op.getDefaultArgs();
    const jitFnArgs = Object.values(defaultArgs);
    const jitCacheCallArgs = Object.values(op.args);
    op.args = defaultArgs; // reset the args to the default values
    createJitCachedFn(jitIdFnName, compileJit(op), jitFnArgs); // adding the code to jit cache
    return callJitCachedFn(jitIdFnName, jitCacheCallArgs); // return a call to the cached function
}

/** wrapper function to handle the return statement of circular jit code.
 * like JsonStringify os isType */
export function addReturnCodeAndHandleCompileCache(
    compile: (op: JitCompileOperation) => string,
    rt: RunType,
    op: JitCompileOperation,
    codeContainsReturn: boolean,
    fnName: string
) {
    const shouldCallJit = shouldCallJitCache(rt);
    const addReturnToJit = !codeContainsReturn;
    const compiled = handleCircularStackAndJitCacheCompiling(compile, rt, op, addReturnToJit, fnName);
    const codeHasReturn = codeContainsReturn && !shouldCallJit;
    return addReturnCode(compiled, op, codeHasReturn);
}

export function shouldSkipJit(rt: RunType): boolean {
    if (isCollectionRunType(rt)) {
        const children = rt.getJitChildren();
        return !children.length;
    }
    if (isMemberRunType(rt)) {
        const child = rt.getJitChild();
        return !child;
    }
    if (isAtomicRunType(rt)) {
        return rt.constants().skipJit;
    }
    throw new Error('shouldSkipJit: unknown RunType');
}

export function shouldSkipJsonDecode(rt: RunType): boolean {
    if (shouldSkipJit(rt)) return true;
    if (isCollectionRunType(rt)) {
        const children = rt.getJsonDecodeChildren();
        return !children.length;
    }
    if (isMemberRunType(rt)) {
        const child = rt.getJsonDecodeChild();
        return !child;
    }
    if (isAtomicRunType(rt)) {
        return rt.constants().skipJsonDecode;
    }
    throw new Error('shouldSkipJsonDecode: unknown RunType');
}

export function shouldSkiJsonEncode(rt: RunType): boolean {
    if (shouldSkipJit(rt)) return true;
    if (isCollectionRunType(rt)) {
        const children = rt.getJsonEncodeChildren();
        return !children.length;
    }
    if (isMemberRunType(rt)) {
        const child = rt.getJsonEncodeChild();
        return !child;
    }
    if (isAtomicRunType(rt)) {
        return rt.constants().skipJsonEncode;
    }
    throw new Error('shouldSkiJsonEncode: unknown RunType');
}
