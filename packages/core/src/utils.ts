/* ###############
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ############### */

import {getJitUtils} from './jit/jitUtils.ts';
import type {CompiledPureFunction} from './types/pureFunctions.types.ts';

/** Stores singleton state on globalThis so it survives dual module loading (e.g. CJS + ESM copies).
 *  noExternal remains the primary mechanism — this is defense-in-depth and a code-level signal that
 *  the binding is intended to be a process-wide singleton. */
export function getOrCreateGlobal<T>(key: string, factory: () => T): T {
    const sym = Symbol.for(key);
    return ((globalThis as any)[sym] ??= factory()) as T;
}

/** Generates a random UUID V7 (RFC 9562),
 * uses crypto.randomUUID() (v4) as random source as it's a native C++ binding that batches entropy,
 * might be faster than allocating typed arrays via crypto.getRandomValues */
export function randomUUID_V7(): string {
    const uuid = crypto.randomUUID();
    const tHex = Date.now().toString(16).padStart(12, '0');
    return `${tHex.substring(0, 8)}-${tHex.substring(8)}-7${uuid.substring(15)}`;
}

/**
 * Browser-safe function to access environment variables.
 * Returns undefined when running in browser environments where process is not available.
 * @param key - The environment variable key to retrieve
 * @returns The environment variable value or undefined if not available/in browser
 */
export function getENV(key: string): string | undefined {
    if (typeof process !== 'undefined' && process.env) {
        return process.env[key];
    }
    return undefined;
}

// ############# Base64 URL #############

/** Encodes a string to URL-safe base64 (RFC 4648 §5) without padding */
export function toBase64Url(str: string): string {
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decodes a URL-safe base64 string (RFC 4648 §5) back to a string */
export function fromBase64Url(encoded: string): string {
    return atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
}

let isTest: boolean | undefined = undefined;
/** Whether the process is in mion compile mode (buildOnly or middleware).
 * In these modes platform adapters skip server.listen() — the server does NOT start. */
export function isMionCompileMode(): boolean {
    const val = getENV('MION_COMPILE');
    return val === 'buildOnly' || val === 'middleware';
}

/** Whether AOT caches should be generated and emitted (buildOnly, middleware, or childProcess).
 * Unlike isMionCompileMode(), this also includes 'childProcess' mode where the server DOES start
 * and keeps running after emitting AOT caches via IPC. */
export function isMionAOTEmitMode(): boolean {
    const val = getENV('MION_COMPILE');
    return val === 'buildOnly' || val === 'middleware' || val === 'childProcess';
}

export function isTestEnv() {
    if (isTest !== undefined) return isTest;
    isTest = getENV('VITEST') !== undefined || getENV('NODE_ENV') === 'test';
    return isTest;
}

/**
 * Restores the full state of a compiled pure function,
 * The pure function itself can't be compiled to code as it contains references to context code and jitUtils.
 * So we need to restore it manually by invoking the closure function.
 * */
export function initPureFunction(compiled: CompiledPureFunction): asserts compiled is Required<CompiledPureFunction> {
    if (compiled.fn) return;
    compiled.fn = compiled.createPureFn(getJitUtils());
}
