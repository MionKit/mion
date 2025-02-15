import {JitFunctions} from './constants';
import {ReceiveType} from './lib/_deepkit/src/reflection/reflection';
import {runType} from './runType';

// all these functions are async because they might need to compile the jit function first
// at the moment they are compiled synchronously, but in the future they might be async

/** Returns a function that checks if the given value is of the specified type. */
export async function isTypeFn<T>(type?: ReceiveType<T>): Promise<(value: any) => boolean> {
    const rt = runType(type);
    return rt.createJitFunction(JitFunctions.isType);
}
