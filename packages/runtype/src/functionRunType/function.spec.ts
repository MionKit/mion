/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {reflectFunction, runType} from '../runType';
import {
    buildJsonEncodeJITFn,
    buildJsonDecodeJITFn,
    buildIsTypeJITFn,
    buildTypeErrorsJITFn,
    buildJsonStringifyJITFn,
} from '../jitCompiler';
import {FunctionRunType} from './function';

type FunctionType = (a: number, b: boolean, c?: string) => Date;
type FunctionType2 = (a: Date, b?: boolean) => bigint; // requires encode/decode
type RestFunctionType = (a: number, b: boolean, ...c: Date[]) => Date;
type Rest2FunctionType = (...a: number[]) => Date;

const rt = runType<FunctionType>() as FunctionRunType;
const rt2 = runType<FunctionType2>() as FunctionRunType;
const rtRest = runType<RestFunctionType>() as FunctionRunType;
const rtRest2 = runType<Rest2FunctionType>() as FunctionRunType;

it('return empty strings when calling regular jit functions', () => {
    expect(() => buildIsTypeJITFn(rt)).toThrow(
        `function validation is not supported, instead validate parameters or return type separately.`
    );
    expect(() => buildTypeErrorsJITFn(rt)).toThrow(
        `function validation is not supported, instead validate parameters or return type separately.`
    );

    expect(() => buildJsonEncodeJITFn(rt)).toThrow(
        `function json encode is not supported, instead encode parameters or return type separately.`
    );
    expect(() => buildJsonDecodeJITFn(rt)).toThrow(
        `function json decode is not supported, instead decode parameters or return type separately.`
    );

    expect(() => buildJsonStringifyJITFn(rt)).toThrow(
        `function json stringify is not supported, instead stringify parameters or return type separately.`
    );
    expect(() => rt.mock()).toThrow(`function mock is not supported, instead mock parameters or return type separately`);
});

it('validate function parameters', () => {
    const validate = rt.jitParamsFns.isType.fn;
    expect(validate([3, true, 'hello'])).toBe(true);
    // optional parameter
    expect(validate([3, false])).toBe(true);
    // wrong type
    expect(validate([3, 3, 3])).toBe(false);
    // more parameters than expected
    expect(validate([3, true, 'hello', 7])).toBe(false);
});

it('validate function + errors parameters', () => {
    const validate = rt.jitParamsFns.typeErrors.fn;
    expect(validate([3, true, 'hello'])).toEqual([]);
    // optional parameter
    expect(validate([3, false])).toEqual([]);
    // wrong type
    expect(validate([3, 3, 3])).toEqual([
        {expected: 'boolean', path: [1]},
        {expected: 'string', path: [2]},
    ]);
    // more parameters than expected
    expect(validate([3, true, 'hello', 7])).toEqual([{expected: '[a:number, b:boolean, c?:string]', path: []}]);
});

it('encode/decode to json parameters', () => {
    const toJson = rt.jitParamsFns.jsonEncode.fn;
    const fromJson = rt.jitParamsFns.jsonDecode.fn;
    const typeValue = [3, true, 'hello'];
    const typeValue2 = [3, true];
    expect(rt.isParamsJsonEncodedRequired).toBe(false);
    expect(rt.isParamsJsonDecodedRequired).toBe(false);
    expect(fromJson(toJson(typeValue))).toEqual(typeValue);
    expect(fromJson(toJson(typeValue2))).toEqual(typeValue2);
});

it('required encode/decode to json parameters', () => {
    const toJson = rt2.jitParamsFns.jsonEncode.fn;
    const fromJson = rt2.jitParamsFns.jsonDecode.fn;
    const d = new Date();
    const typeValue = [d, true];
    const typeValue2 = [d];
    expect(rt2.isParamsJsonEncodedRequired).toBe(false);
    expect(rt2.isParamsJsonDecodedRequired).toBe(true);
    expect(fromJson(toJson(typeValue))).toEqual(typeValue);
    expect(fromJson(toJson(typeValue2))).toEqual(typeValue2);
});

