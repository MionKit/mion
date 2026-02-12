import {getENV, getJitUtils, type JITUtils} from '@mionkit/core';
import type {JitFnID, Mutable, RunTypeOptions} from '../types.ts';
import {BaseFnCompiler, JitCompilerLike, printClosure} from './jitFnCompiler.ts';
import type {BaseRunType} from './baseRunTypes.ts';
import {getJITFnName} from './jitFnsRegistry.ts';

/**
 * Creates a function name/hash based on the jitHash of the runType and the id of the function.
 * it is a valid js variable name.
 * @param id
 * @param rt
 * @returns
 */
export function getJITFnHash(id: JitFnID, rt: BaseRunType, opts?: RunTypeOptions): string {
    if (opts) return `${id}_${rt.getJitHash(opts)}`;
    return `${id}_${rt.getJitHash({})}`;
}

/**
 * Creates a jit function from a compiler.
 * This function handles the logic to determine if the function should be created or retrieved from the cache.
 * @param comp
 * @returns
 */
export function createJitFunction(comp: BaseFnCompiler): (...args: any[]) => any {
    if (comp.fn) return comp.fn;
    if (comp.stack.length !== 0) throw new Error('Can not get compiled function before the compile operation is finished');
    if (getJitUtils().hasJitFn(comp.jitFnHash)) return getJitUtils().getJitFn(comp.jitFnHash);
    const {fnCode, fnName, contextCode} = getJitFnCode(comp);
    const {createJitFn, fn, code} = createJitFnWithContext(comp, fnName, fnCode, contextCode);
    (comp as Mutable<BaseFnCompiler>).code = code;
    (comp as Mutable<BaseFnCompiler>).fn = fn;
    (comp as Mutable<BaseFnCompiler>).createJitFn = createJitFn;
    return fn;
}

/**
 * Create a JIT function that has jitUtils (and possibly other required variables) in the context,
 * This way jitUtils ca be used without passing them as arguments to every atomic jit function (kind of global variables).
 * @param varName
 * @param fnCode
 * @returns
 */
function createJitFnWithContext(comp: BaseFnCompiler, fnName: string, fnCode: string, contextCode?: string) {
    // this function will have jitUtils as context as is an argument of the enclosing function
    const context = contextCode ? `${contextCode};` : '';
    let fnWithContext = `${context} return ${fnCode}`;
    if (getENV('DEBUG_RUN_TIME')) {
        const fnArgs = getJitFnArgs(comp);
        const argsCall = getJitFnArgs(comp, false);
        const debugWrapper = `function debug_${fnName}(${fnArgs}){
            const resp = ${fnName}(${argsCall});
            console.log('${fnName} ${getJITFnName(comp.fnID)} ${comp.rootType.getTypeName()}', 'result:', resp, ' value:', ${argsCall});
            return resp;
        }`;
        fnWithContext = `${context} ${fnCode} ${debugWrapper} return debug_${fnName};`;
    }
    try {
        // wrapper functions that works as a factory and returns the actual jit function, context contains all constants and heavy to create objects
        const wrapperWithContext = new Function('utl', fnWithContext) as (utl: JITUtils) => (...args: any[]) => any;
        if (getENV('DEBUG_JIT')) console.log(printClosure(fnWithContext, fnName));
        return {createJitFn: wrapperWithContext, fn: wrapperWithContext(getJitUtils()), code: fnWithContext}; // returns the jit internal function with the context
    } catch (e: any) {
        if (getENV('DEBUG_JIT')) {
            console.warn('Error creating jit function with context code:\n', printClosure(fnWithContext, fnName));
        }
        throw e;
    }
}

function getJitFnCode(comp: BaseFnCompiler): {fnName: string; fnCode: string; contextCode: string} {
    const fnName = comp.jitFnHash;
    const fnArgs = getJitFnArgs(comp); // function arguments with default values ie: 'vλl, pλth=[], εrr=[]'
    const fnCode = `function ${fnName}(${fnArgs}){${comp.code}}`;
    return {fnName, fnCode, contextCode: comp.getContextItemValues().join(';\n')};
}

/** Returns the arguments of the function with default values */
function getJitFnArgs(comp: JitCompilerLike, defaultValues = true): string {
    return Object.entries(comp.args)
        .map(([key, name]) => {
            if (!comp.defaultParamValues[key] || !defaultValues) return name;
            const value = comp.defaultParamValues[key];
            return `${name}=${value}`;
        })
        .join(',');
}
