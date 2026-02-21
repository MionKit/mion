/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JitFunctions} from './constants.functions.ts';
import {ReceiveType} from '@deepkit/type';
import {runType} from './createRunType.ts';
import {RunTypeOptions} from './types.ts';
import {
    FromBinaryFn,
    IsTypeFn,
    JsonStringifyFn,
    PrepareForJsonFn,
    RestoreFromJsonFn,
    ToBinaryFn,
    ToCodeFn,
    TypeErrorsFn,
} from '@mionkit/core';
import {BaseRunType} from './lib/baseRunTypes.ts';
import {registerJitFunctionCompiler} from './lib/jitFnsRegistry.ts';

// All these functions are async because they might need to compile the jit function first
// At the moment they are compiled synchronously, but in the future they might be async
// Also some the src code to compile or functionality of the JIT functions might be loaded dynamically
// ie: mocking functionality is loaded only when mockTypeFn is called

/** Returns a function that checks if the given value is of the specified type. */
export async function createIsTypeFn<T>(opts?: RunTypeOptions, type?: ReceiveType<T>): Promise<IsTypeFn> {
    const rt = runType(type);
    return rt.createJitFunction(JitFunctions.isType, opts);
}

/** Returns a function that get Type error data. */
export async function createTypeErrorsFn<T>(opts?: RunTypeOptions, type?: ReceiveType<T>): Promise<TypeErrorsFn> {
    const rt = runType(type);
    return rt.createJitFunction(JitFunctions.typeErrors, opts);
}

/**
 * Returns a function that prepares a javascript type to be compatible with json.stringify.
 * Allows json.stringify special types like dates, bigints, maps, set, etc... that are not supported by json.stringify
 */
export async function createPrepareForJsonFn<T>(opts?: RunTypeOptions, type?: ReceiveType<T>): Promise<PrepareForJsonFn> {
    const rt = runType(type);
    return rt.createJitFunction(JitFunctions.prepareForJson, opts);
}

/**
 * Returns a function that restores a javascript type from json.parse.
 * Allows restoring special types like dates, bigints, maps, set, etc... that are not supported by json.parse
 * */
export async function createRestoreFromJsonFn<T>(opts?: RunTypeOptions, type?: ReceiveType<T>): Promise<RestoreFromJsonFn> {
    const rt = runType(type);
    return rt.createJitFunction(JitFunctions.restoreFromJson, opts);
}

/**
 * Returns a function that stringifies a javascript value to a json string.
 * Stringifies special types like dates, bigints, maps, set, etc...
 * Is equivalent to calling prepareForJson and then json.stringify but more efficient.
 */
export async function createStringifyJsonFn<T>(opts?: RunTypeOptions, type?: ReceiveType<T>): Promise<JsonStringifyFn> {
    const rt = runType(type);
    return rt.createJitFunction(JitFunctions.stringifyJson, opts);
}

/** Returns a function that serializes any type value to a binary format. */
export async function createToBinaryFn<T>(opts?: RunTypeOptions, type?: ReceiveType<T>): Promise<ToBinaryFn> {
    const rt = runType(type);
    return rt.createJitFunction(JitFunctions.toBinary, opts);
}

/** Returns a function that deserializes a binary value to the specified type. */
export async function createFromBinaryFn<T>(opts?: RunTypeOptions, type?: ReceiveType<T>): Promise<FromBinaryFn> {
    const rt = runType(type);
    return rt.createJitFunction(JitFunctions.fromBinary, opts);
}

/** Returns a function that converts a value to javascript code, including set etc */
export function createToJavascriptFn<T>(opts?: RunTypeOptions, type?: ReceiveType<T>): ToCodeFn {
    const rt = runType(type);
    return rt.createJitFunction(JitFunctions.toJSCode, opts);
}

/** Returns a function that mocks a value of the specified type. */
export async function createMockTypeFn<T>(type?: ReceiveType<T>): Promise<(opts?: Partial<RunTypeOptions>) => T> {
    const rt = runType(type) as BaseRunType;
    await registerJitFunctionCompiler(JitFunctions.mock);
    return (opts?: Partial<RunTypeOptions>) => rt.mockType(opts) as T;
}
