/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JitFunctions} from './constants.functions';
import {ReceiveType} from '@deepkit/type';
import {runType} from './lib/runType';
import {RunTypeOptions} from './types';
import {IsTypeFn, ToCodeFn, TypeErrorsFn} from '@mionkit/core';
import {BaseRunType} from './lib/baseRunTypes';
import {registerJitFunctionCompiler} from './lib/jitFnsRegistry';

// All these functions are async because they might need to compile the jit function first
// At the moment they are compiled synchronously, but in the future they might be async
// Also some the src code to compile or functionality of the JIT functions might be loaded dynamically
// ie: mocking functionality is loaded only when mockTypeFn is called

/** Returns a function that checks if the given value is of the specified type. */
export async function isTypeFn<T>(opts?: RunTypeOptions, type?: ReceiveType<T>): Promise<IsTypeFn> {
    const rt = runType(type);
    return rt.createJitFunction(JitFunctions.isType, opts);
}

/** Returns a function that get Type error data. */
export async function typeErrorsFn<T>(opts?: RunTypeOptions, type?: ReceiveType<T>): Promise<TypeErrorsFn> {
    const rt = runType(type);
    return rt.createJitFunction(JitFunctions.typeErrors, opts);
}

/** Returns a function that checks if the given value is of the specified type, but ignore type transformations like uppercase, lowercase etc */
export async function isStrictTypeFn<T>(opts?: RunTypeOptions, type?: ReceiveType<T>): Promise<IsTypeFn> {
    const rt = runType(type);
    return rt.createJitFunction(JitFunctions.isTypeStrict, opts);
}

/** Returns a function that mocks a value of the specified type. */
export async function mockTypeFn<T>(type?: ReceiveType<T>): Promise<(opts?: Partial<RunTypeOptions>) => T> {
    const rt = runType(type) as BaseRunType;
    await registerJitFunctionCompiler(JitFunctions.mock);
    return (opts?: Partial<RunTypeOptions>) => rt.mockType(opts) as T;
}

/** Returns a function that mocks a value of the specified type. */
export function toJavascriptFn<T>(opts?: RunTypeOptions, type?: ReceiveType<T>): ToCodeFn {
    const rt = runType(type) as BaseRunType;
    return rt.createJitFunction(JitFunctions.toJavascript, opts);
}
