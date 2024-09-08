/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {JitCompileContext, RunType} from './types';
import {CollectionRunType} from './baseRunTypes';
import {callJitCachedFn, createJitCachedFn} from './jitCompiler';

function shouldCallJitCache(rt: RunType): boolean {
    return (rt as CollectionRunType<any>).isCircularRef;
}

/** wrapper function to handle circular types compiling */
function handleJitCacheCompiling(
    /** functions that compiles code, only called if required */
    compile: () => string,
    rt: RunType,
    ctx: JitCompileContext,
    addReturnToJit: boolean,
    /** name to identify the function in the jit cache */
    fnName: string
): string {
    // if it is not a circular type, we can return the code directly
    if (!shouldCallJitCache(rt)) return compile();

    // if is a circular type, we need to create a jit function to handle the circular reference and call it
    const jitIdFnName = `${rt.jitId}:${fnName}`;
    const compileJit = addReturnToJit ? () => `return ${compile()}` : compile;
    const jitFnArgs = Object.keys(ctx.args);
    const jitCacheCallArgs = Object.values(ctx.args);
    createJitCachedFn(jitIdFnName, compileJit, jitFnArgs); // adding the code to jit cache
    return callJitCachedFn(jitIdFnName, jitCacheCallArgs); // return a call to the cached function
}

/** wrapper function to handle the return statement of circular jit code.
 * like JsonStringify os isType */
function handleCodeReturn(
    compile: () => string,
    rt: RunType,
    ctx: JitCompileContext<any>,
    codeContainsReturn: boolean,
    fnName: string
) {
    const shouldCallJit = shouldCallJitCache(rt);
    const addReturnToJit = !codeContainsReturn;
    const compiled = handleJitCacheCompiling(compile, rt, ctx, addReturnToJit, fnName);
    const codeHasReturn = codeContainsReturn && !shouldCallJit;
    const nestLevel = ctx.parents.length;
    if (nestLevel > 0) {
        // code contains a return and possibly more statements, we need to wrap it in a self invoking function to avoid syntax errors
        if (codeHasReturn) return `(function(){${compiled}})()`;
        // code is just a statement (i.e: typeof var === 'number'), we can return it directly
        return compiled;
    }
    // nestLevel === 0 (root of the function)
    if (codeHasReturn) return compiled; // code already contains a return, we can return it directly
    // code is just a statement (i.e: typeof var === 'number'), we need to add a return statement as it is the root of the function
    return `return ${compiled}`;
}

/** Handles Circular compiling for jit isType functions */
export function handleCircularIsType(
    compile: () => string,
    rt: RunType,
    ctx: JitCompileContext<any>,
    codeContainsReturn: boolean,
    fnName = 'isT'
): string {
    return handleCodeReturn(compile, rt, ctx, codeContainsReturn, fnName);
}

/** Handles Circular compiling for jit jsonStringify functions */
export function handleCircularJsonStringify(
    compile: () => string,
    rt: RunType,
    ctx: JitCompileContext<any>,
    codeContainsReturn: boolean,
    fnName = 'jsonS'
): string {
    return handleCodeReturn(compile, rt, ctx, codeContainsReturn, fnName);
}

/** Handles Circular compiling for jit typeErrors functions */
export function handleCircularTypeErrors(
    compile: () => string,
    rt: RunType,
    ctx: JitCompileContext<any>,
    codeContainsReturn = false,
    fnName = 'TErr'
): string {
    return handleJitCacheCompiling(compile, rt, ctx, codeContainsReturn, fnName);
}

/** Handles Circular compiling for jit jsonEncode functions */
export function handleCircularJsonEncode(
    compile: () => string,
    rt: RunType,
    ctx: JitCompileContext<any>,
    codeContainsReturn = false,
    fnName = 'jsonE'
): string {
    return handleJitCacheCompiling(compile, rt, ctx, codeContainsReturn, fnName);
}

/** Handles Circular compiling for jit jsonDecode functions */
export function handleCircularJsonDecode(
    compile: () => string,
    rt: RunType,
    ctx: JitCompileContext<any>,
    codeContainsReturn = false,
    fnName = 'jsonD'
): string {
    return handleJitCacheCompiling(compile, rt, ctx, codeContainsReturn, fnName);
}
