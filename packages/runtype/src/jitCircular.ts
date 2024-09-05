/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {RunType} from './types';
import {jitNames} from './constants';
import {CollectionRunType} from './baseRunTypes';
import {callJitCachedFn, createJitCachedFn} from './jitCompiler';

export type compileChildCB = (updatedParents: RunType[]) => string;

function shouldCallJitCache(rt: RunType): boolean {
    return (rt as CollectionRunType<any>).isCircularRef;
}

/** wrapper function to handle circular types compiling */
function handleJitCacheCompiling(
    rt: RunType,
    /** name to identify the function in the jit cache */
    fnName: string,
    /** functions that compiles code, only called if required */
    compile: () => string,
    /** argument Names when called jit cached function */
    jitCacheCallArgs: string[],
    addReturnToJit: boolean
): string {
    // if it is not a circular type, we can return the code directly
    if (!shouldCallJitCache(rt)) return compile();

    // if is a circular type, we need to create a jit function to handle the circular reference and call it
    const jitIdFnName = `${rt.jitId}:${fnName}`;
    const compileJit = addReturnToJit ? () => `return ${compile()}` : compile;
    createJitCachedFn(jitIdFnName, compileJit, jitCacheCallArgs); // adding the code to jit cache
    return callJitCachedFn(jitIdFnName, jitCacheCallArgs); // return a call to the cached function
}

/** wrapper function to handle the return statement of circular jit code.
 * like JsonStringify os isType */
function handleCodeReturn(
    rt: RunType,
    compile: () => string,
    jitCacheCallArgs: string[],
    nestLevel: number,
    codeContainsReturn: boolean,
    fnName: string
) {
    const shouldCallJit = shouldCallJitCache(rt);
    const addReturnToJit = !codeContainsReturn;
    const compiled = handleJitCacheCompiling(rt, fnName, compile, jitCacheCallArgs, addReturnToJit);
    const codeHasReturn = codeContainsReturn && !shouldCallJit;
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
    rt: RunType,
    compile: () => string,
    jitCacheCallArgs: string[],
    nestLevel: number,
    codeContainsReturn: boolean
): string {
    return handleCodeReturn(rt, compile, jitCacheCallArgs, nestLevel, codeContainsReturn, 'isT');
}

/** Handles Circular compiling for jit jsonStringify functions */
export function handleCircularJsonStringify(
    rt: RunType,
    compile: () => string,
    jitCacheCallArgs: string[],
    nestLevel: number,
    codeContainsReturn: boolean
): string {
    return handleCodeReturn(rt, compile, jitCacheCallArgs, nestLevel, codeContainsReturn, 'jsonStr');
}

/** Handles Circular compiling for jit typeErrors functions */
export function handleCircularTypeErrors(
    rt: RunType,
    compile: () => string,
    jitCacheCallArgs: string[],
    pathC: (string | number)[]
): string {
    const typeErrorsCode = handleJitCacheCompiling(rt, 'TErr', compile, jitCacheCallArgs, false);
    if (shouldCallJitCache(rt))
        return `
            ${jitNames.circularPath}.push(${pathC.join(',')});
            ${typeErrorsCode}
            ${jitNames.circularPath}.splice(-${pathC.length});
        `;
    return typeErrorsCode;
}

/** Handles Circular compiling for jit jsonEncode functions */
export function handleCircularJsonEncode(rt: RunType, compile: () => string, jitCacheCallArgs: string[]): string {
    return handleJitCacheCompiling(rt, 'jsonEnc', compile, jitCacheCallArgs, false);
}

/** Handles Circular compiling for jit jsonDecode functions */
export function handleCircularJsonDecode(rt: RunType, compile: () => string, jitCacheCallArgs: string[]): string {
    return handleJitCacheCompiling(rt, 'jsonDec', compile, jitCacheCallArgs, false);
}

/** wrapper function to compile children types and managing parents array before and after children gets compiled*/
export function compileChildrenJitFunction(rt: RunType, parents: RunType[], compileChildFn: compileChildCB): string {
    parents.push(rt);
    const itemsCode = compileChildFn(parents);
    parents.pop();
    return itemsCode;
}
