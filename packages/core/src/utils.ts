/* ###############
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ############### */

import {resolve} from 'path/posix';
import {fileURLToPath} from 'url';
import {getJitUtils} from './jit/jitUtils.ts';
import type {CompiledPureFunction} from './types/pureFunctions.types.ts';

/** Generates a random UUID V7, no hyphens are included in the uuid */
export function randomUUID_V7(): string {
    const uuid = crypto.randomUUID();
    const timestamp = BigInt(Date.now());
    const tHex = timestamp.toString(16).padStart(12, '0');
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

let isTest: boolean | undefined = undefined;
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

/**
 * Dynamically imports a module, using require() in CJS and import() in ESM.
 * This prevents dual module loading issues when the same package is loaded
 * via both CJS (require) and ESM (import) in Node.js.
 *
 * In CJS environments, this uses require() to ensure the module is loaded
 * through the CommonJS cache, avoiding duplicate module instances.
 * In ESM environments, this falls back to dynamic import().
 */
export async function importModule<T>(moduleName: string, callerDir?: string): Promise<T> {
    const resolvedPath = moduleName.startsWith('.') && callerDir ? resolve(callerDir, moduleName) : moduleName;
    // Always use dynamic import() for ESM compatibility
    // This works in both ESM and CJS environments when the package uses dual module output
    return import(resolvedPath) as Promise<T>;
}

/** Resolves a module path in both CJS and ESM environments. */
export async function resolveModule(moduleName: string, callerDir?: string): Promise<string> {
    const resolvedPath = moduleName.startsWith('.') && callerDir ? resolve(callerDir, moduleName) : moduleName;
    const metaResolve = getImportMetaResolve();
    if (metaResolve) {
        const resolved = await metaResolve(resolvedPath);
        if (resolved) return resolved.startsWith('file:') ? fileURLToPath(resolved) : resolved;
    }

    try {
        if (typeof require !== 'undefined' && typeof require.resolve === 'function') return require.resolve(resolvedPath);
    } catch {
        // Ignore and fall back to createRequire
    }

    try {
        const {createRequire} = await import('module');
        const basePath = callerDir ? resolve(callerDir, 'noop.js') : resolve(process.cwd(), 'noop.js');
        const requireFn = createRequire(basePath);
        return requireFn.resolve(resolvedPath);
    } catch (err) {
        throw new Error(`Failed to resolve module "${moduleName}": ${err instanceof Error ? err.message : String(err)}`);
    }
}

function getImportMetaResolve(): ((specifier: string) => string | Promise<string> | undefined) | undefined {
    try {
        // eslint-disable-next-line no-new-func
        return new Function('specifier', 'return import.meta.resolve?.(specifier);') as (
            specifier: string
        ) => string | Promise<string> | undefined;
    } catch {
        return undefined;
    }
}
