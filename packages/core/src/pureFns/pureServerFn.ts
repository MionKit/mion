/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {PureFnDef, PureServerFnRef} from '../types/pureFunctions.types.ts';

/** The namespace used for all pureServerFn functions */
export const PURE_SERVER_FN_NAMESPACE = 'pureServerFn';

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  WARNING: This function's call signature is parsed by the mion vite plugin  ║
// ║  at build time (see devtools/src/vite-plugin/extractPureFn.ts).             ║
// ║  Do NOT rename, change the parameter order, or modify the function          ║
// ║  signature without updating the corresponding AST extraction and            ║
// ║  transformer logic in @mionkit/devtools.                                    ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

/**
 * Defines a pure server function that will be extracted at build time and executed on the server.
 * At runtime, this returns a lightweight reference containing a PureServerFnRef.
 *
 * The bodyHash is injected at build time by the mion vite plugin's transform hook.
 *
 * Pure Server FN Rules:
 * - No closure variables
 * - No external imports except other pureServerFn references
 * - The 'pureServerFn' namespace is assigned automatically
 * - Functions can be named or anonymous (bodyHash is used as identifier)
 *
 * This is intended so clients can define functions that can be safely executed in the server
 */
export function pureServerFn<F extends (...args: any[]) => any>(pureFn: F, bodyHash?: string): PureServerFnRef<F>;
export function pureServerFn<F extends (...args: any[]) => any>(def: PureFnDef<F>, bodyHash?: string): PureServerFnRef<F>;
export function pureServerFn<F extends (...args: any[]) => any>(
    defOrFn: PureFnDef<F> | F,
    bodyHash?: string // injected by mion vite plugin
): PureServerFnRef<F> {
    // Important: bodyHash is injected at build time by mion vite plugin
    if (!bodyHash) throw new Error('pureServerFn requires mion vite plugin transform to inject bodyHash');
    const isFn = typeof defOrFn === 'function';
    const def: PureFnDef<F> = isFn ? {pureFn: defOrFn, fnName: bodyHash} : defOrFn;
    const namespace = def.namespace || PURE_SERVER_FN_NAMESPACE;
    // When a plain function is passed directly, always use bodyHash as fnName to avoid collisions
    const fnName = def.fnName || def.pureFn.name || bodyHash;
    const isFactory = def.isFactory || false;
    return {namespace, fnName, bodyHash, pureFn: def.pureFn, isFactory};
}
