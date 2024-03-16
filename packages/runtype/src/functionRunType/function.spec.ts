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

const rt = runType<FunctionType>() as FunctionRunType;
const rt2 = runType<FunctionType2>() as FunctionRunType;

it('return empty strings when calling regular jit functions', () => {
    expect(() => buildIsTypeJITFn(rt)).toThrow(
        `function<[a:number, b:boolean, c?:string], date> validation is not supported, instead validate parameters or return type separately.`
    );
    expect(() => buildTypeErrorsJITFn(rt)).toThrow(
        `function<[a:number, b:boolean, c?:string], date> validation is not supported, instead validate parameters or return type separately.`
    );

    expect(() => buildJsonEncodeJITFn(rt)).toThrow(
        `function<[a:number, b:boolean, c?:string], date> json encode is not supported, instead encode parameters or return type separately.`
    );
    expect(() => buildJsonDecodeJITFn(rt)).toThrow(
        `function<[a:number, b:boolean, c?:string], date> json decode is not supported, instead decode parameters or return type separately.`
    );

    expect(() => buildJsonStringifyJITFn(rt)).toThrow(
        `function<[a:number, b:boolean, c?:string], date> json stringify is not supported, instead stringify parameters or return type separately.`
    );
    expect(() => rt.mock()).toThrow(
        `function<[a:number, b:boolean, c?:string], date> mock is not supported, instead mock parameters or return type separately`
    );
});

it('validate function parameters', () => {
    const validate = rt.compiledParams.isType.fn;
    expect(validate([3, true, 'hello'])).toBe(true);
    // optional parameter
    expect(validate([3, false])).toBe(true);
    // wrong type
    expect(validate([3, 3, 3])).toBe(false);
    // more parameters than expected
    expect(validate([3, true, 'hello', 7])).toBe(false);
});

it('validate function + errors parameters', () => {
    const validate = rt.compiledParams.typeErrors.fn;
    expect(validate([3, true, 'hello'])).toEqual([]);
    // optional parameter
    expect(validate([3, false])).toEqual([]);
    // wrong type
    expect(validate([3, 3, 3])).toEqual([
        {expected: 'boolean', path: '/b'},
        {expected: 'string', path: '/c'},
    ]);
    // more parameters than expected
    expect(validate([3, true, 'hello', 7])).toEqual([{expected: '[a:number, b:boolean, c?:string]', path: ''}]);
});

it('encode/decode to json parameters', () => {
    const toJson = rt.compiledParams.jsonEncode.fn;
    const fromJson = rt.compiledParams.jsonDecode.fn;
    const typeValue = [3, true, 'hello'];
    const typeValue2 = [3, true];
    expect(rt.isParamsJsonEncodedRequired).toBe(false);
    expect(rt.isParamsJsonDecodedRequired).toBe(false);
    expect(fromJson(toJson(typeValue))).toEqual(typeValue);
    expect(fromJson(toJson(typeValue2))).toEqual(typeValue2);
});

it('required encode/decode to json parameters', () => {
    const toJson = rt2.compiledParams.jsonEncode.fn;
    const fromJson = rt2.compiledParams.jsonDecode.fn;
    const d = new Date();
    const typeValue = [d, true];
    const typeValue2 = [d];
    expect(rt2.isParamsJsonEncodedRequired).toBe(false);
    expect(rt2.isParamsJsonDecodedRequired).toBe(true);
    expect(fromJson(toJson(typeValue))).toEqual(typeValue);
    expect(fromJson(toJson(typeValue2))).toEqual(typeValue2);
});

it('json stringify parameters', () => {
    const jsonStringify = rt.compiledParams.jsonStringify.fn;
    const fromJson = rt.compiledParams.jsonDecode.fn;
    const typeValue = [3, true, 'hello'];
    const typeValue2 = [3, true];
    const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
    const roundTrip2 = fromJson(JSON.parse(jsonStringify(typeValue2)));
    expect(roundTrip).toEqual(typeValue);
    expect(roundTrip2).toEqual(typeValue2);
});

