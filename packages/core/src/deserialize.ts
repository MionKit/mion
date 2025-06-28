/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {jitUtils} from '@mionkit/core/src/jitUtils';
import type {JitCompiledFn, JitCompiledFnData, JITUtils} from '@mionkit/core/src/types';

const jitUtilsParamName = 'utl'; // must match the jitUtils param name in run-types

function restoreSerializedFn(
    fnHash: string,
    fnCache: Record<string, JitCompiledFnData>,
    restored: Record<string, JitCompiledFn> = {},
    maxDepth = 0
): JitCompiledFn {
    if (restored[fnHash]) return restored[fnHash];
    const serializedFn = fnCache[fnHash];
    const depth = maxDepth + 1;
    if (depth > 1000) throw new Error('Max depth reached restoring serialized functions');
    if (!serializedFn) throw new Error(`Jit function ${fnHash} not found, can not deserialize it.`);
    // adding restored before functions gets actually restored to avoid infinite recursion in circular dependencies
    const restoredItem = {...serializedFn, fn: true, closureFn: true} as any;
    restored[fnHash] = restoredItem;
    const deps = serializedFn.dependenciesSet;
    const pureDeps = serializedFn.pureFnDependencies;
    pureDeps.forEach((depKey) => restoreSerializedFn(depKey, fnCache, restored, depth));
    deps.forEach((depKey) => restoreSerializedFn(depKey, fnCache, restored, depth));
    const closureFn = new Function(jitUtilsParamName, serializedFn.code) as (jitUtils: JITUtils) => any;
    restoredItem.closureFn = closureFn;
    restoredItem.fn = closureFn(jitUtils);
    return restoredItem;
}

/**
 * Restores the full state of a compiled jit functions cache,
 * The JIT fn itself can't be compiled to code as it contains references to context code and jitUtils.
 * So we need to restore it manually by invoking the closure function.
 * */
export function restoreSerializedFns(fnCache: Record<string, JitCompiledFnData>): Record<string, JitCompiledFn> {
    const restored: Record<string, JitCompiledFn> = {};
    const keyFns = Object.keys(fnCache);
    keyFns.forEach((fnHash) => {
        restored[fnHash] = restoreSerializedFn(fnHash, fnCache, restored);
    });
    return restored;
}
