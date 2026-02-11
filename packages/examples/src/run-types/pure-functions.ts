import {GenericPureFunction, registerPureFnClosure} from '@mionkit/core';

/** @reflection never */
export function isOdd() {
    return function _isOdd(value: string): boolean {
        return value.length > 0;
    } as GenericPureFunction<any>;
}

// Register the pure function with a namespace for use in JIT compilation
registerPureFnClosure('myNamespace', isOdd);
