/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {reflectFunction, runType} from '../../runType';
import {JitFnIDs} from '../../constants';
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
        const validate = rtSum.createJitFunction(JitFnIDs.isType);
        const getTypeErrors = rtSum.createJitFunction(JitFnIDs.typeErrors);

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

    it('throw errors for json encode/decode, jsonStringify and mock', () => {
        expect(() => rt.createJitFunction(JitFnIDs.isType)).not.toThrow();
        expect(() => rt.createJitFunction(JitFnIDs.typeErrors)).not.toThrow();

        expect(() => rt.createJitFunction(JitFnIDs.toJsonVal)).toThrow(
            `Compile function ToJsonVal not supported, call compileParams or compileReturn instead.`
        );
        expect(() => rt.createJitFunction(JitFnIDs.fromJsonVal)).toThrow(
            `Compile function FromJsonVal not supported, call compileParams or compileReturn instead.`
        );

        expect(() => rt.createJitFunction(JitFnIDs.jsonStringify)).toThrow(
            `Compile function JsonStringify not supported, call compileParams or compileReturn instead.`
        );
        expect(() => rt.mock()).toThrow('Function Mock is not allowed, call mockParams or mockReturn instead.');
    });
});

describe('function parameters', () => {
    it('validate function parameters', () => {
        const validate = rt.createJitParamsFunction(JitFnIDs.isType);

        expect(validate([3, true, 'hello'])).toBe(true);
        // optional parameter
        expect(validate([3, false])).toBe(true);
        // wrong type
        expect(validate([3, 3, 3])).toBe(false);
        // more parameters than expected
        expect(validate([3, true, 'hello', 7])).toBe(false);
    });

    it('validate function + errors parameters', () => {
        const validate = rt.createJitParamsFunction(JitFnIDs.typeErrors);
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
        const toJsonVal = rt.createJitParamsFunction(JitFnIDs.toJsonVal);
        const fromJsonVal = rt.createJitParamsFunction(JitFnIDs.fromJsonVal);
        const typeValue = [3, true, 'hello'];
        const typeValue2 = [3, true];

        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(typeValue))))).toEqual(typeValue);
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(typeValue2))))).toEqual(typeValue2);
    });

    it('required encode/decode to json parameters', () => {
        const toJsonVal = rt2.createJitParamsFunction(JitFnIDs.toJsonVal);
        const fromJsonVal = rt2.createJitParamsFunction(JitFnIDs.fromJsonVal);
        const d = new Date();
        const typeValue = [d, true];
        const typeValue2 = [d];
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(typeValue))))).toEqual(typeValue);
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(typeValue2))))).toEqual(typeValue2);
    });

    it('json stringify parameters', () => {
        const jsonStringify = rt.createJitParamsFunction(JitFnIDs.jsonStringify);
        const fromJsonVal = rt.createJitParamsFunction(JitFnIDs.fromJsonVal);
        const typeValue = [3, true, 'hello'];
        const typeValue2 = [3, true];
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        const roundTrip2 = fromJsonVal(JSON.parse(jsonStringify(typeValue2)));
        expect(roundTrip).toEqual(typeValue);
        expect(roundTrip2).toEqual(typeValue2);
    });

    it('json stringify required parameters', () => {
        const jsonStringify = rt2.createJitParamsFunction(JitFnIDs.jsonStringify);
        const fromJsonVal = rt2.createJitParamsFunction(JitFnIDs.fromJsonVal);
        const d = new Date();
        const typeValue = [d, true];
        const typeValue2 = [d];
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        const roundTrip2 = fromJsonVal(JSON.parse(jsonStringify(typeValue2)));
        expect(roundTrip).toEqual(typeValue);
        expect(roundTrip2).toEqual(typeValue2);
    });

    it('mock parameters', () => {
        const mocked = rt.mockParams();
        expect(Array.isArray(mocked)).toBe(true);
        expect(mocked.length >= 2 && mocked.length <= 3).toBe(true);
        const validate = rt.createJitParamsFunction(JitFnIDs.isType);
        expect(validate(rt.mockParams())).toBe(true);
    });
});

