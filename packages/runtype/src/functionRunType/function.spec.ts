/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {reflectFunction, runType} from '../runType';
import {JitFnIDs} from '../constants';
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
    console.log(c);
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
        expect(rtSum.getLength()).toBe(3);
        expect(sum.length).toBe(3);

        expect(rtSumWithDefault.getFamily()).toBe('F');
        expect(rtSumWithDefault.getFnName()).toBe('sumWithDefault');
        // only counts until the first optional parameter
        expect(rtSumWithDefault.getLength()).toBe(1);
        expect(sumWithDefault.length).toBe(1);

        expect(rtSumRest.getFamily()).toBe('F');
        expect(rtSumRest.getFnName()).toBe('sumRest');
        // rest parameters are not counted
        expect(rtSumRest.getLength()).toBe(2);
        expect(sumRest.length).toBe(2);

        expect(validate(sum)).toBe(true);
        expect(getTypeErrors(sum)).toEqual([]);

        expect(validate(() => null)).toBe(false);
        expect(getTypeErrors(() => null)).toEqual([{expected: 'function', path: []}]);

        // returns true because function name and length are the same, even if it is a different function
        // we cant know param types or return type at runtime
        expect(validate(function sum(s, b, c) {})).toBe(true);
    });

    it('throw errors for json encode/decode', () => {
        expect(() => rt.createJitFunction(JitFnIDs.isType)).not.toThrow();
        expect(() => rt.createJitFunction(JitFnIDs.typeErrors)).not.toThrow();

        expect(() => rt.createJitFunction(JitFnIDs.jsonEncode)).toThrow(
            `Compile function JsonEncode not supported, call  compileParams or  compileReturn instead.`
        );
        expect(() => rt.createJitFunction(JitFnIDs.jsonDecode)).toThrow(
            `Compile function JsonDecode not supported, call  compileParams or  compileReturn instead.`
        );

        expect(() => rt.createJitFunction(JitFnIDs.jsonStringify)).toThrow(
            `Compile function sonStringify not supported, call  compileParams or  compileReturn instead.`
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
        expect(validate([3, true, 'hello', 7])).toEqual([{expected: 'fnParams', path: []}]);
    });

    it('encode/decode to json parameters', () => {
        const toJson = rt.createJitParamsFunction(JitFnIDs.jsonEncode);
        const fromJson = rt.createJitParamsFunction(JitFnIDs.jsonDecode);
        const typeValue = [3, true, 'hello'];
        const typeValue2 = [3, true];

        expect(fromJson(JSON.parse(JSON.stringify(toJson(typeValue))))).toEqual(typeValue);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(typeValue2))))).toEqual(typeValue2);
    });

    it('required encode/decode to json parameters', () => {
        const toJson = rt2.createJitParamsFunction(JitFnIDs.jsonEncode);
        const fromJson = rt2.createJitParamsFunction(JitFnIDs.jsonDecode);
        const d = new Date();
        const typeValue = [d, true];
        const typeValue2 = [d];
        expect(fromJson(JSON.parse(JSON.stringify(toJson(typeValue))))).toEqual(typeValue);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(typeValue2))))).toEqual(typeValue2);
    });

    it('json stringify parameters', () => {
        const jsonStringify = rt.createJitParamsFunction(JitFnIDs.jsonStringify);
        const fromJson = rt.createJitParamsFunction(JitFnIDs.jsonDecode);
        const typeValue = [3, true, 'hello'];
        const typeValue2 = [3, true];
        const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
        const roundTrip2 = fromJson(JSON.parse(jsonStringify(typeValue2)));
        expect(roundTrip).toEqual(typeValue);
        expect(roundTrip2).toEqual(typeValue2);
    });

    it('json stringify required parameters', () => {
        const jsonStringify = rt2.createJitParamsFunction(JitFnIDs.jsonStringify);
        const fromJson = rt2.createJitParamsFunction(JitFnIDs.jsonDecode);
        const d = new Date();
        const typeValue = [d, true];
        const typeValue2 = [d];
        const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
        const roundTrip2 = fromJson(JSON.parse(jsonStringify(typeValue2)));
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
        const toJson = rt.createJitReturnFunction(JitFnIDs.jsonEncode);
        const fromJson = rt.createJitReturnFunction(JitFnIDs.jsonDecode);
        const returnValue = new Date();
        expect(fromJson(JSON.parse(JSON.stringify(toJson(returnValue))))).toEqual(returnValue);
    });

    it('required encode/decode function return to json', () => {
        const toJson = rt2.createJitReturnFunction(JitFnIDs.jsonEncode);
        const fromJson = rt2.createJitReturnFunction(JitFnIDs.jsonDecode);
        const returnValue = 1n;

        expect(fromJson(JSON.parse(JSON.stringify(toJson(returnValue))))).toEqual(returnValue);
    });

    it('json stringify function return', () => {
        const jsonStringify = rt.createJitReturnFunction(JitFnIDs.jsonStringify);
        const fromJson = rt.createJitReturnFunction(JitFnIDs.jsonDecode);
        const returnValue = new Date();
        const roundTrip = fromJson(JSON.parse(jsonStringify(returnValue)));
        expect(roundTrip).toEqual(returnValue);
    });

    it('json stringify required function return', () => {
        const jsonStringify = rt2.createJitReturnFunction(JitFnIDs.jsonStringify);
        const fromJson = rt2.createJitReturnFunction(JitFnIDs.jsonDecode);
        const returnValue = 1n;
        const roundTrip = fromJson(JSON.parse(jsonStringify(returnValue)));
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
        const toJsonReturn = reflectedType.createJitReturnFunction(JitFnIDs.jsonEncode);
        const fromJsonReturn = reflectedType.createJitReturnFunction(JitFnIDs.jsonDecode);
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
        const toJsonReturn = reflectedType.createJitReturnFunction(JitFnIDs.jsonEncode);
        const fromJsonReturn = reflectedType.createJitReturnFunction(JitFnIDs.jsonDecode);
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
        const toJson = rtRest.createJitParamsFunction(JitFnIDs.jsonEncode);
        const fromJson = rtRest.createJitParamsFunction(JitFnIDs.jsonDecode);

        const typeValue = [3, true, new Date(), new Date()];
        const typeValue2 = [3, true];
        const roundTrip = fromJson(JSON.parse(JSON.stringify(toJson(typeValue))));
        const roundTrip2 = fromJson(JSON.parse(JSON.stringify(toJson(typeValue2))));
        expect(roundTrip).toEqual(typeValue);
        expect(roundTrip2).toEqual(typeValue2);
    });

    it('stringify function with rest parameters', () => {
        const jsonStringify = rtRest.createJitParamsFunction(JitFnIDs.jsonStringify);
        const fromJson = rtRest.createJitParamsFunction(JitFnIDs.jsonDecode);
        const typeValue = [3, true, new Date(), new Date()];
        const typeValue2 = [3, true];
        const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
        const roundTrip2 = fromJson(JSON.parse(jsonStringify(typeValue2)));
        expect(roundTrip).toEqual(typeValue);
        expect(roundTrip2).toEqual(typeValue2);
    });

    it('stringify function with only rest parameters', () => {
        const jsonStringify = rtRest2.createJitParamsFunction(JitFnIDs.jsonStringify);
        const fromJson = rtRest2.createJitParamsFunction(JitFnIDs.jsonDecode);
        const typeValue = [3, 2, 1];
        const typeValue2: number[] = [];
        const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
        const roundTrip3 = fromJson(JSON.parse(jsonStringify(typeValue2)));
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
    const toJson = reflectedType.createJitParamsFunction(JitFnIDs.jsonEncode);
    const fromJson = reflectedType.createJitParamsFunction(JitFnIDs.jsonDecode);
    const jsonStringify = reflectedType.createJitParamsFunction(JitFnIDs.jsonStringify);
    const paramsValues = [3, true, 'hello'];
    expect(validate(paramsValues)).toBe(true);
    expect(typeErrors(paramsValues)).toEqual([]);
    expect(fromJson(JSON.parse(JSON.stringify(toJson([3, true, 'hello']))))).toEqual(paramsValues);
    expect(fromJson(JSON.parse(jsonStringify([3, true, 'hello'])))).toEqual(paramsValues);

    const validateReturn = reflectedType.createJitReturnFunction(JitFnIDs.isType);
    const typeErrorsReturn = reflectedType.createJitReturnFunction(JitFnIDs.typeErrors);
    const toJsonReturn = reflectedType.createJitReturnFunction(JitFnIDs.jsonEncode);
    const fromJsonReturn = reflectedType.createJitReturnFunction(JitFnIDs.jsonDecode);
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
