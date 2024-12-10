/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../runType';
import {JitFnIDs} from '../../constants';

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
        const validate = rt.createJitFunction(JitFnIDs.isType);
        expect(validate({})).toBe(true);
        expect(validate({key1: 'value1', key2: 'value2'})).toBe(true);
        expect(validate({key1: 'value1', key2: 2})).toBe(false);
        expect(validate('hello')).toBe(false);
    });

    it('validate index run type + extra properties', () => {
        const validate = rtExtra.createJitFunction(JitFnIDs.isType);
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
        const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);
        expect(valWithErrors({key1: 'value1', key2: 'value2'})).toEqual([]);
        expect(valWithErrors('hello')).toEqual([{path: [], expected: 'object'}]);
        expect(valWithErrors({key1: 'value1', key2: 123})).toEqual([{path: ['key2'], expected: 'string'}]);
    });

    it('validate index run type with extra props + errors', () => {
        const valWithErrors = rtExtra.createJitFunction(JitFnIDs.typeErrors);
        expect(valWithErrors({key1: 'value1', key2: 'value2'})).toEqual([
            {path: ['a'], expected: 'string'}, // missing required property 'a'
            {path: ['b'], expected: 'number'}, // missing required property 'b'
        ]);
        expect(valWithErrors({a: 'hello', b: 2, key1: 'value1', key2: 'value2'})).toEqual([]); // no errors
        expect(valWithErrors({a: 'hello', b: 2, key1: 'value1', key2: 2})).toEqual([]); // no errors
        expect(valWithErrors('hello')).toEqual([{path: [], expected: 'object'}]); // invalid type
        expect(valWithErrors({a: 'string', b: 123})).toEqual([]); // no errors
        expect(valWithErrors({a: 'string', b: 'string'})).toEqual([
            {path: ['b'], expected: 'number'}, // invalid type for property 'b'
        ]);
        expect(valWithErrors({c: 'string', d: 123})).toEqual([
            {path: ['a'], expected: 'string'}, // missing required property 'a'
            {path: ['b'], expected: 'number'}, // missing required property 'b'
        ]);
    });

    it('encode/decode to json', () => {
        const toJsonString = rt.createJitFunction(JitFnIDs.toJsonVal);
        const toJsonDate = rD.createJitFunction(JitFnIDs.toJsonVal);
        const toJsonBigint = rBI.createJitFunction(JitFnIDs.toJsonVal);
        const fromJsonString = rt.createJitFunction(JitFnIDs.fromJsonVal);
        const fromJsonDate = rD.createJitFunction(JitFnIDs.fromJsonVal);
        const fromJsonBigint = rBI.createJitFunction(JitFnIDs.fromJsonVal);
        const date = new Date();
        const roundTripString = fromJsonString(JSON.parse(JSON.stringify(toJsonString({key1: 'value1', key2: 'value2'}))));
        const roundTripDate = fromJsonDate(JSON.parse(JSON.stringify(toJsonDate({key1: date, key2: date}))));
        const roundTripBigint = fromJsonBigint(JSON.parse(JSON.stringify(toJsonBigint({key1: 1n, key2: 1n}))));
        expect(roundTripString).toEqual({key1: 'value1', key2: 'value2'});
        expect(roundTripDate).toEqual({key1: date, key2: date});
        expect(roundTripBigint).toEqual({key1: 1n, key2: 1n});
    });

    it('json stringify', () => {
        const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFnIDs.fromJsonVal);
        const typeValue = {key1: 'value1', key2: 'value2'};
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);

        const typeValue2 = {};
        const roundTrip2 = fromJsonVal(JSON.parse(jsonStringify(typeValue2)));
        expect(roundTrip2).toEqual(typeValue2);
    });

    it('json stringify IndexWithExtraProps', () => {
        const jsonStringify = rtExtra.createJitFunction(JitFnIDs.jsonStringify);
        const fromJsonVal = rtExtra.createJitFunction(JitFnIDs.fromJsonVal);
        const typeValue: IndexWithExtraProps = {
            key1: 'value1',
            key2: 'value2',
            a: 'extra1',
            b: 123,
        };
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);
    });

    it('mock', () => {
        expect(rt.mock() instanceof Object).toBe(true);
        const validate = rt.createJitFunction(JitFnIDs.isType);
        expect(validate(rt.mock())).toBe(true);
    });

    it('mock IndexWithExtraProps', () => {
        expect(rtExtra.mock() instanceof Object).toBe(true);
        const validate = rtExtra.createJitFunction(JitFnIDs.isType);
        expect(validate(rtExtra.mock())).toBe(true);
    });

    it('multiple index properties', () => {
        const obj: MultipleIndex = {
            key1: 'value1',
            key2: 'value2',
            [Symbol('key3')]: new Date(),
            [Symbol('key4')]: new Date(),
        }; // symbol keys should be skipped from jit

        const toJsonVal = multipleIndex.createJitFunction(JitFnIDs.toJsonVal);
        const fromJsonVal = multipleIndex.createJitFunction(JitFnIDs.fromJsonVal);
        const stringify = multipleIndex.createJitFunction(JitFnIDs.jsonStringify);

        expect(toJsonVal(obj)).toEqual(obj);
        expect(fromJsonVal({key1: 'value1', key2: 'value2'})).toEqual({key1: 'value1', key2: 'value2'});
        expect(stringify(obj)).toEqual(JSON.stringify(obj));
    });
});