describe('non serializable parameters', () => {
    type FunctionType = (a: number, b: boolean, c: () => any) => Date; // c is not serializable
    const rtWithFN = runType<FunctionType>() as FunctionRunType;

    it('validate non serializable types must be undefined', () => {
        const validate = rtWithFN.createJitParamsFunction(JitFnIDs.isType);
        expect(validate([3, true, () => null])).toBe(false); // non serializable types must be null
        expect(validate([3, true, undefined])).toBe(true); // non serializable types must be null
    });

    it('get errors from non serializable types', () => {
        const validate = rtWithFN.createJitParamsFunction(JitFnIDs.typeErrors);
        expect(validate([3, true, () => null])).toEqual([{expected: 'undefined', path: [2]}]);
        expect(validate([3, true, undefined])).toEqual([]);
    });

    it('encode/decode to json non serializable types', () => {
        const toJsonVal = rtWithFN.createJitParamsFunction(JitFnIDs.toJsonVal);
        const fromJsonVal = rtWithFN.createJitParamsFunction(JitFnIDs.fromJsonVal);
        const typeValue = [3, true, () => null];
        const typeValue2 = [3, true, undefined];
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(typeValue))))).toEqual([3, true, undefined]);
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(typeValue2))))).toEqual([3, true, undefined]);
    });

    it('json stringify non serializable types', () => {
        const jsonStringify = rtWithFN.createJitParamsFunction(JitFnIDs.jsonStringify);
        const fromJsonVal = rtWithFN.createJitParamsFunction(JitFnIDs.fromJsonVal);
        const typeValue = [3, true, () => null];
        const typeValue2 = [3, true, undefined];
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        const roundTrip2 = fromJsonVal(JSON.parse(jsonStringify(typeValue2)));
        expect(roundTrip).toEqual([3, true, undefined]);
        expect(roundTrip2).toEqual([3, true, undefined]);
    });

    it('mock non serializable types', () => {
        const mocked = rtWithFN.mockParams();
        expect(Array.isArray(mocked)).toBe(true);
        expect(mocked.length >= 2 && mocked.length <= 3).toBe(true);
        const validate = rtWithFN.createJitParamsFunction(JitFnIDs.isType);
        expect(validate(rtWithFN.mockParams())).toBe(true);
    });
});

describe('function return', () => {
    it('validate function return', () => {
        const validate = rt.createJitReturnFunction(JitFnIDs.isType);
        expect(validate(new Date())).toBe(true);
        expect(validate(123)).toBe(false);
    });

    it('validate function return + errors', () => {
        const validate = rt.createJitReturnFunction(JitFnIDs.typeErrors);
        expect(validate(new Date())).toEqual([]);
        expect(validate(123)).toEqual([{expected: 'date', path: []}]);
    });

    it('encode/decode function return to json', () => {
        const toJsonVal = rt.createJitReturnFunction(JitFnIDs.toJsonVal);
        const fromJsonVal = rt.createJitReturnFunction(JitFnIDs.fromJsonVal);
        const returnValue = new Date();
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(returnValue))))).toEqual(returnValue);
    });

    it('required encode/decode function return to json', () => {
        const toJsonVal = rt2.createJitReturnFunction(JitFnIDs.toJsonVal);
        const fromJsonVal = rt2.createJitReturnFunction(JitFnIDs.fromJsonVal);
        const returnValue = 1n;

        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(returnValue))))).toEqual(returnValue);
    });

    it('json stringify function return', () => {
        const jsonStringify = rt.createJitReturnFunction(JitFnIDs.jsonStringify);
        const fromJsonVal = rt.createJitReturnFunction(JitFnIDs.fromJsonVal);
        const returnValue = new Date();
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(returnValue)));
        expect(roundTrip).toEqual(returnValue);
    });

    it('json stringify required function return', () => {
        const jsonStringify = rt2.createJitReturnFunction(JitFnIDs.jsonStringify);
        const fromJsonVal = rt2.createJitReturnFunction(JitFnIDs.fromJsonVal);
        const returnValue = 1n;
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(returnValue)));
        expect(roundTrip).toEqual(returnValue);
    });

    it('mock function return', () => {
        const mocked = rt.mockReturn();
        expect(mocked instanceof Date).toBe(true);
        const validate = rt.createJitReturnFunction(JitFnIDs.isType);
        expect(validate(rt.mockReturn())).toBe(true);
    });

    it(`if function's return type is a promise then return type should be the promise's resolvedType`, () => {
        const fn = (a: number, b: boolean, c?: string): Promise<Date> => Promise.resolve(new Date());
        const reflectedType = reflectFunction(fn);
        expect(reflectedType instanceof FunctionRunType).toBe(true);

        const validateReturn = reflectedType.createJitReturnFunction(JitFnIDs.isType);
        const typeErrorsReturn = reflectedType.createJitReturnFunction(JitFnIDs.typeErrors);
        const toJsonReturn = reflectedType.createJitReturnFunction(JitFnIDs.toJsonVal);
        const fromJsonReturn = reflectedType.createJitReturnFunction(JitFnIDs.fromJsonVal);
        const jsonStringifyReturn = reflectedType.createJitReturnFunction(JitFnIDs.jsonStringify);
        const returnValue = new Date();
        expect(validateReturn(returnValue)).toBe(true);
        expect(typeErrorsReturn(returnValue)).toEqual([]);
        expect(fromJsonReturn(toJsonReturn(returnValue))).toEqual(returnValue);
        expect(fromJsonReturn(JSON.parse(jsonStringifyReturn(returnValue)))).toEqual(returnValue);
    });

    it(`if function's return type is a function then return type should be the function's return type`, () => {
        const fn =
            (a: number, b: boolean, c?: string): (() => Date) =>
            () =>
                new Date();
        const reflectedType = reflectFunction(fn);

        const validateReturn = reflectedType.createJitReturnFunction(JitFnIDs.isType);
        const typeErrorsReturn = reflectedType.createJitReturnFunction(JitFnIDs.typeErrors);
        const toJsonReturn = reflectedType.createJitReturnFunction(JitFnIDs.toJsonVal);
        const fromJsonReturn = reflectedType.createJitReturnFunction(JitFnIDs.fromJsonVal);
        const jsonStringifyReturn = reflectedType.createJitReturnFunction(JitFnIDs.jsonStringify);
        const returnValue = new Date();
        expect(validateReturn(returnValue)).toBe(true);
        expect(typeErrorsReturn(returnValue)).toEqual([]);
        expect(fromJsonReturn(toJsonReturn(returnValue))).toEqual(returnValue);
        expect(fromJsonReturn(JSON.parse(jsonStringifyReturn(returnValue)))).toEqual(returnValue);
    });
});

