/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JitFunctions} from '../../../constants.functions';
import {FunctionRunType} from '../../../nodes/function/function';
import {reflectFunction} from '../../../createRunType';
import {serContext, desContext, roundTrip} from './binaryHelpers';
import {StrictArrayBuffer} from '@mionkit/core';

const SERIALIZE_FN = JitFunctions.toBinary;
const DESERIALIZE_FN = JitFunctions.fromBinary;

/** Helper to create serialization functions for function params */
function createSerializationParamsFn(rt: FunctionRunType) {
    const toBinary = rt.createJitParamsFunction(SERIALIZE_FN);
    const fromBinary = rt.createJitParamsFunction(DESERIALIZE_FN);
    const serialize = (v: any) => (toBinary(v, serContext), serContext.getBuffer());
    const deserialize = (data: StrictArrayBuffer) => (desContext.setBuffer(data), fromBinary(undefined, desContext));
    return {serialize, deserialize};
}

// Test function with all required params
function testFnAllRequired(a: string, b: number, c: boolean): void {}

// Test function with mixed required and optional params
function testFnMixed(a: string, b?: number, c?: boolean): void {}

// Test function with complex types
interface TestObj {
    name: string;
    value: number;
}
function testFnComplex(obj: TestObj, arr: number[], date: Date): void {}

