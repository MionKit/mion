/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../runType';
import {
    buildJsonEncodeJITFn,
    buildJsonDecodeJITFn,
    buildIsTypeJITFn,
    buildTypeErrorsJITFn,
    buildJsonStringifyJITFn,
} from '../jitCompiler';
import exp from 'constants';

describe('IndexType', () => {
    interface IndexString {
        [key: string]: string;
    }
    type IndexDate = {
        [key: string]: Date;
    };
    type IndexBigInt = {
        [key: string]: bigint;
    };
    type IndexWithExtraProps = {
        a: string;
        b: number;
        [key: string]: string | number;
    };
    // only index type with one defined key will be allowed
    type MultipleIndex = {
        [key: string]: string;
        [key: number]: string;
        [abc: symbol]: Date;
    };

    const rt = runType<IndexString>();
    const rD = runType<IndexDate>();
    const rBI = runType<IndexBigInt>();
    const rtExtra = runType<IndexWithExtraProps>();
    const multipleIndex = runType<MultipleIndex>();

    it('validate index run type', () => {
        const validate = buildIsTypeJITFn(rt).fn;
        expect(validate({})).toBe(true);
        expect(validate({key1: 'value1', key2: 'value2'})).toBe(true);
        expect(validate({key1: 'value1', key2: 2})).toBe(false);
        expect(validate('hello')).toBe(false);
    });

    it('validate index run type + extra properties', () => {
        const validate = buildIsTypeJITFn(rtExtra).fn;
        expect(validate({key1: 'value1', key2: 'value2'})).toBe(false); // missing required a and b
        expect(validate({key1: 'value1', key2: 2})).toBe(false); // missing required a and b
        expect(validate({a: 'hello', b: 2, key1: 'value1', key2: 'value2'})).toBe(true);
        expect(validate({a: 'hello', b: 2, key1: 'value1', key2: 2})).toBe(true);
        expect(validate('hello')).toBe(false);
        expect(validate({a: 'string', b: 123})).toBe(true);
        expect(validate({a: 'string', b: 'string'})).toBe(false);
        expect(validate({c: 'string', d: 123})).toBe(false);
    });

    it('validate index run type + errors', () => {
        const valWithErrors = buildTypeErrorsJITFn(rt).fn;
        expect(valWithErrors({key1: 'value1', key2: 'value2'})).toEqual([]);
        expect(valWithErrors('hello')).toEqual([{path: '', expected: 'object<index<string>>'}]);
        expect(valWithErrors({key1: 'value1', key2: 123})).toEqual([{path: '/key2', expected: 'string'}]);
    });

    it('validate index run type with extra props + errors', () => {
        const valWithErrors = buildTypeErrorsJITFn(rtExtra).fn;
        expect(valWithErrors({key1: 'value1', key2: 'value2'})).toEqual([
            {path: '/a', expected: 'string'}, // missing required property 'a'
            {path: '/b', expected: 'number'}, // missing required property 'b'
        ]);
        expect(valWithErrors({a: 'hello', b: 2, key1: 'value1', key2: 'value2'})).toEqual([]); // no errors
        expect(valWithErrors({a: 'hello', b: 2, key1: 'value1', key2: 2})).toEqual([]); // no errors
        expect(valWithErrors('hello')).toEqual([
            {path: '', expected: 'object<a:string, b:number, index<union<string | number>>>'},
        ]); // invalid type
        expect(valWithErrors({a: 'string', b: 123})).toEqual([]); // no errors
        expect(valWithErrors({a: 'string', b: 'string'})).toEqual([
            {path: '/b', expected: 'number'}, // invalid type for property 'b'
        ]);
        expect(valWithErrors({c: 'string', d: 123})).toEqual([
            {path: '/a', expected: 'string'}, // missing required property 'a'
            {path: '/b', expected: 'number'}, // missing required property 'b'
        ]);
    });

    it('encode/decode to json', () => {
        const toJsonString = buildJsonEncodeJITFn(rt).fn;
        const toJsonDate = buildJsonEncodeJITFn(rD).fn;
        const toJsonBigint = buildJsonEncodeJITFn(rBI).fn;
        const fromJsonString = buildJsonDecodeJITFn(rt).fn;
        const fromJsonDate = buildJsonDecodeJITFn(rD).fn;
        const fromJsonBigint = buildJsonDecodeJITFn(rBI).fn;
        const date = new Date();
        const roundTripString = fromJsonString(JSON.parse(JSON.stringify(toJsonString({key1: 'value1', key2: 'value2'}))));
        const roundTripDate = fromJsonDate(JSON.parse(JSON.stringify(toJsonDate({key1: date, key2: date}))));
        const roundTripBigint = fromJsonBigint(JSON.parse(JSON.stringify(toJsonBigint({key1: 1n, key2: 1n}))));
        expect(roundTripString).toEqual({key1: 'value1', key2: 'value2'});
        expect(roundTripDate).toEqual({key1: date, key2: date});
        expect(roundTripBigint).toEqual({key1: 1n, key2: 1n});
    });

    it('json stringify', () => {
        const jsonStringify = buildJsonStringifyJITFn(rt).fn;
        const fromJson = buildJsonDecodeJITFn(rt).fn;
        const typeValue = {key1: 'value1', key2: 'value2'};
        const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);

        const typeValue2 = {};
        const roundTrip2 = fromJson(JSON.parse(jsonStringify(typeValue2)));
        expect(roundTrip2).toEqual(typeValue2);
    });

    it('json stringify IndexWithExtraProps', () => {
        const jsonStringify = buildJsonStringifyJITFn(rtExtra).fn;
        const fromJson = buildJsonDecodeJITFn(rtExtra).fn;
        const typeValue = {
            key1: 'value1',
            key2: 'value2',
            a: 'extra1',
            b: 123,
        };
        const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);
    });

    it('mock', () => {
        expect(rt.mock() instanceof Object).toBe(true);
        const validate = buildIsTypeJITFn(rt).fn;
        expect(validate(rt.mock())).toBe(true);
    });

    it('mock IndexWithExtraProps', () => {
        expect(rtExtra.mock() instanceof Object).toBe(true);
        const validate = buildIsTypeJITFn(rtExtra).fn;
        expect(validate(rtExtra.mock())).toBe(true);
    });

    it('multiple index properties', () => {
        const obj = {
            key1: 'value1',
            key2: 'value2',
            [Symbol('key3')]: new Date(),
            [Symbol('key4')]: new Date(),
        };

        const toJson = buildJsonEncodeJITFn(multipleIndex).fn;
        const fromJson = buildJsonDecodeJITFn(multipleIndex).fn;
        const stringify = buildJsonStringifyJITFn(multipleIndex).fn;

        expect(toJson(obj)).toEqual(obj);
        expect(fromJson({key1: 'value1', key2: 'value2'})).toEqual({key1: 'value1', key2: 'value2'});
        expect(stringify(obj)).toEqual(JSON.stringify(obj));
    });
});