describe('function with rest parameters', () => {
    it('validate function with rest parameters', () => {
        const validate = rtRest.createJitParamsFunction(JitFnIDs.isType);
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
        const validate = rtRest.createJitParamsFunction(JitFnIDs.typeErrors);
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
        const toJsonVal = rtRest.createJitParamsFunction(JitFnIDs.toJsonVal);
        const fromJsonVal = rtRest.createJitParamsFunction(JitFnIDs.fromJsonVal);

        const typeValue = [3, true, new Date(), new Date()];
        const typeValue2 = [3, true];
        const roundTrip = fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(typeValue))));
        const roundTrip2 = fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(typeValue2))));
        expect(roundTrip).toEqual(typeValue);
        expect(roundTrip2).toEqual(typeValue2);
    });

    it('stringify function with rest parameters', () => {
        const jsonStringify = rtRest.createJitParamsFunction(JitFnIDs.jsonStringify);
        const fromJsonVal = rtRest.createJitParamsFunction(JitFnIDs.fromJsonVal);
        const typeValue = [3, true, new Date(), new Date()];
        const typeValue2 = [3, true];
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        const roundTrip2 = fromJsonVal(JSON.parse(jsonStringify(typeValue2)));
        expect(roundTrip).toEqual(typeValue);
        expect(roundTrip2).toEqual(typeValue2);
    });

    it('stringify function with only rest parameters', () => {
        const jsonStringify = rtRest2.createJitParamsFunction(JitFnIDs.jsonStringify);
        const fromJsonVal = rtRest2.createJitParamsFunction(JitFnIDs.fromJsonVal);
        const typeValue = [3, 2, 1];
        const typeValue2: number[] = [];
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        const roundTrip3 = fromJsonVal(JSON.parse(jsonStringify(typeValue2)));
        expect(roundTrip).toEqual(typeValue);
        expect(roundTrip3).toEqual(typeValue2);
    });
});

it('should get runType from a function using reflectFunction', () => {
    const fn = (a: number, b: boolean, c?: string): Date => new Date();
    const reflectedType = reflectFunction(fn);
    expect(reflectedType instanceof FunctionRunType).toBe(true);

    const validate = reflectedType.createJitParamsFunction(JitFnIDs.isType);
    const typeErrors = reflectedType.createJitParamsFunction(JitFnIDs.typeErrors);
    const toJsonVal = reflectedType.createJitParamsFunction(JitFnIDs.toJsonVal);
    const fromJsonVal = reflectedType.createJitParamsFunction(JitFnIDs.fromJsonVal);
    const jsonStringify = reflectedType.createJitParamsFunction(JitFnIDs.jsonStringify);
    const paramsValues = [3, true, 'hello'];
    expect(validate(paramsValues)).toBe(true);
    expect(typeErrors(paramsValues)).toEqual([]);
    expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal([3, true, 'hello']))))).toEqual(paramsValues);
    expect(fromJsonVal(JSON.parse(jsonStringify([3, true, 'hello'])))).toEqual(paramsValues);

    const validateReturn = reflectedType.createJitReturnFunction(JitFnIDs.isType);
    const typeErrorsReturn = reflectedType.createJitReturnFunction(JitFnIDs.typeErrors);
    const toJsonReturn = reflectedType.createJitReturnFunction(JitFnIDs.toJsonVal);
    const fromJsonReturn = reflectedType.createJitReturnFunction(JitFnIDs.fromJsonVal);
    const jsonStringifyReturn = reflectedType.createJitReturnFunction(JitFnIDs.jsonStringify);
    const returnValue = new Date();
    expect(validateReturn(returnValue)).toBe(true);
    expect(typeErrorsReturn(returnValue)).toEqual([]);
    expect(fromJsonReturn(toJsonReturn(returnValue))).toEqual(returnValue);
    expect(fromJsonReturn(JSON.parse(jsonStringifyReturn(returnValue)))).toEqual(returnValue);
});

it.todo(
    'createJitParamsFunction should accept a parameter slice option that allows to create a function that only validates a subset of the parameters'
);
it.todo('createJitParamsFunction should accept a parameter index options that only validates one of the parameters');
