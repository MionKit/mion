/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {
    Mutable,
    CompiledPureFunction,
    JitCompiledFn,
    PersistedJitFunctionsCache,
    PersistedPureFunctionsCache,
    FnsDataCache,
    PureFnsDataCache,
    JitCompiledFnData,
    JITUtils,
    PersistedPureFunction,
    PureFunctionData,
    PersistedJitFn,
    PureFunctionClosure,
} from './types/general.types';
import {TypedError} from './errors';

/**
 * Restores the full state of a persisted/serialized jit functions.
 * This functions mutates the input caches!!!
 * Persisted functions are jit functions written to code that contains the createJitFn closure but not the fn.
 * Serialized functions are jit functions sent over the network that contains the code to recreate the createJitFn closure and fn.
 * The JIT fn itself can't be compiled to code as it contains references to context code and jitUtils.
 * So we need to restore it manually by invoking the closure function.
 * */
export function restoreCompiledJitFns(
    jitCache: PersistedJitFunctionsCache | FnsDataCache,
    pureCache: PersistedPureFunctionsCache | PureFnsDataCache,
    jitUtils: JITUtils
): void {
    const keysPureFns = Object.keys(pureCache);
    keysPureFns.forEach((key) => restoreCompiledPureFn(pureCache, key, jitUtils));
    const keysJitFns = Object.keys(jitCache);
    keysJitFns.forEach((key) => restoreCompiledJitFn(jitCache, pureCache, key, jitUtils));
}

function restoreCompiledPureFn(pureCache: PersistedPureFunctionsCache | PureFnsDataCache, fnName: string, jitUtils: JITUtils) {
    const pureCompiled = pureCache[fnName];
    if (!pureCompiled) throw new Error(`Pure function ${fnName} not found`);
    if ((pureCompiled as CompiledPureFunction).fn) return;
    const dependencies = pureCompiled.dependencies;
    dependencies.forEach((depName) => restoreCompiledPureFn(pureCache, depName, jitUtils));
    // persisted pure functions (AOT code caches) have the createJitFn but not the fn
    if ((pureCompiled as PersistedPureFunction).createJitFn) {
        (pureCompiled as any as Mutable<CompiledPureFunction>).fn = (pureCompiled as PersistedPureFunction).createJitFn(jitUtils);
        return;
    }
    // serialized pure functions (network sent) do not contains neither createJitFn nor fn
    restorePureFunction(pureCompiled, jitUtils);
}

function restoreCompiledJitFn(
    jitCache: PersistedJitFunctionsCache | FnsDataCache,
    pureCache: PersistedPureFunctionsCache | PureFnsDataCache,
    fnHash: string,
    jitUtils: JITUtils
) {
    const jitCompiled = jitCache[fnHash];
    if (!jitCompiled) throw new Error(`Jit function ${fnHash} not found`);
    if ((jitCompiled as JitCompiledFn).fn) return;
    const pureDependencies = jitCompiled.pureFnDependencies;
    pureDependencies.forEach((depName) => restoreCompiledPureFn(pureCache, depName, jitUtils));
    const dependencies = jitCompiled.dependenciesSet;
    dependencies.forEach((dep) => restoreCompiledJitFn(jitCache, pureCache, dep, jitUtils));
    if ((jitCompiled as PersistedJitFn).createJitFn) {
        (jitCompiled as any as Mutable<JitCompiledFn>).fn = (jitCompiled as PersistedJitFn).createJitFn(jitUtils);
        return;
    }
    restoreCreateJitFn(jitCompiled, jitUtils);
}

/**
 * Restores a JIT function from serialized function data.
 * This functionsMutates the input data!!!
 * Creates a dynamic function using the serialized code (which already contains the complete function with context),
 * then executes it with jitUtils to produce the final JIT function.
 * @param fnData - The serialized function data containing code, args, and metadata
 * @returns A JitCompiledFn with both the createJitFn closure and the executed fn
 */
function restoreCreateJitFn(fnData: JitCompiledFnData, jitUtils: JITUtils): JitCompiledFn {
    const fnName = fnData.jitFnHash;
    // fnData.code already contains the complete function with context (e.g., "const x = ...; return function fnName(args){...}")
    const fnWithContext = fnData.code;
    try {
        // Create wrapper function that works as a factory and returns the actual jit function
        const wrapperWithContext = new Function('utl', fnWithContext) as (utl: JITUtils) => (...args: any[]) => any;
        // Execute the wrapper with jitUtils to get the final function
        const fn = wrapperWithContext(jitUtils);
        const jitFn = fnData as Mutable<JitCompiledFn>;
        jitFn.createJitFn = wrapperWithContext;
        jitFn.fn = fn;
        return jitFn;
    } catch (e: any) {
        throw new TypedError({
            type: 'jit-fn-restore-error',
            message: `Failed to restore JIT function ${fnName}: ${e?.message}`,
        });
    }
}

/**
 * Restores a pure function from serialized function data.
 * This function mutates the input data!!!
 * Creates a dynamic function using the serialized code (which already contains the complete function with context),
 * then executes it with jitUtils to produce the final pure function.
 * @param pureFnData - The serialized pure function data containing code and metadata
 * @returns A CompiledPureFunction with both the createJitFn closure and the executed fn
 */
function restorePureFunction(pureFnData: PureFunctionData, jitUtils: JITUtils): CompiledPureFunction {
    const fnName = pureFnData.pureFnHash;
    // pureFnData.code already contains the complete function with context
    const fnWithContext = pureFnData.code;
    try {
        // Create wrapper function that works as a factory and returns the actual pure function
        const wrapperWithContext = new Function('utl', fnWithContext) as PureFunctionClosure;
        // Execute the wrapper with jitUtils to get the final function
        const fn = wrapperWithContext(jitUtils);
        const pureFn = pureFnData as Mutable<CompiledPureFunction>;
        pureFn.createJitFn = wrapperWithContext;
        pureFn.fn = fn;
        return pureFn;
    } catch (e: any) {
        throw new TypedError({
            type: 'pure-fn-restore-error',
            message: `Failed to restore pure function ${fnName}: ${e?.message}`,
        });
    }
}
