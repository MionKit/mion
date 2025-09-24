/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {reflectFunction, runType} from '../../lib/runType';
import {JitFunctions} from '../../constants.functions';
import {FunctionRunType} from './function';

type FunctionType = (a: number, b: boolean, c?: string) => Date;
type FunctionType2 = (a: Date, b?: boolean) => bigint; // requires encode/decode
type RestFunctionType = (a: number, b: boolean, ...c: Date[]) => Date;
type Rest2FunctionType = (...a: number[]) => Date;
function sum(a: number, b: number, c?: number): number {
    return a + b + (c || 0);
}
function sumWithDefault(a: number, b: number = 2, c?: number): number {
    return a + b + (c || 0);
}
function sumRest(a: number, b: number, ...c: number[]): number {
    return a + b + c.reduce((acc, v) => acc + v, 0);
}

const rt = runType<FunctionType>() as FunctionRunType;
const rt2 = runType<FunctionType2>() as FunctionRunType;
const rtRest = runType<RestFunctionType>() as FunctionRunType;
const rtRest2 = runType<Rest2FunctionType>() as FunctionRunType;
const rtSum = reflectFunction(sum) as FunctionRunType;
const rtSumWithDefault = reflectFunction(sumWithDefault) as FunctionRunType;
const rtSumRest = reflectFunction(sumRest) as FunctionRunType;

describe('function', () => {
    it('validate', () => {
        const validate = rtSum.createJitFunction(JitFunctions.isType);
        const getTypeErrors = rtSum.createJitFunction(JitFunctions.typeErrors);

        expect(rtSum.getFamily()).toBe('F');
        expect(rtSum.getFnName()).toBe('sum');
        expect(sum.length).toBe(3);

        expect(rtSumWithDefault.getFamily()).toBe('F');
        expect(rtSumWithDefault.getFnName()).toBe('sumWithDefault');
        expect(sumWithDefault.length).toBe(1);

        expect(rtSumRest.getFamily()).toBe('F');
        expect(rtSumRest.getFnName()).toBe('sumRest');
        expect(sumRest.length).toBe(2);

        expect(validate(sum)).toBe(true);
        expect(getTypeErrors(sum)).toEqual([]);

        expect(validate(() => null)).toBe(false);
        expect(getTypeErrors(() => null)).toEqual([{expected: 'function', path: []}]);

        // returns true because function name and length are the same, even if it is a different function
        // we cant know param types or return type at runtime
        expect(validate(function sum(s, b, c) {})).toBe(true);
    });

    it('throw errors for json encode/decode, jsonStringify and mock', async () => {
        expect(() => rt.createJitFunction(JitFunctions.isType)).not.toThrow();
        expect(() => rt.createJitFunction(JitFunctions.typeErrors)).not.toThrow();

        expect(() => rt.createJitFunction(JitFunctions.toJsonVal)).toThrow(
            `Compile function ToJsonVal not supported, call compileParams or compileReturn instead.`
        );
        expect(() => rt.createJitFunction(JitFunctions.fromJsonVal)).toThrow(
            `Compile function FromJsonVal not supported, call compileParams or compileReturn instead.`
        );

        // Test moved to packages/run-types/src/jitCompilers/json/jsonStringify.spec.ts (lines 264-268)
        await expect(() => rt.mock()).rejects.toThrow('Mock is not allowed, call mockParams or mockReturn instead.');
    });
});