describe('IndexType nested', () => {
    const rtNested = runType<{[key: string]: {[key: string]: number}}>();
    const rtNested2 = runType<{[key: string]: {[key: string]: Date}}>();

    it('validate index run type', () => {
        const validate = rtNested.createJitFunction(JitFnIDs.isType);
        expect(validate({})).toBe(true);
        expect(validate({key1: {nestedKey1: 1, nestedKey2: 2}})).toBe(true);
        expect(validate({key1: {nestedKey1: 1, nestedKey2: '2'}})).toBe(false);
        expect(validate('hello')).toBe(false);
    });

    it('validate index run type with Date', () => {
        const validate = rtNested2.createJitFunction(JitFnIDs.isType);
        expect(validate({})).toBe(true);
        expect(validate({key1: {nestedKey1: new Date(), nestedKey2: new Date()}})).toBe(true);
        expect(validate({key1: {nestedKey1: new Date(), nestedKey2: '2'}})).toBe(false);
        expect(validate('hello')).toBe(false);
    });

    it('validate index run type + errors', () => {
        const valWithErrors = rtNested.createJitFunction(JitFnIDs.typeErrors);
        expect(valWithErrors({key1: {nestedKey1: 1, nestedKey2: 2}})).toEqual([]);
        expect(valWithErrors('hello')).toEqual([{path: [], expected: 'object'}]);
        expect(valWithErrors({key1: {nestedKey1: 1, nestedKey2: '2'}})).toEqual([
            {path: ['key1', 'nestedKey2'], expected: 'number'},
        ]);
    });

    it('validate index run type with Date + errors', () => {
        const valWithErrors = rtNested2.createJitFunction(JitFnIDs.typeErrors);
        expect(valWithErrors({key1: {nestedKey1: new Date(), nestedKey2: new Date()}})).toEqual([]);
        expect(valWithErrors('hello')).toEqual([{path: [], expected: 'object'}]);
        expect(valWithErrors({key1: {nestedKey1: new Date(), nestedKey2: '2'}})).toEqual([
            {path: ['key1', 'nestedKey2'], expected: 'date'},
        ]);
    });

    it('encode to json', () => {
        const toJsonVal = rtNested.createJitFunction(JitFnIDs.toJsonVal);
        const obj = {key1: {nestedKey1: 1, nestedKey2: 2}};
        expect(toJsonVal(obj)).toEqual(obj);
    });

    it('encode to json Date', () => {
        const toJsonVal = rtNested2.createJitFunction(JitFnIDs.toJsonVal);
        const obj = {key1: {nestedKey1: new Date(), nestedKey2: new Date()}};
        expect(toJsonVal(obj)).toEqual(obj);
    });

    it('decode from json', () => {
        const fromJsonVal = rtNested.createJitFunction(JitFnIDs.fromJsonVal);
        const obj = {key1: {nestedKey1: 1, nestedKey2: 2}};
        const jsonString = JSON.stringify(obj);
        expect(fromJsonVal(JSON.parse(jsonString))).toEqual(obj);
    });

    it('decode from json Date', () => {
        const fromJsonVal = rtNested2.createJitFunction(JitFnIDs.fromJsonVal);
        const obj = {key1: {nestedKey1: new Date(), nestedKey2: new Date()}};
        const jsonString = JSON.stringify(obj);
        expect(fromJsonVal(JSON.parse(jsonString))).toEqual(obj);
    });

    it('json stringify', () => {
        const jsonStringify = rtNested.createJitFunction(JitFnIDs.jsonStringify);
        const fromJsonVal = rtNested.createJitFunction(JitFnIDs.fromJsonVal);
        const obj = {key1: {nestedKey1: 1, nestedKey2: 2}};
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(obj)));
        expect(roundTrip).toEqual(obj);
    });

    it('json stringify Date', () => {
        const jsonStringify = rtNested2.createJitFunction(JitFnIDs.jsonStringify);
        const fromJsonVal = rtNested2.createJitFunction(JitFnIDs.fromJsonVal);
        const obj = {key1: {nestedKey1: new Date(), nestedKey2: new Date()}};
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(obj)));
        expect(roundTrip).toEqual(obj);
    });

    it('mock', () => {
        expect(rtNested.mock() instanceof Object).toBe(true);
        const validate = rtNested.createJitFunction(JitFnIDs.isType);
        expect(validate(rtNested.mock())).toBe(true);
    });
});
