/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../lib/runType';
import {JitFunctions} from '../../constants';

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
        const validate = rt.createJitFunction(JitFunctions.isType);
        expect(validate({})).toBe(true);
        expect(validate({key1: 'value1', key2: 'value2'})).toBe(true);
        expect(validate({key1: 'value1', key2: 2})).toBe(false);
        expect(validate('hello')).toBe(false);
    });

    it('validate index run type + extra properties', () => {
        const validate = rtExtra.createJitFunction(JitFunctions.isType);
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
        const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);
        expect(valWithErrors({key1: 'value1', key2: 'value2'})).toEqual([]);
        expect(valWithErrors('hello')).toEqual([{path: [], expected: 'object'}]);
        expect(valWithErrors({key1: 'value1', key2: 123})).toEqual([{path: ['key2'], expected: 'string'}]);
    });

    it('validate index run type with extra props + errors', () => {
        const valWithErrors = rtExtra.createJitFunction(JitFunctions.typeErrors);
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
        const toJsonString = rt.createJitFunction(JitFunctions.toJsonVal);
        const toJsonDate = rD.createJitFunction(JitFunctions.toJsonVal);
        const toJsonBigint = rBI.createJitFunction(JitFunctions.toJsonVal);
        const fromJsonString = rt.createJitFunction(JitFunctions.fromJsonVal);
        const fromJsonDate = rD.createJitFunction(JitFunctions.fromJsonVal);
        const fromJsonBigint = rBI.createJitFunction(JitFunctions.fromJsonVal);
        const date = new Date();
        const roundTripString = fromJsonString(JSON.parse(JSON.stringify(toJsonString({key1: 'value1', key2: 'value2'}))));
        const roundTripDate = fromJsonDate(JSON.parse(JSON.stringify(toJsonDate({key1: date, key2: date}))));
        const roundTripBigint = fromJsonBigint(JSON.parse(JSON.stringify(toJsonBigint({key1: 1n, key2: 1n}))));
        expect(roundTripString).toEqual({key1: 'value1', key2: 'value2'});
        expect(roundTripDate).toEqual({key1: date, key2: date});
        expect(roundTripBigint).toEqual({key1: 1n, key2: 1n});
    });

    it('json stringify', () => {
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const typeValue = {key1: 'value1', key2: 'value2'};
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);

        const typeValue2 = {};
        const roundTrip2 = fromJsonVal(JSON.parse(jsonStringify(typeValue2)));
        expect(roundTrip2).toEqual(typeValue2);
    });

    it('json stringify IndexWithExtraProps', () => {
        const jsonStringify = rtExtra.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rtExtra.createJitFunction(JitFunctions.fromJsonVal);
        const typeValue: IndexWithExtraProps = {
            key1: 'value1',
            key2: 'value2',
            a: 'extra1',
            b: 123,
        };
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);
    });

    it('mock', async () => {
        const mocked = await rt.mock();
        expect(mocked instanceof Object).toBe(true);
        const validate = rt.createJitFunction(JitFunctions.isType);
        expect(validate(mocked)).toBe(true);
    });

    it('mock IndexWithExtraProps', async () => {
        const mocked = await rtExtra.mock();
        expect(mocked instanceof Object).toBe(true);
        const validate = rtExtra.createJitFunction(JitFunctions.isType);
        expect(validate(mocked)).toBe(true);
    });

    it('multiple index properties', () => {
        const obj: MultipleIndex = {
            key1: 'value1',
            key2: 'value2',
            [Symbol('key3')]: new Date(),
            [Symbol('key4')]: new Date(),
        }; // symbol keys should be skipped from jit

        const toJsonVal = multipleIndex.createJitFunction(JitFunctions.toJsonVal);
        const fromJsonVal = multipleIndex.createJitFunction(JitFunctions.fromJsonVal);
        const stringify = multipleIndex.createJitFunction(JitFunctions.jsonStringify);

        expect(toJsonVal(obj)).toEqual(obj);
        expect(fromJsonVal({key1: 'value1', key2: 'value2'})).toEqual({key1: 'value1', key2: 'value2'});
        expect(stringify(obj)).toEqual(JSON.stringify(obj));
    });
});