describe('function parameters', () => {
    it('validate function parameters', () => {
        const validate = rt.createJitParamsFunction(JitFunctions.isType);

        expect(validate([3, true, 'hello'])).toBe(true);
        // optional parameter
        expect(validate([3, false])).toBe(true);
        // wrong type
        expect(validate([3, 3, 3])).toBe(false);
        // more parameters than expected
        expect(validate([3, true, 'hello', 7])).toBe(false);
    });

    it('validate function + errors parameters', () => {
        const validate = rt.createJitParamsFunction(JitFunctions.typeErrors);
        expect(validate([3, true, 'hello'])).toEqual([]);
        // optional parameter
        expect(validate([3, false])).toEqual([]);
        // wrong type
        expect(validate([3, 3, 3])).toEqual([
            {expected: 'boolean', path: [1]},
            {expected: 'string', path: [2]},
        ]);
        // more parameters than expected
        expect(validate([3, true, 'hello', 7])).toEqual([{expected: 'params', path: []}]);
        /// les parameters than expected
        expect(validate([3])).toEqual([{expected: 'boolean', path: [1]}]);
    });

    it('encode/decode to json parameters', () => {
        const toJsonVal = rt.createJitParamsFunction(JitFunctions.toJsonVal);
        const fromJsonVal = rt.createJitParamsFunction(JitFunctions.fromJsonVal);
        const typeValue = [3, true, 'hello'];
        const typeValue2 = [3, true];

        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(typeValue))))).toEqual(typeValue);
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(typeValue2))))).toEqual(typeValue2);
    });

    it('required encode/decode to json parameters', () => {
        const toJsonVal = rt2.createJitParamsFunction(JitFunctions.toJsonVal);
        const fromJsonVal = rt2.createJitParamsFunction(JitFunctions.fromJsonVal);
        const d = new Date();
        const typeValue = [d, true];
        const typeValue2 = [d];
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(typeValue))))).toEqual(typeValue);
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(typeValue2))))).toEqual(typeValue2);
    });

    // Test moved to packages/run-types/src/jitCompilers/json/jsonStringify.spec.ts (lines 274-284)

    // Test moved to packages/run-types/src/jitCompilers/json/jsonStringify.spec.ts (lines 428-439)

    it('mock parameters', async () => {
        const mocked = await rt.mockParams();
        expect(Array.isArray(mocked)).toBe(true);
        expect(mocked.length >= 2 && mocked.length <= 3).toBe(true);
        const validate = rt.createJitParamsFunction(JitFunctions.isType);
        const mockedParams = await rt.mockParams();
        expect(validate(mockedParams)).toBe(true);
    });
});

describe('non serializable parameters', () => {
    type FunctionType = (a: number, b: boolean, c: () => any) => Date; // c is not serializable
    const rtWithFN = runType<FunctionType>() as FunctionRunType;

    it('validate non serializable types must be undefined', () => {
        const validate = rtWithFN.createJitParamsFunction(JitFunctions.isType);
        expect(validate([3, true, () => null])).toBe(false); // non serializable types must be null
        expect(validate([3, true, undefined])).toBe(true); // non serializable types must be null
    });

    it('get errors from non serializable types', () => {
        const validate = rtWithFN.createJitParamsFunction(JitFunctions.typeErrors);
        expect(validate([3, true, () => null])).toEqual([{expected: 'undefined', path: [2]}]);
        expect(validate([3, true, undefined])).toEqual([]);
    });

    it('encode/decode to json non serializable types', () => {
        const toJsonVal = rtWithFN.createJitParamsFunction(JitFunctions.toJsonVal);
        const fromJsonVal = rtWithFN.createJitParamsFunction(JitFunctions.fromJsonVal);
        const typeValue = [3, true, () => null];
        const typeValue2 = [3, true, undefined];
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(typeValue))))).toEqual([3, true, undefined]);
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(typeValue2))))).toEqual([3, true, undefined]);
    });

    // Test moved to packages/run-types/src/jitCompilers/json/jsonStringify.spec.ts (lines 476-486)

    it('mock non serializable types', async () => {
        const mocked = await rtWithFN.mockParams();
        expect(Array.isArray(mocked)).toBe(true);
        expect(mocked.length >= 2 && mocked.length <= 3).toBe(true);
        const validate = rtWithFN.createJitParamsFunction(JitFunctions.isType);
        const mockedParams = await rtWithFN.mockParams();
        expect(validate(mockedParams)).toBe(true);
    });
});

