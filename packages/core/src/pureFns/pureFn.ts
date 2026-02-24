/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {CompiledPureFunction, ParsedFactoryFn, PureFunctionFactory} from '../types/pureFunctions.types.ts';
import {getJitUtils, type JITUtils} from '../jit/jitUtils.ts';

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  WARNING: This function's call signature is parsed by the mion vite plugin  ║
// ║  at build time (see devtools/src/vite-plugin/extractPureFn.ts).             ║
// ║  Do NOT rename, change the parameter order, or modify the function          ║
// ║  signature without updating the corresponding AST extraction and            ║
// ║  transformer logic in @mionkit/devtools.                                    ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

/**
 * Registers a pure function factory with automatic dependency tracking.
 * The `parsedFn` argument (containing bodyHash, paramNames, and code) is injected
 * at build time by the mion vite plugin's transform hook — it must never be passed manually.
 * If the function is already registered under the same namespace + functionID, the existing
 * compiled entry is returned (idempotent). Dependencies on other pure functions are
 * auto-detected by running the factory once with a tracking proxy.
 *
 * This is intended to share util functions between server and clients
 */
export function registerPureFnFactory(
    namespace: string,
    functionID: string,
    createPureFn: PureFunctionFactory,
    parsedFn?: ParsedFactoryFn // injected by mion vite plugin
): CompiledPureFunction {
    if (!parsedFn) throw new Error('registerPureFnFactory requires mion vite plugin transform to inject parsedFn');
    const existing = getJitUtils().getCompiledPureFn(namespace, functionID);
    if (existing) return existing;

    const compiled: CompiledPureFunction = {
        createPureFn,
        fn: null as any, // will be set later so all possible dependencies are resolved
        namespace,
        fnName: functionID,
        bodyHash: parsedFn.bodyHash,
        paramNames: parsedFn.paramNames,
        code: parsedFn.code,
        pureFnDependencies: [],
    };

    // Run the factory once with a tracking proxy to auto-detect dependencies
    const {proxy, getDependencies} = createDependencyTrackingProxy();
    try {
        createPureFn(proxy);
    } catch {
        // Factory may fail if dependencies aren't registered yet, that's ok
        // We still capture whatever was accessed before the error
    }
    const detectedDeps = getDependencies();
    for (const dep of detectedDeps) {
        if (dep === functionID) continue;
        if (!compiled.pureFnDependencies.includes(dep)) compiled.pureFnDependencies.push(dep);
    }

    getJitUtils().addPureFn(namespace, compiled);
    return compiled;
}

/** Creates a proxy of jitUtils that records all pure function accesses (getPureFn, usePureFn, etc.) */
function createDependencyTrackingProxy(): {proxy: JITUtils; getDependencies: () => Set<string>} {
    const dependencies = new Set<string>();
    const realUtils = getJitUtils();

    const noopFn = () => () => {};

    const proxy = new Proxy(realUtils, {
        get(target, prop, receiver) {
            if (prop === 'getPureFn' || prop === 'usePureFn') {
                return (ns: string, fnName: string) => {
                    dependencies.add(fnName);
                    // Return a noop function so the factory can execute without errors
                    const real = target.getPureFn(ns, fnName);
                    return real ?? noopFn;
                };
            }
            if (prop === 'getCompiledPureFn') {
                return (ns: string, fnName: string) => {
                    dependencies.add(fnName);
                    return target.getCompiledPureFn(ns, fnName);
                };
            }
            if (prop === 'hasPureFn') {
                return (ns: string, fnName: string) => {
                    dependencies.add(fnName);
                    return target.hasPureFn(ns, fnName);
                };
            }
            if (prop === 'findCompiledPureFn') {
                return (fnName: string) => {
                    dependencies.add(fnName);
                    return target.findCompiledPureFn(fnName);
                };
            }
            return Reflect.get(target, prop, receiver);
        },
    });

    return {proxy, getDependencies: () => dependencies};
}