describe('Binary serialization: function params are always optional', () => {
    it('should serialize all params as optional by default for function params', () => {
        const rt = reflectFunction(testFnAllRequired);
        const {serialize, deserialize} = createSerializationParamsFn(rt);

        // Test with all params present
        const fullParams = ['hello', 42, true];
        const {deserialized: fullResult} = roundTrip(serialize, deserialize, fullParams);
        expect(fullResult).toEqual(fullParams);

        // Test with some params undefined (all function params are optional in binary)
        const partialParams = ['hello', undefined, true];
        const {deserialized: partialResult} = roundTrip(serialize, deserialize, partialParams);
        expect(partialResult).toEqual(partialParams);

        // Test with all params undefined
        const emptyParams = [undefined, undefined, undefined];
        const {deserialized: emptyResult} = roundTrip(serialize, deserialize, emptyParams);
        expect(emptyResult).toEqual(emptyParams);
    });

    it('should serialize only first param with value', () => {
        const rt = reflectFunction(testFnAllRequired);
        const {serialize, deserialize} = createSerializationParamsFn(rt);

        const params = ['hello', undefined, undefined];
        const {deserialized} = roundTrip(serialize, deserialize, params);
        expect(deserialized).toEqual(params);
    });

    it('should serialize only middle param with value', () => {
        const rt = reflectFunction(testFnAllRequired);
        const {serialize, deserialize} = createSerializationParamsFn(rt);

        const params = [undefined, 42, undefined];
        const {deserialized} = roundTrip(serialize, deserialize, params);
        expect(deserialized).toEqual(params);
    });

    it('should serialize only last param with value', () => {
        const rt = reflectFunction(testFnAllRequired);
        const {serialize, deserialize} = createSerializationParamsFn(rt);

        const params = [undefined, undefined, true];
        const {deserialized} = roundTrip(serialize, deserialize, params);
        expect(deserialized).toEqual(params);
    });

    it('should work with functions that already have optional params', () => {
        const rt = reflectFunction(testFnMixed);
        const {serialize, deserialize} = createSerializationParamsFn(rt);

        // Test with all params present
        const fullParams = ['hello', 42, true];
        const {deserialized: fullResult} = roundTrip(serialize, deserialize, fullParams);
        expect(fullResult).toEqual(fullParams);

        // Test with first param undefined (normally required, but all fn params are optional in binary)
        const firstUndefined = [undefined, 42, true];
        const {deserialized: firstUndefinedResult} = roundTrip(serialize, deserialize, firstUndefined);
        expect(firstUndefinedResult).toEqual(firstUndefined);

        // Test with all params undefined
        const allUndefined = [undefined, undefined, undefined];
        const {deserialized: allUndefinedResult} = roundTrip(serialize, deserialize, allUndefined);
        expect(allUndefinedResult).toEqual(allUndefined);
    });

    it('should work with complex types', () => {
        const rt = reflectFunction(testFnComplex);
        const {serialize, deserialize} = createSerializationParamsFn(rt);

        // Test with all params present
        const fullParams = [{name: 'test', value: 123}, [1, 2, 3], new Date('2025-01-01')];
        const {deserialized: fullResult} = roundTrip(serialize, deserialize, fullParams);
        expect(fullResult).toEqual(fullParams);

        // Test with some params undefined
        const partialParams = [{name: 'test', value: 123}, undefined, new Date('2025-01-01')];
        const {deserialized: partialResult} = roundTrip(serialize, deserialize, partialParams);
        expect(partialResult).toEqual(partialParams);

        // Test with only first param
        const onlyFirst = [{name: 'test', value: 123}, undefined, undefined];
        const {deserialized: onlyFirstResult} = roundTrip(serialize, deserialize, onlyFirst);
        expect(onlyFirstResult).toEqual(onlyFirst);
    });

    it('should correctly serialize and deserialize even when all values are present', () => {
        function differentFn(x: string, y: number, z: boolean): void {}

        const rt = reflectFunction(differentFn);
        const {serialize, deserialize} = createSerializationParamsFn(rt);

        const params = ['hello', 42, true];
        const {deserialized} = roundTrip(serialize, deserialize, params);
        expect(deserialized).toEqual(params);
    });

    it('should handle empty params array', () => {
        function emptyFn(): void {}
        const rt = reflectFunction(emptyFn);
        const {serialize, deserialize} = createSerializationParamsFn(rt);

        const params: any[] = [];
        const {deserialized} = roundTrip(serialize, deserialize, params);
        expect(deserialized).toEqual(params);
    });

    it('should handle single param function', () => {
        function singleParamFn(a: string): void {}
        const rt = reflectFunction(singleParamFn);
        const {serialize, deserialize} = createSerializationParamsFn(rt);

        // Test with param present
        const withParam = ['hello'];
        const {deserialized: withParamResult} = roundTrip(serialize, deserialize, withParam);
        expect(withParamResult).toEqual(withParam);

        // Test with param undefined
        const withUndefined = [undefined];
        const {deserialized: withUndefinedResult} = roundTrip(serialize, deserialize, withUndefined);
        expect(withUndefinedResult).toEqual(withUndefined);
    });

    it('should handle many params (more than 8 to test bitmap overflow)', () => {
        function manyParamsFn(
            a: string,
            b: number,
            c: boolean,
            d: string,
            e: number,
            f: boolean,
            g: string,
            h: number,
            i: boolean,
            j: string
        ): void {}
        const rt = reflectFunction(manyParamsFn);
        const {serialize, deserialize} = createSerializationParamsFn(rt);

        // Test with all params present
        const fullParams = ['a', 1, true, 'd', 2, false, 'g', 3, true, 'j'];
        const {deserialized: fullResult} = roundTrip(serialize, deserialize, fullParams);
        expect(fullResult).toEqual(fullParams);

        // Test with alternating undefined
        const alternating = ['a', undefined, true, undefined, 2, undefined, 'g', undefined, true, undefined];
        const {deserialized: alternatingResult} = roundTrip(serialize, deserialize, alternating);
        expect(alternatingResult).toEqual(alternating);

        // Test with all undefined
        const allUndefined = [
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
        ];
        const {deserialized: allUndefinedResult} = roundTrip(serialize, deserialize, allUndefined);
        expect(allUndefinedResult).toEqual(allUndefined);
    });

    it('should produce different hashes for different paramsSlice options', () => {
        function sliceTestFn(ctx: any, a: string, b: number): void {}
        const rt = reflectFunction(sliceTestFn);

        // Get hash without paramsSlice
        const hashWithoutSlice = rt.getParameters().getJitHash({});

        // Get hash with paramsSlice
        const hashWithSlice = rt.getParameters().getJitHash({paramsSlice: {start: 1}});

        // Hashes should be different since paramsSlice affects the hash
        expect(hashWithSlice).not.toBe(hashWithoutSlice);
    });
});
