/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../runType';
import {JitFnIDs} from '../../constants';

const rt = runType<Promise<string>>();

it('all jit compile function should throw and error', () => {
    const errorMessage = `Jit compilation disabled for Non Serializable types.`;
    expect(() => rt.createJitFunction(JitFnIDs.isType)).toThrow(errorMessage);
    expect(() => rt.createJitFunction(JitFnIDs.typeErrors)).toThrow(errorMessage);
    expect(() => rt.createJitFunction(JitFnIDs.jsonEncode)).toThrow(errorMessage);
    expect(() => rt.createJitFunction(JitFnIDs.jsonDecode)).toThrow(errorMessage);
    expect(() => rt.createJitFunction(JitFnIDs.jsonStringify)).toThrow(errorMessage);
});

it('mock', async () => {
    const mock = rt.mock();
    const result = await mock;
    expect(mock instanceof Promise).toBe(true);
    expect(typeof result).toBe('string');
});

it('mock with reject', async () => {
    try {
        const mock = rt.mock({promiseTimeOut: 1, promiseReject: new Error('rejected')});
        await mock;
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