it('json stringify parameters', () => {
    const jsonStringify = rt.jitParamsFns.jsonStringify.fn;
    const fromJson = rt.jitParamsFns.jsonDecode.fn;
    const typeValue = [3, true, 'hello'];
    const typeValue2 = [3, true];
    const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
    const roundTrip2 = fromJson(JSON.parse(jsonStringify(typeValue2)));
    expect(roundTrip).toEqual(typeValue);
    expect(roundTrip2).toEqual(typeValue2);
});

it('json stringify required parameters', () => {
    const jsonStringify = rt2.jitParamsFns.jsonStringify.fn;
    const fromJson = rt2.jitParamsFns.jsonDecode.fn;
    const d = new Date();
    const typeValue = [d, true];
    const typeValue2 = [d];
    const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
    const roundTrip2 = fromJson(JSON.parse(jsonStringify(typeValue2)));
    expect(roundTrip).toEqual(typeValue);
    expect(roundTrip2).toEqual(typeValue2);
});

it('mock parameters', () => {
    const mocked = rt.paramsMock();
    expect(Array.isArray(mocked)).toBe(true);
    expect(mocked.length >= 2 && mocked.length <= 3).toBe(true);
    const validate = rt.jitParamsFns.isType.fn;
    expect(validate(rt.paramsMock())).toBe(true);
});

it('validate function return', () => {
    const validate = rt.jitReturnFns.isType.fn;
    expect(validate(new Date())).toBe(true);
    expect(validate(123)).toBe(false);
});

it('validate function return + errors', () => {
    const validate = rt.jitReturnFns.typeErrors.fn;
    expect(validate(new Date())).toEqual([]);
    expect(validate(123)).toEqual([{expected: 'date', path: []}]);
});

it('encode/decode function return to json', () => {
    const toJson = rt.jitReturnFns.jsonEncode.fn;
    const fromJson = rt.jitReturnFns.jsonDecode.fn;
    const returnValue = new Date();
    expect(rt.isReturnJsonEncodedRequired).toBe(false);
    expect(rt.isReturnJsonDecodedRequired).toBe(true);
    expect(fromJson(toJson(returnValue))).toEqual(returnValue);
});

it('required encode/decode function return to json', () => {
    const toJson = rt2.jitReturnFns.jsonEncode.fn;
    const fromJson = rt2.jitReturnFns.jsonDecode.fn;
    const returnValue = 1n;
    expect(rt.isReturnJsonEncodedRequired).toBe(false);
    expect(rt.isReturnJsonDecodedRequired).toBe(true);
    expect(fromJson(toJson(returnValue))).toEqual(returnValue);
});

it('json stringify function return', () => {
    const jsonStringify = rt.jitReturnFns.jsonStringify.fn;
    const fromJson = rt.jitReturnFns.jsonDecode.fn;
    const returnValue = new Date();
    const roundTrip = fromJson(JSON.parse(jsonStringify(returnValue)));
    expect(roundTrip).toEqual(returnValue);
});

it('json stringify required function return', () => {
    const jsonStringify = rt2.jitReturnFns.jsonStringify.fn;
    const fromJson = rt2.jitReturnFns.jsonDecode.fn;
    const returnValue = 1n;
    const roundTrip = fromJson(JSON.parse(jsonStringify(returnValue)));
    expect(roundTrip).toEqual(returnValue);
});

it('mock function return', () => {
    const mocked = rt.returnMock();
    expect(mocked instanceof Date).toBe(true);
    const validate = rt.jitReturnFns.isType.fn;
    expect(validate(rt.returnMock())).toBe(true);
});

