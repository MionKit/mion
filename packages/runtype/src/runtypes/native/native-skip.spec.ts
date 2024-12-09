/* eslint-disable @typescript-eslint/ban-types */
/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../runType';
import {JitFnIDs} from '../../constants';
import {getJITFnHash} from '../../lib/jitCompiler';
import {jitUtils} from '../../lib/jitUtils';
import {NonSerializableRunType} from './nonSerializable';

/**
 * Non serializable types can create a RunType but will throw when trying to create a JIT function.
 * Non serializable types are automatically removed from other objects when serializing and deserializing.
 * Non serializable types are set to undefined when serializing and deserializing deserialize tuples and function arguments.
 *
 * List of all the native js types that are non serializable:
 * Function, Symbol, Promise, , Generator, GeneratorFunction, AsyncGenerator, Iterator, AsyncIterator, AsyncGeneratorFunction
 * Error, EvalError, RangeError, ReferenceError, SyntaxError, TypeError, URIError, AggregateError
 * Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array, BigInt64Array, BigUint64Array, DataView, ArrayBuffer, SharedArrayBuffer,
 *
 * */

describe('non serializable general behavior', () => {
    it('Ensure compiler operations are not stored in jit cache when an error is thrown', () => {
        const rt = runType<Int8Array>();
        expect(() => rt.createJitFunction(JitFnIDs.isType)).toThrow('Jit compilation disabled for Non Serializable types.');
        expect(jitUtils.getJIT(getJITFnHash(JitFnIDs.isType, rt as any))).toBe(undefined);
    });

    it('NonSerializableRunType should throw when calling any create jit function', () => {
        const rt = runType<Int8Array>();
        const errorMessage = `Jit compilation disabled for Non Serializable types.`;
        expect(() => rt.createJitFunction(JitFnIDs.isType)).toThrow(errorMessage);
        expect(() => rt.createJitFunction(JitFnIDs.typeErrors)).toThrow(errorMessage);
        expect(() => rt.createJitFunction(JitFnIDs.jsonEncode)).toThrow(errorMessage);
        expect(() => rt.createJitFunction(JitFnIDs.jsonDecode)).toThrow(errorMessage);
        expect(() => rt.createJitFunction(JitFnIDs.jsonStringify)).toThrow(errorMessage);
        expect(() => rt.mock()).toThrow(`Mock is disabled for Non Serializable types.`);
    });
});

// Some test are skipped as currently we cant differentiate the type at runtime
describe('non serializable iterables', () => {
    it('Generator should be an instance of NonSerializableRunType', () => {
        // src = { kind: 30, id: 2, types: [], annotations: {} }
        const rt = runType<Generator>();
        expect(rt).toBeInstanceOf(NonSerializableRunType);
    });
    it('GeneratorFunction should be an instance of NonSerializableRunType', () => {
        const rt = runType<GeneratorFunction>();
        expect(rt).toBeInstanceOf(NonSerializableRunType);
    });
    it('AsyncGenerator should be an instance of NonSerializableRunType', () => {
        const rt = runType<AsyncGenerator>();
        expect(rt).toBeInstanceOf(NonSerializableRunType);
    });
    it('Iterator should be an instance of NonSerializableRunType', () => {
        const rt = runType<Iterator<any>>();
        expect(rt).toBeInstanceOf(NonSerializableRunType);
    });
    it('AsyncGeneratorFunction should be an instance of NonSerializableRunType', () => {
        const rt = runType<AsyncGeneratorFunction>();
        expect(rt).toBeInstanceOf(NonSerializableRunType);
    });
    it('AsyncIterator should be an instance of NonSerializableRunType', () => {
        const rt = runType<AsyncIterator<any>>();
        expect(rt).toBeInstanceOf(NonSerializableRunType);
    });
});