describe('IndexType recursion', () => {
    const rtRec = runType<{[key: string]: {[key: string]: number}}>();

    it('validate index run type', () => {
        const validate = buildIsTypeJITFn(rtRec).fn;
        expect(validate({})).toBe(true);
        expect(validate({key1: {nestedKey1: 1, nestedKey2: 2}})).toBe(true);
        expect(validate({key1: {nestedKey1: 1, nestedKey2: '2'}})).toBe(false);
        expect(validate('hello')).toBe(false);
    });

    it('validate index run type + errors', () => {
        const valWithErrors = buildTypeErrorsJITFn(rtRec).fn;
        expect(valWithErrors({key1: {nestedKey1: 1, nestedKey2: 2}})).toEqual([]);
        expect(valWithErrors('hello')).toEqual([{path: '', expected: 'object<index<object<index<number>>>>'}]);
        expect(valWithErrors({key1: {nestedKey1: 1, nestedKey2: '2'}})).toEqual([{path: '/key1/nestedKey2', expected: 'number'}]);
    });

    it('encode to json', () => {
        const toJson = buildJsonEncodeJITFn(rtRec).fn;
        const obj = {key1: {nestedKey1: 1, nestedKey2: 2}};
        expect(toJson(obj)).toEqual(obj);
    });

    it('decode from json', () => {
        const fromJson = buildJsonDecodeJITFn(rtRec).fn;
        const obj = {key1: {nestedKey1: 1, nestedKey2: 2}};
        const jsonString = JSON.stringify(obj);
        expect(fromJson(JSON.parse(jsonString))).toEqual(obj);
    });

    it('json stringify', () => {
        const jsonStringify = buildJsonStringifyJITFn(rtRec).fn;
        const fromJson = buildJsonDecodeJITFn(rtRec).fn;
        const obj = {key1: {nestedKey1: 1, nestedKey2: 2}};
        const roundTrip = fromJson(JSON.parse(jsonStringify(obj)));
        expect(roundTrip).toEqual(obj);
    });

    it('mock', () => {
        expect(rtRec.mock() instanceof Object).toBe(true);
        const validate = buildIsTypeJITFn(rtRec).fn;
        expect(validate(rtRec.mock())).toBe(true);
    });
});
