/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {describe, it, expect} from 'vitest';
import {reflectFunction, runType} from '../../createRunType.ts';
import {JitFunctions} from '../../constants.functions.ts';
import {FunctionRunType} from './function.ts';
import {isDateRunType, isInterfaceRunType, isNumberRunType, isPromiseRunType} from '../../lib/guards.ts';

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

    it('throw errors when mock', async () => {
        expect(() => rt.createJitFunction(JitFunctions.isType)).not.toThrow();
        expect(() => rt.createJitFunction(JitFunctions.typeErrors)).not.toThrow();
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

    it('mock function return', async () => {
        const mocked = await rt.mockReturn();
        expect(mocked instanceof Date).toBe(true);
        const validate = rt.createJitReturnFunction(JitFunctions.isType);
        const mockedReturn = await rt.mockReturn();
        expect(validate(mockedReturn)).toBe(true);
    });
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
});

describe('function run type general', () => {
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

    it('isNoop should be true for functions with no params', () => {
        type NoParamsFunction = () => void;
        const rtNoParams = runType<NoParamsFunction>() as FunctionRunType;

        // All these jit functions should have isNoop = true for functions with no params
        const isTypeCompiled = rtNoParams.createJitCompiledParamsFunction(JitFunctions.isType);
        const typeErrorsCompiled = rtNoParams.createJitCompiledParamsFunction(JitFunctions.typeErrors);
        const prepareForJsonCompiled = rtNoParams.createJitCompiledParamsFunction(JitFunctions.prepareForJson);
        const restoreFromJsonCompiled = rtNoParams.createJitCompiledParamsFunction(JitFunctions.restoreFromJson);

        expect(isTypeCompiled.isNoop).toBe(true);
        expect(typeErrorsCompiled.isNoop).toBe(true);
        expect(prepareForJsonCompiled.isNoop).toBe(true);
        expect(restoreFromJsonCompiled.isNoop).toBe(true);

        // The functions should still work correctly
        expect(isTypeCompiled.fn([])).toBe(true);
        expect(typeErrorsCompiled.fn([])).toEqual([]);
        expect(prepareForJsonCompiled.fn([])).toEqual([]);
        expect(restoreFromJsonCompiled.fn([])).toEqual([]);
    });

    it('getResolvedReturnType should return the inner type for Promise<T> returns and the plain type for sync returns', () => {
        // sync return: Date
        type SyncDate = (a: number) => Date;
        const rtSyncDate = runType<SyncDate>() as FunctionRunType;
        expect(isDateRunType(rtSyncDate.getResolvedReturnType())).toBe(true);
        // for sync returns, getReturnType and getResolvedReturnType produce the same type/hash
        expect(rtSyncDate.getResolvedReturnType().getJitHash({})).toBe(rtSyncDate.getReturnType().getJitHash({}));

        // sync return: number
        type SyncNumber = () => number;
        const rtSyncNumber = runType<SyncNumber>() as FunctionRunType;
        expect(isNumberRunType(rtSyncNumber.getResolvedReturnType())).toBe(true);
        expect(rtSyncNumber.getResolvedReturnType().getJitHash({})).toBe(rtSyncNumber.getReturnType().getJitHash({}));

        // async return: Promise<number> — should unwrap to number
        type AsyncNumber = (ms: number) => Promise<number>;
        const rtAsyncNumber = runType<AsyncNumber>() as FunctionRunType;
        expect(isPromiseRunType(rtAsyncNumber.getReturnType())).toBe(true);
        expect(isNumberRunType(rtAsyncNumber.getResolvedReturnType())).toBe(true);
        // for async returns, the resolved type's hash MUST differ from the wrapped Promise's hash —
        // this is the invariant that fixes the async-routes bug
        expect(rtAsyncNumber.getResolvedReturnType().getJitHash({})).not.toBe(rtAsyncNumber.getReturnType().getJitHash({}));

        // async return: Promise<{name: string}> — should unwrap to the interface
        type AsyncUser = () => Promise<{name: string}>;
        const rtAsyncUser = runType<AsyncUser>() as FunctionRunType;
        expect(isPromiseRunType(rtAsyncUser.getReturnType())).toBe(true);
        expect(isInterfaceRunType(rtAsyncUser.getResolvedReturnType())).toBe(true);

        // bug-fix invariant: the hash of getResolvedReturnType() matches the hash of the JIT functions
        // that createJitCompiledReturnFunction actually registers in the global cache.
        const compiledReturn = rtAsyncNumber.createJitCompiledReturnFunction(JitFunctions.isType);
        expect(compiledReturn.jitFnHash).toBe(
            `${JitFunctions.isType.id}_${rtAsyncNumber.getResolvedReturnType().getJitHash({})}`
        );
    });

    it('isNoop should be false for functions with params that require validation/serialization', () => {
        // rt is FunctionType = (a: number, b: boolean, c?: string) => Date
        const isTypeCompiled = rt.createJitCompiledParamsFunction(JitFunctions.isType);
        const typeErrorsCompiled = rt.createJitCompiledParamsFunction(JitFunctions.typeErrors);

        // isType and typeErrors should not be noop for functions with params (they need to validate)
        expect(isTypeCompiled.isNoop).toBe(false);
        expect(typeErrorsCompiled.isNoop).toBe(false);

        // rt2 is FunctionType2 = (a: Date, b?: boolean) => bigint - Date requires serialization
        const isTypeCompiled2 = rt2.createJitCompiledParamsFunction(JitFunctions.isType);
        const typeErrorsCompiled2 = rt2.createJitCompiledParamsFunction(JitFunctions.typeErrors);
        const prepareForJsonCompiled2 = rt2.createJitCompiledParamsFunction(JitFunctions.prepareForJson);
        const restoreFromJsonCompiled2 = rt2.createJitCompiledParamsFunction(JitFunctions.restoreFromJson);

        expect(isTypeCompiled2.isNoop).toBe(false);
        expect(typeErrorsCompiled2.isNoop).toBe(false);
        expect(prepareForJsonCompiled2.isNoop).toBe(false); // Date requires serialization
        expect(restoreFromJsonCompiled2.isNoop).toBe(false); // Date requires deserialization
    });
});