it('should get runType from a function using reflectFunction', () => {
    const fn = (a: number, b: boolean, c?: string): Date => new Date();
    const reflectedType = reflectFunction(fn);
    expect(reflectedType instanceof FunctionRunType).toBe(true);

    const validate = reflectedType.jitParamsFns.isType.fn;
    const typeErrors = reflectedType.jitParamsFns.typeErrors.fn;
    const toJson = reflectedType.jitParamsFns.jsonEncode.fn;
    const fromJson = reflectedType.jitParamsFns.jsonDecode.fn;
    const jsonStringify = reflectedType.jitParamsFns.jsonStringify.fn;
    const paramsValues = [3, true, 'hello'];
    expect(validate(paramsValues)).toBe(true);
    expect(typeErrors(paramsValues)).toEqual([]);
    expect(fromJson(toJson(paramsValues))).toBe(paramsValues);
    expect(fromJson(JSON.parse(jsonStringify(paramsValues)))).toEqual(paramsValues);

    const validateReturn = reflectedType.jitReturnFns.isType.fn;
    const typeErrorsReturn = reflectedType.jitReturnFns.typeErrors.fn;
    const toJsonReturn = reflectedType.jitReturnFns.jsonEncode.fn;
    const fromJsonReturn = reflectedType.jitReturnFns.jsonDecode.fn;
    const jsonStringifyReturn = reflectedType.jitReturnFns.jsonStringify.fn;
    const returnValue = new Date();
    expect(validateReturn(returnValue)).toBe(true);
    expect(typeErrorsReturn(returnValue)).toEqual([]);
    expect(fromJsonReturn(toJsonReturn(returnValue))).toEqual(returnValue);
    expect(fromJsonReturn(JSON.parse(jsonStringifyReturn(returnValue)))).toEqual(returnValue);
});

it(`if function's return type is a promise then return type should be the promise's resolvedType`, () => {
    const fn = (a: number, b: boolean, c?: string): Promise<Date> => Promise.resolve(new Date());
    const reflectedType = reflectFunction(fn);
    expect(reflectedType instanceof FunctionRunType).toBe(true);
    expect(reflectedType.returnType.jitId).toBe('date');

    const validateReturn = reflectedType.jitReturnFns.isType.fn;
    const typeErrorsReturn = reflectedType.jitReturnFns.typeErrors.fn;
    const toJsonReturn = reflectedType.jitReturnFns.jsonEncode.fn;
    const fromJsonReturn = reflectedType.jitReturnFns.jsonDecode.fn;
    const jsonStringifyReturn = reflectedType.jitReturnFns.jsonStringify.fn;
    const returnValue = new Date();
    expect(validateReturn(returnValue)).toBe(true);
    expect(typeErrorsReturn(returnValue)).toEqual([]);
    expect(fromJsonReturn(toJsonReturn(returnValue))).toEqual(returnValue);
    expect(fromJsonReturn(JSON.parse(jsonStringifyReturn(returnValue)))).toEqual(returnValue);
});

// test a function with rest parameters

it('validate function with rest parameters', () => {
    const validate = rtRest.jitParamsFns.isType.fn;
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
    const validate = rtRest.jitParamsFns.typeErrors.fn;
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
    const toJson = rtRest.jitParamsFns.jsonEncode.fn;
    const fromJson = rtRest.jitParamsFns.jsonDecode.fn;
    expect(rtRest.isParamsJsonEncodedRequired).toBe(false);
    expect(rtRest.isParamsJsonDecodedRequired).toBe(true);

    const typeValue = [3, true, new Date(), new Date()];
    const typeValue2 = [3, true];
    const roundTrip = fromJson(JSON.parse(JSON.stringify(toJson(typeValue))));
    const roundTrip2 = fromJson(JSON.parse(JSON.stringify(toJson(typeValue2))));
    expect(roundTrip).toEqual(typeValue);
    expect(roundTrip2).toEqual(typeValue2);
});

it('stringify function with rest parameters', () => {
    const jsonStringify = rtRest.jitParamsFns.jsonStringify.fn;
    const fromJson = rtRest.jitParamsFns.jsonDecode.fn;
    const typeValue = [3, true, new Date(), new Date()];
    const typeValue2 = [3, true];
    const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
    const roundTrip2 = fromJson(JSON.parse(jsonStringify(typeValue2)));
    expect(roundTrip).toEqual(typeValue);
    expect(roundTrip2).toEqual(typeValue2);
});

it('stringify function with only rest parameters', () => {
    const jsonStringify = rtRest2.jitParamsFns.jsonStringify.fn;
    const fromJson = rtRest2.jitParamsFns.jsonDecode.fn;
    const typeValue = [3, 2, 1];
    const typeValue2: number[] = [];
    const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
    const roundTrip3 = fromJson(JSON.parse(jsonStringify(typeValue2)));
    expect(roundTrip).toEqual(typeValue);
    expect(roundTrip3).toEqual(typeValue2);
});
