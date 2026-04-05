/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {
    Mutable,
    JitCompiledFn,
    PersistedJitFunctionsCache,
    PersistedPureFunctionsCache,
    FnsDataCache,
    PureFnsDataCache,
    PureFunctionsCache,
    JitCompiledFnData,
    PersistedJitFn,
} from '../types/general.types.ts';
import {JITUtils} from '../jit/jitUtils.ts';
import type {PersistedPureFunction} from '../types/pureFunctions.types.ts';
import type {CompiledPureFunction} from '../types/pureFunctions.types.ts';
import type {PureFunctionData} from '../types/pureFunctions.types.ts';
import type {PureFunctionFactory} from '../types/pureFunctions.types.ts';
import {TypedError} from '../errors.ts';

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
    pureCache: PureFunctionsCache | PersistedPureFunctionsCache | PureFnsDataCache,
    jUtil: JITUtils
): void {
    // Use visited sets to prevent infinite recursion on circular dependencies
    // This is needed because during restoration, the `fn` property is not set until after
    // all dependencies are restored, so checking `fn` alone can't prevent circular calls
    const visitedPure = new Set<string>();
    const visitedJit = new Set<string>();

    // Iterate over all namespaces and restore pure functions
    for (const namespace in pureCache) {
        const nsCache = pureCache[namespace];
        const keysPureFns = Object.keys(nsCache);
        keysPureFns.forEach((key) => restoreCompiledPureFn(pureCache, namespace, key, jUtil, visitedPure));
    }
    const keysJitFns = Object.keys(jitCache);
    keysJitFns.forEach((key) => restoreCompiledJitFn(jitCache, pureCache, key, jUtil, visitedPure, visitedJit));
}

function restoreCompiledPureFn(
    pureCache: PureFunctionsCache | PersistedPureFunctionsCache | PureFnsDataCache,
    namespace: string,
    fnName: string,
    jUtil: JITUtils,
    visited: Set<string>
) {
    // Use namespace:fnName as the visited key to handle same function names in different namespaces
    const visitedKey = `${namespace}:${fnName}`;
    // Skip if already visited (handles circular dependencies)
    if (visited.has(visitedKey)) return;
    visited.add(visitedKey);

    const nsCache = pureCache[namespace];
    if (!nsCache) throw new Error(`Pure function namespace ${namespace} not found`);
    const pureCompiled = nsCache[fnName];
    if (!pureCompiled) throw new Error(`Pure function ${fnName} not found in namespace ${namespace}`);
    if ((pureCompiled as CompiledPureFunction).fn) return;
    const dependencies = pureCompiled.pureFnDependencies || [];
    // Dependencies are in the same namespace
    dependencies.forEach((depName) => restoreCompiledPureFn(pureCache, namespace, depName, jUtil, visited));
    // persisted pure functions (AOT code caches) have the createJitFn but not the fn
    if ((pureCompiled as PersistedPureFunction).createPureFn) {
        (pureCompiled as any as Mutable<CompiledPureFunction>).fn = (pureCompiled as PersistedPureFunction).createPureFn(jUtil);
        return;
    }
    // serialized pure functions (network sent) do not contains neither createJitFn nor fn
    restorePureFunction(pureCompiled, jUtil);
}

function restoreCompiledJitFn(
    jitCache: PersistedJitFunctionsCache | FnsDataCache,
    pureCache: PureFunctionsCache | PersistedPureFunctionsCache | PureFnsDataCache,
    fnHash: string,
    jUtil: JITUtils,
    visitedPure: Set<string>,
    visitedJit: Set<string>
) {
    // Skip if already visited (handles circular dependencies)
    if (visitedJit.has(fnHash)) return;
    visitedJit.add(fnHash);

    const jitCompiled = jitCache[fnHash];
    if (!jitCompiled) throw new Error(`Jit function ${fnHash} not found`);
    if ((jitCompiled as JitCompiledFn).fn) return;
    const pureDependencies = jitCompiled.pureFnDependencies || [];
    // Pure function dependencies are stored as "namespace::fnHash"
    pureDependencies.forEach((dep) => {
        const parts = dep.split('::');
        if (parts.length !== 2) throw new Error(`Invalid pure function dependency format: ${dep}, expected "namespace::fnHash"`);
        const [namespace, fnHash] = parts;
        restoreCompiledPureFn(pureCache, namespace, fnHash, jUtil, visitedPure);
    });
    const dependencies = jitCompiled.jitDependencies || [];
    dependencies.forEach((dep) => restoreCompiledJitFn(jitCache, pureCache, dep, jUtil, visitedPure, visitedJit));
    if ((jitCompiled as PersistedJitFn).createJitFn) {
        (jitCompiled as any as Mutable<JitCompiledFn>).fn = (jitCompiled as PersistedJitFn).createJitFn(jUtil);
        return;
    }
    restoreCreateJitFn(jitCompiled, jUtil);
}

/**
 * Restores a JIT function from serialized function data.
 * This functionsMutates the input data!!!
 * Creates a dynamic function using the serialized code (which already contains the complete function with context),
 * then executes it with jitUtils to produce the final JIT function.
 * @param fnData - The serialized function data containing code, args, and metadata
 * @returns A JitCompiledFn with both the createJitFn closure and the executed fn
 */
function restoreCreateJitFn(fnData: JitCompiledFnData, jUtil: JITUtils): JitCompiledFn {
    const fnName = fnData.jitFnHash;
    // fnData.code already contains the complete function with context (e.g., "const x = ...; return function fnName(args){...}")
    const fnWithContext = `'use strict'; ${fnData.code}`;
    try {
        // Create wrapper function that works as a factory and returns the actual jit function
        const wrapperWithContext = new Function('utl', fnWithContext) as (utl: JITUtils) => (...args: any[]) => any;
        // Execute the wrapper with jitUtils to get the final function
        const fn = wrapperWithContext(jUtil);
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
function restorePureFunction(pureFnData: PureFunctionData, jUtil: JITUtils): CompiledPureFunction {
    const fnName = pureFnData.fnName;
    // pureFnData.code already contains the complete function with context
    const fnWithContext = `'use strict'; ${pureFnData.code}`;
    try {
        // Create wrapper function that works as a factory and returns the actual pure function
        const wrapperWithContext = new Function('utl', fnWithContext) as PureFunctionFactory;
        // Execute the wrapper with jitUtils to get the final function
        const fn = wrapperWithContext(jUtil);
        const pureFn = pureFnData as Mutable<CompiledPureFunction>;
        pureFn.createPureFn = wrapperWithContext;
        pureFn.fn = fn;
        return pureFn;
    } catch (e: any) {
        throw new TypedError({
            type: 'pure-fn-restore-error',
            message: `Failed to restore pure function ${fnName}: ${e?.message}`,
        });
    }
}
