import {JitFunctions} from './constants';
import {ReceiveType} from '@deepkit/type';
import {runType} from './lib/runType';
import {IsTypeFn, MockOptions, TypeErrorsFn} from './types';
import {BaseRunType} from './lib/baseRunTypes';
import {loadComposableFunction} from './lib/jitFnsRegistry';

// all these functions are async because they might need to compile the jit function first
// at the moment they are compiled synchronously, but in the future they might be async

/** Returns a function that checks if the given value is of the specified type. */
export async function isTypeFn<T>(type?: ReceiveType<T>): Promise<IsTypeFn> {
    const rt = runType(type);
    return rt.createJitFunction(JitFunctions.isType);
}

/** Returns a function that get Type error data. */
export async function typeErrorsFn<T>(type?: ReceiveType<T>): Promise<TypeErrorsFn> {
    const rt = runType(type);
    return rt.createJitFunction(JitFunctions.typeErrors);
}

/** Returns a function that checks if the given value is of the specified type, but ignore type transformations like uppercase, lowercase etc */
export async function isStrictTypeFn<T>(type: ReceiveType<T>): Promise<IsTypeFn> {
    const rt = runType(type);
    return rt.createJitFunction(JitFunctions.isTypeStrict);
}

/** Returns a function that mocks a value of the specified type. */
export async function mockTypeFn<T>(type?: ReceiveType<T>): Promise<(opts?: Partial<MockOptions>) => T> {
    const rt = runType(type) as BaseRunType;
    await loadComposableFunction(JitFunctions.mock);
    return (opts?: Partial<MockOptions>) => rt.mockType(opts) as T;
}
