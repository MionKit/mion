import {JitFunctions} from './constants';
import {ReceiveType} from './lib/_deepkit/src/reflection/reflection';
import {runType} from './runType';
import {IsTypeFn, TypeErrorsFn} from './types';

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

export function mockType<T>(type?: ReceiveType<T>): T {
    const rt = runType(type);
    return rt.mock() as T;
}
