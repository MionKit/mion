/* ###############
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ############### */

import {MAX_STACK_DEPTH} from './constants';
import {getJitUtils} from './jitUtils';
import type {CompiledPureFunction, PureFunction} from './types/general.types';

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
    isTest = getENV('JEST_WORKER_ID') !== undefined || getENV('NODE_ENV') === 'test';
    return isTest;
}

/**
 * Checks if key map can be serialized/deserialized with json and still works as a key for a map.
 * ie: if a map key is an string, it can be serialized to json and deserialized back an still will identify the correct map entry.
 * ie: if a map entry is an object, the object can not be serialized/deserialized and wont work as the same key for entry map as they are not same memory ref.
 *  */
export function isSafeMapKeyValue(value: any, depth = 0): boolean {
    if (depth > MAX_STACK_DEPTH) return false;
    if (value === undefined) return true;
    if (value === null) return true;
    const type = typeof value;
    if (type === 'number' || type === 'string' || type === 'boolean') return true;
    return false;
}

/**
 * Restores the full state of a compiled pure function,
 * The pure function itself can't be compiled to code as it contains references to context code and jitUtils.
 * So we need to restore it manually by invoking the closure function.
 * */
export function initPureFunction(compiled: CompiledPureFunction): asserts compiled is Required<CompiledPureFunction> {
    if (compiled.fn) return;
    if (getENV('MION_COMPILE') === 'true' || getENV('JEST_WORKER_ID') !== undefined) {
        const {paramNames, code: body} = compiled;
        try {
            // when testing we immediately add the deserialized function to ensure test are working with deserialized functions
            // this is to ensure that the deserialization process is working correctly
            // this process is not needed in production as the original function is used
            const newWithCtx = paramNames.length ? new Function(...paramNames, body) : new Function(body);
            compiled.fn = newWithCtx(getJitUtils()) as PureFunction;
            return;
        } catch (error: any) {
            console.warn(
                `Pure ${compiled.pureFnHash} can not be deserialized. Function code:\n${compiled.createJitFn.toString()}`
            );
            throw new Error(`Pure function ${compiled.pureFnHash} can not be deserialized: ${error?.message}`);
        }
    }
    compiled.fn = compiled.createJitFn(getJitUtils());
}