it('json stringify required parameters', () => {
    const jsonStringify = rt2.compiledParams.jsonStringify.fn;
    const fromJson = rt2.compiledParams.jsonDecode.fn;
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
    const validate = rt.compiledParams.isType.fn;
    expect(validate(rt.paramsMock())).toBe(true);
});

it('validate function return', () => {
    const validate = rt.compiledReturn.isType.fn;
    expect(validate(new Date())).toBe(true);
    expect(validate(123)).toBe(false);
});

it('validate function return + errors', () => {
    const validate = rt.compiledReturn.typeErrors.fn;
    expect(validate(new Date())).toEqual([]);
    expect(validate(123)).toEqual([{expected: 'date', path: ''}]);
});

it('encode/decode function return to json', () => {
    const toJson = rt.compiledReturn.jsonEncode.fn;
    const fromJson = rt.compiledReturn.jsonDecode.fn;
    const returnValue = new Date();
    expect(rt.isReturnJsonEncodedRequired).toBe(false);
    expect(rt.isReturnJsonDecodedRequired).toBe(true);
    expect(fromJson(toJson(returnValue))).toEqual(returnValue);
});

it('required encode/decode function return to json', () => {
    const toJson = rt2.compiledReturn.jsonEncode.fn;
    const fromJson = rt2.compiledReturn.jsonDecode.fn;
    const returnValue = 1n;
    expect(rt.isReturnJsonEncodedRequired).toBe(false);
    expect(rt.isReturnJsonDecodedRequired).toBe(true);
    expect(fromJson(toJson(returnValue))).toEqual(returnValue);
});

it('json stringify function return', () => {
    const jsonStringify = rt.compiledReturn.jsonStringify.fn;
    const fromJson = rt.compiledReturn.jsonDecode.fn;
    const returnValue = new Date();
    const roundTrip = fromJson(JSON.parse(jsonStringify(returnValue)));
    expect(roundTrip).toEqual(returnValue);
});

it('json stringify required function return', () => {
    const jsonStringify = rt2.compiledReturn.jsonStringify.fn;
    const fromJson = rt2.compiledReturn.jsonDecode.fn;
    const returnValue = 1n;
    const roundTrip = fromJson(JSON.parse(jsonStringify(returnValue)));
    expect(roundTrip).toEqual(returnValue);
});

it('mock function return', () => {
    const mocked = rt.returnMock();
    expect(mocked instanceof Date).toBe(true);
    const validate = rt.compiledReturn.isType.fn;
    expect(validate(rt.returnMock())).toBe(true);
});

it('should get runType from a function using reflectFunction', () => {
    const fn = (a: number, b: boolean, c?: string): Date => new Date();
    const reflectedType = reflectFunction(fn);
    expect(reflectedType instanceof FunctionRunType).toBe(true);

    const validate = reflectedType.compiledParams.isType.fn;
    const typeErrors = reflectedType.compiledParams.typeErrors.fn;
    const toJson = reflectedType.compiledParams.jsonEncode.fn;
    const fromJson = reflectedType.compiledParams.jsonDecode.fn;
    const jsonStringify = reflectedType.compiledParams.jsonStringify.fn;
    const paramsValues = [3, true, 'hello'];
    expect(validate(paramsValues)).toBe(true);
    expect(typeErrors(paramsValues)).toEqual([]);
    expect(fromJson(toJson(paramsValues))).toBe(paramsValues);
    expect(fromJson(JSON.parse(jsonStringify(paramsValues)))).toEqual(paramsValues);

    const validateReturn = reflectedType.compiledReturn.isType.fn;
    const typeErrorsReturn = reflectedType.compiledReturn.typeErrors.fn;
    const toJsonReturn = reflectedType.compiledReturn.jsonEncode.fn;
    const fromJsonReturn = reflectedType.compiledReturn.jsonDecode.fn;
    const jsonStringifyReturn = reflectedType.compiledReturn.jsonStringify.fn;
    const returnValue = new Date();
    expect(validateReturn(returnValue)).toBe(true);
    expect(typeErrorsReturn(returnValue)).toEqual([]);
    expect(fromJsonReturn(toJsonReturn(returnValue))).toEqual(returnValue);
    expect(fromJsonReturn(JSON.parse(jsonStringifyReturn(returnValue)))).toEqual(returnValue);
});