describe('function return', () => {
    it('validate function return', () => {
        const validate = rt.createJitReturnFunction(JitFunctions.isType);
        expect(validate(new Date())).toBe(true);
        expect(validate(123)).toBe(false);
    });

    it('validate function return + errors', () => {
        const validate = rt.createJitReturnFunction(JitFunctions.typeErrors);
        expect(validate(new Date())).toEqual([]);
        expect(validate(123)).toEqual([{expected: 'date', path: []}]);
    });

    it('encode/decode function return to json', () => {
        const toJsonVal = rt.createJitReturnFunction(JitFunctions.toJsonVal);
        const fromJsonVal = rt.createJitReturnFunction(JitFunctions.fromJsonVal);
        const returnValue = new Date();
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(returnValue))))).toEqual(returnValue);
    });

    it('required encode/decode function return to json', () => {
        const toJsonVal = rt2.createJitReturnFunction(JitFunctions.toJsonVal);
        const fromJsonVal = rt2.createJitReturnFunction(JitFunctions.fromJsonVal);
        const returnValue = 1n;

        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(returnValue))))).toEqual(returnValue);
    });

    // Test moved to packages/run-types/src/jitCompilers/json/jsonStringify.spec.ts (lines 294-301)

    // Test moved to packages/run-types/src/jitCompilers/json/jsonStringify.spec.ts (lines 444-451)

    it('mock function return', async () => {
        const mocked = await rt.mockReturn();
        expect(mocked instanceof Date).toBe(true);
        const validate = rt.createJitReturnFunction(JitFunctions.isType);
        const mockedReturn = await rt.mockReturn();
        expect(validate(mockedReturn)).toBe(true);
    });

    // Test moved to packages/run-types/src/jitCompilers/json/jsonStringify.spec.ts (lines 493-507)

    // Test moved to packages/run-types/src/jitCompilers/json/jsonStringify.spec.ts (lines 511-529)
});

describe('function with rest parameters', () => {
    it('validate function with rest parameters', () => {
        const validate = rtRest.createJitParamsFunction(JitFunctions.isType);
        const date1 = new Date();
        const date2 = new Date();
        expect(validate([3, true, date1, date2])).toBe(true);
        // optional parameter
        expect(validate([3, false])).toBe(true);
        // wrong type
        expect(validate([3, 3, 3])).toBe(false);
        // more parameters than expected
        expect(validate([3, true, new Date(), 7])).toBe(false);
    });

    it('validate + errors parameters function with rest parameters', () => {
        const validate = rtRest.createJitParamsFunction(JitFunctions.typeErrors);
        expect(validate([3, true, new Date(), new Date()])).toEqual([]);
        // optional parameter
        expect(validate([3, false])).toEqual([]);
        // wrong type
        expect(validate([3, 3, 3])).toEqual([
            {expected: 'boolean', path: [1]},
            {expected: 'date', path: [2]},
        ]);
        // wrong rest params
        expect(validate([3, true, new Date(), 7, true])).toEqual([
            {expected: 'date', path: [3]},
            {expected: 'date', path: [4]},
        ]);
    });

    it('encode/decode to json function with rest parameters', () => {
        const toJsonVal = rtRest.createJitParamsFunction(JitFunctions.toJsonVal);
        const fromJsonVal = rtRest.createJitParamsFunction(JitFunctions.fromJsonVal);

        const typeValue = [3, true, new Date(), new Date()];
        const typeValue2 = [3, true];
        const roundTrip = fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(typeValue))));
        const roundTrip2 = fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(typeValue2))));
        expect(roundTrip).toEqual(typeValue);
        expect(roundTrip2).toEqual(typeValue2);
    });

    // Test moved to packages/run-types/src/jitCompilers/json/jsonStringify.spec.ts (lines 308-317)

    // Test moved to packages/run-types/src/jitCompilers/json/jsonStringify.spec.ts (lines 459-469)
});

