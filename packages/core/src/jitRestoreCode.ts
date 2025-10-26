/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {jitUtils} from './jitUtils';
import type {JitCompiledFn, JitFunctionsCache, Mutable, PureFunctionsCache} from '@mionkit/core/src/binaryTypes';

/**
 * Restores the full state of a compiled jit functions cache,
 * The JIT fn itself can't be compiled to code as it contains references to context code and jitUtils.
 * So we need to restore it manually by invoking the closure function.
 * */
export function restoreCompiledJitFns(jitCache: JitFunctionsCache, pureCache: PureFunctionsCache) {
    const keysPureFns = Object.keys(pureCache);
    keysPureFns.forEach((key) => restoreCompiledPureFn(pureCache, key));
    const keysJitFns = Object.keys(jitCache);
    keysJitFns.forEach((key) => restoreCompiledJitFn(jitCache, pureCache, key));
}

function restoreCompiledPureFn(pureCache: PureFunctionsCache, fnName: string) {
    const pureCompiled = pureCache[fnName];
    if (!pureCompiled) throw new Error(`Pure function ${fnName} not found`);
    if (pureCompiled.fn) return;
    const dependencies = pureCompiled.dependencies;
    dependencies.forEach((depName) => restoreCompiledPureFn(pureCache, depName));
    pureCompiled.fn = pureCompiled.closureFn(jitUtils);
}

function restoreCompiledJitFn(jitCache: JitFunctionsCache, pureCache: PureFunctionsCache, fnHash: string) {
    const jitCompiled = jitCache[fnHash];
    if (!jitCompiled) throw new Error(`Jit function ${fnHash} not found`);
    if ((jitCompiled as any).fn) return;

    const pureDependencies = jitCompiled.pureFnDependencies;
    pureDependencies.forEach((depName) => restoreCompiledPureFn(pureCache, depName));

    const dependencies = jitCompiled.dependenciesSet;
    dependencies.forEach((dep) => restoreCompiledJitFn(jitCache, pureCache, dep));
    (jitCompiled as Mutable<JitCompiledFn>).fn = jitCompiled.closureFn(jitUtils);
}