describe('IndexType nested', () => {
    const rtNested = runType<{[key: string]: {[key: string]: number}}>();
    const rtNested2 = runType<{[key: string]: {[key: string]: Date}}>();

    it('validate index run type', () => {
        const validate = rtNested.createJitFunction(JitFunctions.isType);
        expect(validate({})).toBe(true);
        expect(validate({key1: {nestedKey1: 1, nestedKey2: 2}})).toBe(true);
        expect(validate({key1: {nestedKey1: 1, nestedKey2: '2'}})).toBe(false);
        expect(validate('hello')).toBe(false);
    });

    it('validate index run type with Date', () => {
        const validate = rtNested2.createJitFunction(JitFunctions.isType);
        expect(validate({})).toBe(true);
        expect(validate({key1: {nestedKey1: new Date(), nestedKey2: new Date()}})).toBe(true);
        expect(validate({key1: {nestedKey1: new Date(), nestedKey2: '2'}})).toBe(false);
        expect(validate('hello')).toBe(false);
    });

    it('validate index run type + errors', () => {
        const valWithErrors = rtNested.createJitFunction(JitFunctions.typeErrors);
        expect(valWithErrors({key1: {nestedKey1: 1, nestedKey2: 2}})).toEqual([]);
        expect(valWithErrors('hello')).toEqual([{path: [], expected: 'object'}]);
        expect(valWithErrors({key1: {nestedKey1: 1, nestedKey2: '2'}})).toEqual([
            {path: ['key1', 'nestedKey2'], expected: 'number'},
        ]);
    });

    it('validate index run type with Date + errors', () => {
        const valWithErrors = rtNested2.createJitFunction(JitFunctions.typeErrors);
        expect(valWithErrors({key1: {nestedKey1: new Date(), nestedKey2: new Date()}})).toEqual([]);
        expect(valWithErrors('hello')).toEqual([{path: [], expected: 'object'}]);
        expect(valWithErrors({key1: {nestedKey1: new Date(), nestedKey2: '2'}})).toEqual([
            {path: ['key1', 'nestedKey2'], expected: 'date'},
        ]);
    });

    it('encode to json', () => {
        const toJsonVal = rtNested.createJitFunction(JitFunctions.toJsonVal);
        const obj = {key1: {nestedKey1: 1, nestedKey2: 2}};
        expect(toJsonVal(obj)).toEqual(obj);
    });

    it('encode to json Date', () => {
        const toJsonVal = rtNested2.createJitFunction(JitFunctions.toJsonVal);
        const obj = {key1: {nestedKey1: new Date(), nestedKey2: new Date()}};
        expect(toJsonVal(obj)).toEqual(obj);
    });

    it('decode from json', () => {
        const fromJsonVal = rtNested.createJitFunction(JitFunctions.fromJsonVal);
        const obj = {key1: {nestedKey1: 1, nestedKey2: 2}};
        const jsonString = JSON.stringify(obj);
        expect(fromJsonVal(JSON.parse(jsonString))).toEqual(obj);
    });

    it('decode from json Date', () => {
        const fromJsonVal = rtNested2.createJitFunction(JitFunctions.fromJsonVal);
        const obj = {key1: {nestedKey1: new Date(), nestedKey2: new Date()}};
        const jsonString = JSON.stringify(obj);
        expect(fromJsonVal(JSON.parse(jsonString))).toEqual(obj);
    });

    it('json stringify', () => {
        const jsonStringify = rtNested.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rtNested.createJitFunction(JitFunctions.fromJsonVal);
        const obj = {key1: {nestedKey1: 1, nestedKey2: 2}};
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(obj)));
        expect(roundTrip).toEqual(obj);
    });

    it('json stringify Date', () => {
        const jsonStringify = rtNested2.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rtNested2.createJitFunction(JitFunctions.fromJsonVal);
        const obj = {key1: {nestedKey1: new Date(), nestedKey2: new Date()}};
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(obj)));
        expect(roundTrip).toEqual(obj);
    });

    it('mock', async () => {
        const mocked = await rtNested.mock();
        expect(mocked instanceof Object).toBe(true);
        expect(mocked instanceof Object).toBe(true);
        const validate = rtNested.createJitFunction(JitFunctions.isType);
        expect(validate(mocked)).toBe(true);
    });
});

describe('IndexType non root', () => {
    interface Obj1 {
        a: string;
        [key: string]: string;
    }

    interface Obj2 {
        b: string;
        c: Obj1;
    }

    it('validate', () => {
        const rt = runType<Obj2>();
        const validate = rt.createJitFunction(JitFunctions.isType);
        expect(validate({b: 'hello', c: {a: 'world', c: 'world'}})).toBe(true);
        expect(validate({b: 'hello', c: {a: 'world', c: 123}})).toBe(false);
    });

    it('validate errors', () => {
        const rt = runType<Obj2>();
        const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);
        expect(valWithErrors({b: 'hello', c: {a: 'world', c: 'world'}})).toEqual([]);
        expect(valWithErrors({b: 'hello', c: {a: 'world', c: 123}})).toEqual([{path: ['c', 'c'], expected: 'string'}]);
    });

    it('encode to json', () => {
        const rt = runType<Obj2>();
        const toJsonVal = rt.createJitFunction(JitFunctions.toJsonVal);
        const obj = {b: 'hello', c: {a: 'world', c: 'world'}};
        expect(toJsonVal(obj)).toEqual(obj);
    });

    it('decode from json', () => {
        const rt = runType<Obj2>();
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const obj = {b: 'hello', c: {a: 'world', c: 'world'}};
        const jsonString = JSON.stringify(obj);
        expect(fromJsonVal(JSON.parse(jsonString))).toEqual(obj);
    });

    it('json stringify', () => {
        const rt = runType<Obj2>();
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const obj = {b: 'hello', c: {a: 'world', c: 'world'}};
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(obj)));
        expect(roundTrip).toEqual(obj);
    });

    it('mock', async () => {
        const rt = runType<Obj2>();
        const mocked = await rt.mock();
        expect(mocked).toHaveProperty('b');
        expect(mocked).toHaveProperty('c');
        expect(typeof mocked.c.a).toBe('string');
        const validate = rt.createJitFunction(JitFunctions.isType);
        expect(validate(mocked)).toBe(true);
    });
});