describe('function run type general', () => {
    // Test moved to packages/run-types/src/jitCompilers/json/jsonStringify.spec.ts (lines 533-559)

    it('jitFnHash should be different in functions compiled with different options', () => {
        const fn = (a: number, b: boolean, c?: string): Date => new Date();
        const reflectedType = reflectFunction(fn);

        const compiled1 = reflectedType
            .getParameters()
            .createJitCompiledFunction(JitFunctions.isType.id, undefined, {paramsSlice: {start: 1}});
        const compiled2 = reflectedType
            .getParameters()
            .createJitCompiledFunction(JitFunctions.isType.id, undefined, {paramsSlice: {start: 2}});
        expect(compiled1.jitFnHash).not.toEqual(compiled2.jitFnHash);
    });

    it('createJitParamsFunction should accept a parameter slice option that allows to create a function that only validates a subset of the parameters', () => {
        // Test with FunctionType: (a: number, b: boolean, c?: string) => Date

        // Test with invalid indices
        expect(() => {
            rt.createJitParamsFunction(JitFunctions.isType, {paramsSlice: {start: 1, end: 4}});
        }).toThrow('Invalid paramsSlice'); // end > length

        expect(() => {
            rt.createJitParamsFunction(JitFunctions.isType, {paramsSlice: {start: 2, end: 2}});
        }).toThrow('Invalid paramsSlice'); // end <= start

        expect(() => {
            rt.createJitParamsFunction(JitFunctions.isType, {paramsSlice: {start: -1, end: 2}});
        }).toThrow('Invalid paramsSlice'); // start < 0

        // Test with valid indices - middle slice (b and c)
        const validateMiddleSlice = rt.createJitParamsFunction(JitFunctions.isType, {paramsSlice: {start: 1}});

        // Should only validate parameters b and c (boolean and string)
        expect(validateMiddleSlice([true, 'hello'])).toBe(true);
        expect(validateMiddleSlice([false])).toBe(true);
        expect(validateMiddleSlice([123])).toBe(false); // Wrong type for first parameter (should be boolean)
        expect(validateMiddleSlice([true, 123])).toBe(false); // Wrong type for second parameter (should be string)
        expect(validateMiddleSlice([true, 'hello', 'extra'])).toBe(false); // Too many parameters

        // Test with typeErrors for middle slice
        const errorsMiddleSlice = rt.createJitParamsFunction(JitFunctions.typeErrors, {paramsSlice: {start: 1}});
        expect(errorsMiddleSlice([true, 'hello'])).toEqual([]);
        expect(errorsMiddleSlice([false])).toEqual([]);
        expect(errorsMiddleSlice([123])).toEqual([{expected: 'boolean', path: [0]}]); // Wrong type for first parameter
        expect(errorsMiddleSlice([true, 123])).toEqual([{expected: 'string', path: [1]}]); // Wrong type for second parameter

        // Test with single parameter (a: number) - start: 0, end: 1
        const validateFirstParam = rt.createJitParamsFunction(JitFunctions.isType, {paramsSlice: {start: 0, end: 1}});
        expect(validateFirstParam([42])).toBe(true);
        expect(validateFirstParam(['string'])).toBe(false); // Wrong type
        expect(validateFirstParam([42, true])).toBe(false); // Too many parameters

        // Test with typeErrors for first parameter
        const errorsFirstParam = rt.createJitParamsFunction(JitFunctions.typeErrors, {paramsSlice: {start: 0, end: 1}});
        expect(errorsFirstParam([42])).toEqual([]);
        expect(errorsFirstParam(['string'])).toEqual([{expected: 'number', path: [0]}]);

        // Test with optional parameter only (c?: string) - start: 2
        const validateOptionalParam = rt.createJitParamsFunction(JitFunctions.isType, {paramsSlice: {start: 2}});
        expect(validateOptionalParam(['hello'])).toBe(true);
        expect(validateOptionalParam([])).toBe(true); // Optional parameter can be omitted
        expect(validateOptionalParam([42])).toBe(false); // Wrong type
        expect(validateOptionalParam(['hello', 'extra'])).toBe(false); // Too many parameters

        // Test with typeErrors for optional parameter
        const errorsOptionalParam = rt.createJitParamsFunction(JitFunctions.typeErrors, {paramsSlice: {start: 2}});
        expect(errorsOptionalParam(['hello'])).toEqual([]);
        expect(errorsOptionalParam([])).toEqual([]);
        expect(errorsOptionalParam([42])).toEqual([{expected: 'string', path: [0]}]);
    });

    it('createJitParamsFunction encode/decode to json', () => {
        const toJsonVal = rt.createJitParamsFunction(JitFunctions.toJsonVal, {paramsSlice: {start: 1}});
        const fromJsonVal = rt.createJitParamsFunction(JitFunctions.fromJsonVal, {paramsSlice: {start: 1}});
        const paramsValues = [true, 'hello'];
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(paramsValues))))).toEqual(paramsValues);
    });

    it('createJitParamsFunction json stringify', () => {
        const jsonStringify = rt.createJitParamsFunction(JitFunctions.jsonStringify, {paramsSlice: {start: 1}});
        const fromJsonVal = rt.createJitParamsFunction(JitFunctions.fromJsonVal, {paramsSlice: {start: 1}});
        const paramsValues = [true, 'hello'];
        expect(fromJsonVal(JSON.parse(jsonStringify(paramsValues)))).toEqual(paramsValues);
    });
});
