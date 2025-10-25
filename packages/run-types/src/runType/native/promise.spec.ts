/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../lib/createRunType';
import {JitFunctions} from '../../constants.functions';

const rt = runType<Promise<string>>();

it('all jit compile function should throw and error', () => {
    const errorMessage = `Jit compilation disabled for Non Serializable types.`;
    expect(() => rt.createJitFunction(JitFunctions.isType)).toThrow(errorMessage);
    expect(() => rt.createJitFunction(JitFunctions.typeErrors)).toThrow(errorMessage);
    expect(() => rt.createJitFunction(JitFunctions.toJsonVal)).toThrow(errorMessage);
    expect(() => rt.createJitFunction(JitFunctions.fromJsonVal)).toThrow(errorMessage);
    // jsonStringify test moved to packages/run-types/src/jitCompilers/json/jsonStringify.spec.ts (lines 1845-1847)
});

it('mock', async () => {
    // when promises are returned they are automatically resolved
    const result = await rt.mock();
    expect(typeof result).toBe('string');
});

it('mock with reject', async () => {
    try {
        // when promises are returned they are automatically resolved/rejected
        await rt.mock({mock: {promiseTimeOut: 1, promiseReject: new Error('rejected')}});
        throw new Error('promise not rejected');
    } catch (error: any) {
        // eslint-disable-next-line jest/no-conditional-expect
        expect(error.message).toBe('rejected');
    }
});

// it('all native types should be instance of NonSerializableRunType', () => {
//     const typesToTest = [
//         // general
//         // runType<Function>(), // function has it's on RunType
//         runType<Symbol>(),
//         // runType<Promise<any>>(), // promise has it's on RunType
//         runType<Generator>(),
//         runType<GeneratorFunction>(),
//         runType<AsyncGenerator>(),
//         runType<Iterator<any>>(),
//         runType<AsyncGeneratorFunction>(),
//         runType<AsyncIterator<any>>(),
//         // errors
//         runType<Error>(),
//         runType<EvalError>(),
//         runType<RangeError>(),
//         runType<ReferenceError>(),
//         runType<SyntaxError>(),
//         runType<TypeError>(),
//         runType<URIError>(),
//         runType<AggregateError>(),
//         // typed arrays
//         runType<Int8Array>(),
//         runType<Uint8Array>(),
//         runType<Uint8ClampedArray>(),
//         runType<Int16Array>(),
//         runType<Uint16Array>(),
//         runType<Int32Array>(),
//         runType<Uint32Array>(),
//         runType<Float32Array>(),
//         runType<Float64Array>(),
//         runType<BigInt64Array>(),
//         runType<BigUint64Array>(),
//         runType<DataView>(),
//         runType<ArrayBuffer>(),
//         runType<SharedArrayBuffer>(),
//     ];
//     for (const rt of typesToTest) {
//         expect(rt).toBeInstanceOf(NonSerializableRunType);
//     }
// });