// TODO: decide what to do with native errors, they should be easily serializable
describe('non serializable errors', () => {
    it('Error should be an instance of NonSerializableRunType', () => {
        const rt = runType<Error>();
        expect(rt).toBeInstanceOf(NonSerializableRunType);
    });
    it('EvalError should be an instance of NonSerializableRunType', () => {
        const rt = runType<EvalError>();
        expect(rt).toBeInstanceOf(NonSerializableRunType);
    });
    it('RangeError should be an instance of NonSerializableRunType', () => {
        const rt = runType<RangeError>();
        expect(rt).toBeInstanceOf(NonSerializableRunType);
    });
    it('ReferenceError should be an instance of NonSerializableRunType', () => {
        const rt = runType<ReferenceError>();
        expect(rt).toBeInstanceOf(NonSerializableRunType);
    });
    it('SyntaxError should be an instance of NonSerializableRunType', () => {
        const rt = runType<SyntaxError>();
        expect(rt).toBeInstanceOf(NonSerializableRunType);
    });
    it('TypeError should be an instance of NonSerializableRunType', () => {
        const rt = runType<TypeError>();
        expect(rt).toBeInstanceOf(NonSerializableRunType);
    });
    it('URIError should be an instance of NonSerializableRunType', () => {
        const rt = runType<URIError>();
        expect(rt).toBeInstanceOf(NonSerializableRunType);
    });
    // TODO: for some reason AggregateError is created with type kind = 0 (never)
    it.skip('AggregateError should be an instance of NonSerializableRunType', () => {
        const rt = runType<AggregateError>();
        expect(rt).toBeInstanceOf(NonSerializableRunType);
    });
});

describe('non serializable data types', () => {
    it('Int8Array should be an instance of NonSerializableRunType', () => {
        const rt = runType<Int8Array>();
        expect(rt).toBeInstanceOf(NonSerializableRunType);
    });
    it('Uint8Array should be an instance of NonSerializableRunType', () => {
        const rt = runType<Uint8Array>();
        expect(rt).toBeInstanceOf(NonSerializableRunType);
    });
    it('Uint8ClampedArray should be an instance of NonSerializableRunType', () => {
        const rt = runType<Uint8ClampedArray>();
        expect(rt).toBeInstanceOf(NonSerializableRunType);
    });
    it('Int16Array should be an instance of NonSerializableRunType', () => {
        const rt = runType<Int16Array>();
        expect(rt).toBeInstanceOf(NonSerializableRunType);
    });
    it('Uint16Array should be an instance of NonSerializableRunType', () => {
        const rt = runType<Uint16Array>();
        expect(rt).toBeInstanceOf(NonSerializableRunType);
    });
    it('Int32Array should be an instance of NonSerializableRunType', () => {
        const rt = runType<Int32Array>();
        expect(rt).toBeInstanceOf(NonSerializableRunType);
    });
    it('Uint32Array should be an instance of NonSerializableRunType', () => {
        const rt = runType<Uint32Array>();
        expect(rt).toBeInstanceOf(NonSerializableRunType);
    });
    it('Float32Array should be an instance of NonSerializableRunType', () => {
        const rt = runType<Float32Array>();
        expect(rt).toBeInstanceOf(NonSerializableRunType);
    });
    it('Float64Array should be an instance of NonSerializableRunType', () => {
        const rt = runType<Float64Array>();
        expect(rt).toBeInstanceOf(NonSerializableRunType);
    });
    it('BigInt64Array should be an instance of NonSerializableRunType', () => {
        const rt = runType<BigInt64Array>();
        expect(rt).toBeInstanceOf(NonSerializableRunType);
    });
    it('BigUint64Array should be an instance of NonSerializableRunType', () => {
        const rt = runType<BigUint64Array>();
        expect(rt).toBeInstanceOf(NonSerializableRunType);
    });
    it('ArrayBuffer should be an instance of NonSerializableRunType', () => {
        const rt = runType<ArrayBuffer>();
        expect(rt).toBeInstanceOf(NonSerializableRunType);
    });
    it('DataView should be an instance of NonSerializableRunType', () => {
        const rt = runType<DataView>();
        expect(rt).toBeInstanceOf(NonSerializableRunType);
    });

    it('SharedArrayBuffer should be an instance of NonSerializableRunType', () => {
        const rt = runType<SharedArrayBuffer>();
        expect(rt).toBeInstanceOf(NonSerializableRunType);
    });
});
