/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JitCompiledFnData, PureFunctionData, CompiledPureFunction, JitCompiledFn, JITUtils} from './types';
import {jitUtils} from './jitUtils';

/**
 * Restores serialized jit functions.
 * Deserializes JIT functions and pure functions, adding them to the JIT cache in the correct order.
 * Dependencies are resolved recursively from leaf branches to root (dependencies first, then dependents).
 * */
export function deserializeMethods(deps: Record<string, JitCompiledFnData>, purFnDeps: Record<string, PureFunctionData>) {
    // First, deserialize all pure functions (they can depend on other pure functions)
    const pureFnKeys = Object.keys(purFnDeps);
    pureFnKeys.forEach((key) => deserializePureFn(purFnDeps[key], purFnDeps));

    // Then, deserialize all JIT functions (they can depend on pure functions and other JIT functions)
    const jitFnKeys = Object.keys(deps);
    jitFnKeys.forEach((key) => deserializeJitMethod(deps[key], deps, purFnDeps));
}

/**
 * Deserializes a JIT function and adds it to the JIT cache.
 * Recursively resolves dependencies before deserializing the function itself.
 * Handles circular dependencies by adding function with closure to cache first, then initializing fn after dependencies.
 */
function deserializeJitMethod(
    serializedMethod: JitCompiledFnData,
    deps: Record<string, JitCompiledFnData>,
    purFnDeps: Record<string, PureFunctionData>
) {
    const jitFnHash = serializedMethod.jitFnHash;

    // Check if already deserialized (prevents infinite recursion on circular dependencies)
    if (jitUtils.hasJitFn(jitFnHash)) return;

    // Create closure function and add to cache with fn undefined to prevent circular recursion
    const closureFn = createJitClosureFunction(serializedMethod);
    const jitCompiledFn: JitCompiledFn = {
        ...serializedMethod,
        closureFn,
        fn: undefined as any, // Will be initialized after dependencies are resolved
    };

    // Add to JIT cache immediately to prevent infinite recursion
    jitUtils.addToJitCache(jitCompiledFn);

    // Recursively resolve all pure function dependencies
    serializedMethod.pureFnDependencies.forEach((depHash) => {
        const pureFnData = purFnDeps[depHash];
        if (pureFnData) {
            deserializePureFn(pureFnData, purFnDeps);
        } else {
            console.warn(`Pure function dependency '${depHash}' not found for JIT function '${jitFnHash}'`);
        }
    });

    // Recursively resolve all JIT function dependencies
    serializedMethod.dependenciesSet.forEach((depHash) => {
        const jitFnData = deps[depHash];
        if (jitFnData) {
            deserializeJitMethod(jitFnData, deps, purFnDeps);
        } else {
            console.warn(`JIT function dependency '${depHash}' not found for JIT function '${jitFnHash}'`);
        }
    });

    // Now initialize the fn property after all dependencies are resolved
    (jitCompiledFn as any).fn = closureFn(jitUtils);
}

/**
 * Deserializes a pure function and adds it to the pure functions cache.
 * Recursively resolves dependencies before deserializing the function itself.
 * Handles circular dependencies by adding function with closure to cache first, then initializing fn after dependencies.
 */
function deserializePureFn(serializedPureFn: PureFunctionData, purFnDeps: Record<string, PureFunctionData>) {
    const pureFnHash = serializedPureFn.pureFnHash;

    // Check if already deserialized (prevents infinite recursion on circular dependencies)
    if (jitUtils.hasPureFn(pureFnHash)) return;

    // Create closure function and add to cache with fn undefined to prevent circular recursion
    const closureFn = createPureClosureFunction(serializedPureFn);
    const compiledPureFn: CompiledPureFunction = {
        ...serializedPureFn,
        closureFn,
        fn: undefined, // Will be initialized after dependencies are resolved
    };

    // Add to pure functions cache immediately to prevent infinite recursion
    jitUtils.addPureFn(compiledPureFn);

    // Recursively resolve all dependencies
    serializedPureFn.dependencies.forEach((depHash) => {
        const depData = purFnDeps[depHash];
        if (depData) {
            deserializePureFn(depData, purFnDeps);
        } else {
            console.warn(`Pure function dependency '${depHash}' not found for pure function '${pureFnHash}'`);
        }
    });

    // Now initialize the fn property after all dependencies are resolved
    // Note: For pure functions, fn is typically initialized lazily when first used via initPureFunction()
    // So we leave it undefined here, consistent with the existing pattern
}

/**
 * Creates a closure function from serialized JIT function data.
 * The closure function takes JITUtils as parameter and returns the actual function.
 */
function createJitClosureFunction(serializedMethod: JitCompiledFnData): (utl: JITUtils) => (...args: any[]) => any {
    const {code} = serializedMethod;

    try {
        // Create the closure function that takes jitUtils as parameter
        // The code already contains the complete function implementation
        const closureFn = new Function('utl', code) as (utl: JITUtils) => (...args: any[]) => any;
        return closureFn;
    } catch (error: any) {
        throw new Error(`Failed to deserialize JIT function ${serializedMethod.jitFnHash}: ${error?.message}`);
    }
}

/**
 * Creates a closure function from serialized pure function data.
 * The closure function takes JITUtils as parameter and returns the actual function.
 */
function createPureClosureFunction(serializedPureFn: PureFunctionData): (utl: JITUtils) => (...args: any[]) => any {
    const {code} = serializedPureFn;

    try {
        // For pure functions, create a closure that takes jitUtils as parameter
        // The code contains the complete function implementation
        const closureFn = new Function('utl', code) as (utl: JITUtils) => (...args: any[]) => any;
        return closureFn;
    } catch (error: any) {
        throw new Error(`Failed to deserialize pure function ${serializedPureFn.pureFnHash}: ${error?.message}`);
    }
}
