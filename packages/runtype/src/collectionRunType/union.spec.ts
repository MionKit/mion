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

describe('Atomic Union', () => {
    type AtomicUnion = Date | number | string | null | bigint;

    const a: AtomicUnion = new Date();
    const b: AtomicUnion = 123;
    const c: AtomicUnion = 'hello';
    const d: AtomicUnion = null;
    const e: AtomicUnion = 3n;

    const notA = {};
    const notB = true;
    const notC = [];

    const rt = runType<AtomicUnion>();

    it('validate union', () => {
        const validate = buildIsTypeJITFn(rt).fn;

        expect(validate(a)).toBe(true);
        expect(validate(b)).toBe(true);
        expect(validate(c)).toBe(true);
        expect(validate(d)).toBe(true);
        expect(validate(e)).toBe(true);
        expect(validate(notA)).toBe(false);
        expect(validate(notB)).toBe(false);
        expect(validate(notC)).toBe(false);
    });

    it('validate union + errors', () => {
        const valWithErrors = buildTypeErrorsJITFn(rt).fn;

        expect(valWithErrors(a)).toEqual([]);
        expect(valWithErrors(b)).toEqual([]);
        expect(valWithErrors(c)).toEqual([]);
        expect(valWithErrors(d)).toEqual([]);
        expect(valWithErrors(e)).toEqual([]);

        expect(valWithErrors(notA)).toEqual([{path: [], expected: 'union'}]);
        expect(valWithErrors(notB)).toEqual([{path: [], expected: 'union'}]);
        expect(valWithErrors(notC)).toEqual([{path: [], expected: 'union'}]);
    });

    it('encode/decode to json', () => {
        const toJson = buildJsonEncodeJITFn(rt).fn;
        const fromJson = buildJsonDecodeJITFn(rt).fn;

        expect(rt.isJsonDecodeRequired).toBe(true);
        expect(rt.isJsonEncodeRequired).toBe(true);
        expect(fromJson(toJson(a))).toEqual(a);
        expect(fromJson(toJson(b))).toEqual(b);
        expect(fromJson(toJson(c))).toEqual(c);
        expect(fromJson(toJson(d))).toEqual(d);
        expect(fromJson(toJson(e))).toEqual(e);

        // objects are not the same same object in memory after round trip
        expect(fromJson(toJson(a))).not.toBe(a);
    });

    it('json stringify with discriminator', () => {
        // this should be serialized as [discriminatorIndex, value]
        const jsonStringify = buildJsonStringifyJITFn(rt).fn;
        const fromJson = buildJsonDecodeJITFn(rt).fn;

        expect(fromJson(JSON.parse(jsonStringify(a)))).toEqual(a);
        expect(fromJson(JSON.parse(jsonStringify(b)))).toEqual(b);
        expect(fromJson(JSON.parse(jsonStringify(c)))).toEqual(c);
        expect(fromJson(JSON.parse(jsonStringify(d)))).toEqual(d);
        expect(fromJson(JSON.parse(jsonStringify(e)))).toEqual(e);
    });

    it('throw errors when serializing deserializing object not belonging to the union', () => {
        type UT = string | number;
        const rtU = runType<UT>();
        const jsonStringify = buildJsonStringifyJITFn(rtU).fn;
        const fromJson = buildJsonDecodeJITFn(rtU).fn;
        const toJson = buildJsonEncodeJITFn(rtU).fn;
        const typeValue = new Date();

        expect(() => jsonStringify(typeValue)).toThrow('Can not stringify union: expected one of <string | number> but got Date');
        expect(() => fromJson(123)).toThrow('Can not decode json to union: expected one of <string | number> but got Number');
        expect(() => toJson(typeValue)).toThrow('Can not encode json to union: expected one of <string | number> but got Date');
    });

    it('mock', () => {
        const mocked = rt.mock();
        expect(
            typeof mocked === 'string' ||
                typeof mocked === 'number' ||
                typeof mocked === 'bigint' ||
                mocked instanceof Date ||
                mocked === null
        ).toBe(true);
        const validate = buildIsTypeJITFn(rt).fn;
        expect(validate(rt.mock())).toBe(true);
    });
});

describe('Union Arr', () => {
    type UnionArr = string[] | number[] | boolean[];

    const arrA: UnionArr = ['a', 'b', 'c'];
    const arrB: UnionArr = [1, 2, 3];
    const arrC: UnionArr = [true, false, true];
    const arrD: UnionArr = [];
    const notArr = ['a', 1, true];

    const rt = runType<UnionArr>();

    it('validate union', () => {
        const validate = buildIsTypeJITFn(rt).fn;

        expect(validate(arrA)).toBe(true);
        expect(validate(arrB)).toBe(true);
        expect(validate(arrC)).toBe(true);
        expect(validate(arrD)).toBe(true);

        expect(validate(notArr)).toBe(false);
    });

    it('validate union + errors', () => {
        const valWithErrors = buildTypeErrorsJITFn(rt).fn;

        expect(valWithErrors(arrA)).toEqual([]);
        expect(valWithErrors(arrB)).toEqual([]);
        expect(valWithErrors(arrC)).toEqual([]);
        expect(valWithErrors(arrD)).toEqual([]);

        expect(valWithErrors(notArr)).toEqual([{path: [], expected: 'union'}]);
    });

    it('encode/decode to json', () => {
        const toJson = buildJsonEncodeJITFn(rt).fn;
        const fromJson = buildJsonDecodeJITFn(rt).fn;

        expect(rt.isJsonDecodeRequired).toBe(true);
        expect(rt.isJsonEncodeRequired).toBe(true);
        expect(fromJson(toJson(arrA))).toEqual(arrA);
        expect(fromJson(toJson(arrB))).toEqual(arrB);
        expect(fromJson(toJson(arrC))).toEqual(arrC);
        expect(fromJson(toJson(arrD))).toEqual(arrD);

        // objects are not the same same object in memory after round trip
        expect(fromJson(toJson(arrA))).not.toBe(arrA);
    });

    it('json stringify with discriminator', () => {
        // this should be serialized as [discriminatorIndex, value]
        const jsonStringify = buildJsonStringifyJITFn(rt).fn;
        const fromJson = buildJsonDecodeJITFn(rt).fn;

        expect(fromJson(JSON.parse(jsonStringify(arrA)))).toEqual(arrA);
        expect(fromJson(JSON.parse(jsonStringify(arrB)))).toEqual(arrB);
        expect(fromJson(JSON.parse(jsonStringify(arrC)))).toEqual(arrC);
        expect(fromJson(JSON.parse(jsonStringify(arrD)))).toEqual(arrD);
    });

    it('throw errors when serializing deserializing object not belonging to the union', () => {
        type UT = string | number;
        const rtU = runType<UT>();
        const jsonStringify = buildJsonStringifyJITFn(rtU).fn;
        const fromJson = buildJsonDecodeJITFn(rtU).fn;
        const toJson = buildJsonEncodeJITFn(rtU).fn;
        const typeValue = new Date();

        expect(() => jsonStringify(typeValue)).toThrow('Can not stringify union: expected one of <array | array> but got Date');
        expect(() => fromJson(123)).toThrow('Can not decode json to union: expected one of <array | array> but got Number');
        expect(() => toJson(typeValue)).toThrow('Can not encode json to union: expected one of <array | array> but got Date');
    });

    it('mock', () => {
        const mocked = rt.mock();
        expect(Array.isArray(mocked)).toBe(true);
        const validate = buildIsTypeJITFn(rt).fn;
        expect(validate(rt.mock())).toBe(true);
    });
});

describe('Union Obj', () => {
    type UnionObj = {a: string} | {b: number} | {c: boolean};

    // union of objects allow for an abject with all the properties of the objects
    const objA: UnionObj = {a: 'hello', b: 123, c: true};
    const objB: UnionObj = {a: 'world'};
    const notA = {}; // union of object must have at least one of the properties of the union
    const notB = {a: 123}; // properties of the union must be of the correct type

    // disabled as we are not yet checking strictness of the object
    // const notC = {a: 'hello', d: 'extra'}; // extra properties are not allowed in the union

    const rt = runType<UnionObj>();

    it('validate union', () => {
        const validate = buildIsTypeJITFn(rt).fn;

        expect(validate(objA)).toBe(true);
        expect(validate(objB)).toBe(true);

        expect(validate(notA)).toBe(false);
        expect(validate(notB)).toBe(false);
        // expect(validate(notC)).toBe(false);
    });

    it('validate union + errors', () => {
        const valWithErrors = buildTypeErrorsJITFn(rt).fn;

        expect(valWithErrors(objA)).toEqual([]);
        expect(valWithErrors(objB)).toEqual([]);

        expect(valWithErrors(notA)).toEqual([{path: [], expected: 'union'}]);
        expect(valWithErrors(notB)).toEqual([{path: [], expected: 'union'}]);
        // expect(valWithErrors(notC)).toEqual([{path: [], expected: 'union'}]);
    });

    it('encode/decode to json', () => {
        const toJson = buildJsonEncodeJITFn(rt).fn;
        const fromJson = buildJsonDecodeJITFn(rt).fn;

        expect(rt.isJsonDecodeRequired).toBe(true);
        expect(rt.isJsonEncodeRequired).toBe(true);
        expect(fromJson(toJson(objA))).toEqual(objA);
        expect(fromJson(toJson(objB))).toEqual(objB);

        // objects are not the same same object in memory after round trip
        expect(fromJson(toJson(objA))).not.toBe(objA);
    });

    it('json stringify with discriminator', () => {
        // this should be serialized as [discriminatorIndex, value]
        const jsonStringify = buildJsonStringifyJITFn(rt).fn;
        const fromJson = buildJsonDecodeJITFn(rt).fn;

        expect(fromJson(JSON.parse(jsonStringify(objA)))).toEqual(objA);
        expect(fromJson(JSON.parse(jsonStringify(objB)))).toEqual(objB);
    });

    it('throw errors whe serializing deserializing object not belonging to the union', () => {
        type UT = string | number;
        const rtU = runType<UT>();
        const jsonStringify = buildJsonStringifyJITFn(rtU).fn;
        const fromJson = buildJsonDecodeJITFn(rtU).fn;
        const toJson = buildJsonEncodeJITFn(rtU).fn;
        const typeValue = new Date();

        expect(() => jsonStringify(typeValue)).toThrow(
            'Can not stringify union: expected one of <interface | interface> but got Date'
        );
        expect(() => fromJson(123)).toThrow(
            'Can not decode json to union: expected one of <interface | interface> but got Number'
        );
        expect(() => toJson(typeValue)).toThrow(
            'Can not encode json to union: expected one of <interface | interface> but got Date'
        );
    });

    it('mock', () => {
        const mocked = rt.mock();
        expect(typeof mocked === 'object').toBe(true);
        const validate = buildIsTypeJITFn(rt).fn;
        expect(validate(rt.mock())).toBe(true);
    });
});

describe('Union Mixed', () => {
    type UnionMix = string[] | number[] | boolean[] | {a: string} | {b: number} | {c: boolean};

    const mixA: UnionMix = ['a', 'b', 'c'];
    const mixB: UnionMix = {a: 'hello', b: 123, c: true};
    const notA = [1, 'b'];
    const notB = {};
    const notC = {a: 'hello', d: 'extra'};
    // if uncommented bellow code ts will throw an error.
    // const notMixA: UnionMix  = [1, 'b'];
    // const notMixB: UnionMix  = {}; // error in root
    // const notMixC: UnionMix  = {a: 'hello', d: 'extra'}; // errors in prop d

    const rt = runType<UnionMix>();

    it('validate union', () => {
        const validate = buildIsTypeJITFn(rt).fn;

        expect(validate(mixA)).toBe(true);
        expect(validate(mixB)).toBe(true);

        expect(validate(notA)).toBe(false);
        expect(validate(notB)).toBe(false);
        expect(validate(notC)).toBe(false);
    });

    it('validate union + errors', () => {
        const valWithErrors = buildTypeErrorsJITFn(rt).fn;

        expect(valWithErrors(mixA)).toEqual([]);
        expect(valWithErrors(mixB)).toEqual([]);

        expect(valWithErrors(notA)).toEqual([{path: [], expected: 'union'}]);
        expect(valWithErrors(notB)).toEqual([{path: [], expected: 'union'}]);
        // expect(valWithErrors(notC)).toEqual([{path: [], expected: 'union'}]);
    });

    it('encode/decode to json', () => {
        const toJson = buildJsonEncodeJITFn(rt).fn;
        const fromJson = buildJsonDecodeJITFn(rt).fn;

        expect(rt.isJsonDecodeRequired).toBe(true);
        expect(rt.isJsonEncodeRequired).toBe(true);
        expect(fromJson(toJson(mixA))).toEqual(mixA);
        expect(fromJson(toJson(mixB))).toEqual(mixB);

        // objects are not the same same object in memory after round trip
        expect(fromJson(toJson(mixA))).not.toBe(mixA);
    });

    it('json stringify with discriminator', () => {
        // this should be serialized as [discriminatorIndex, value]
        const jsonStringify = buildJsonStringifyJITFn(rt).fn;
        const fromJson = buildJsonDecodeJITFn(rt).fn;

        expect(fromJson(JSON.parse(jsonStringify(mixA)))).toEqual(mixA);
        expect(fromJson(JSON.parse(jsonStringify(mixB)))).toEqual(mixB);
    });

    it('throw errors whe serializing deserializing object not belonging to the union', () => {
        type UT = string | number;
        const rtU = runType<UT>();
        const jsonStringify = buildJsonStringifyJITFn(rtU).fn;
        const fromJson = buildJsonDecodeJITFn(rtU).fn;
        const toJson = buildJsonEncodeJITFn(rtU).fn;
        const typeValue = new Date();

        expect(() => jsonStringify(typeValue)).toThrow('Can not stringify union: expected one of <string | number> but got Date');
        expect(() => fromJson(123)).toThrow('Can not decode json to union: expected one of <string | number> but got Number');
        expect(() => toJson(typeValue)).toThrow('Can not encode json to union: expected one of <string | number> but got Date');
    });

    it('mock', () => {
        const mocked = rt.mock();
        expect(
            typeof mocked === 'string' ||
                typeof mocked === 'number' ||
                typeof mocked === 'bigint' ||
                mocked instanceof Date ||
                mocked === null
        ).toBe(true);
        const validate = buildIsTypeJITFn(rt).fn;
        expect(validate(rt.mock())).toBe(true);
    });
});

describe.skip('Union circular', () => {
    type UnionC = Date | number | string | {a?: UnionC} | UnionC[];

    it('validate CircularProperty', () => {
        const rt = runType<UnionC>();
        const validate = buildIsTypeJITFn(rt).fn;
        expect(validate(new Date())).toBe(true);
        expect(validate(123)).toBe(true);
        expect(validate('hello')).toBe(true);
        expect(validate({a: {a: {}}})).toBe(true);
        expect(validate({})).toBe(true);
        expect(validate(['a', 'b', 'c'])).toBe(true);
        expect(validate([])).toBe(true);
        expect(validate([[]])).toBe(true);
        expect(validate([[new Date()], 3, 'hello'])).toBe(true);

        // error inside the recursion (bigint and boolean are not allowed)
        expect(validate([new Date(), true])).toBe(false);
        expect(validate([[new Date()], 3, 3n])).toBe(false);
        // wrong root type
        expect(validate(true)).toBe(false);
    });

    it('validate CircularProperty + errors', () => {
        const rt = runType<UnionC>();
        const valWithErrors = buildTypeErrorsJITFn(rt).fn;
        expect(valWithErrors(new Date())).toEqual([]);
        expect(valWithErrors(123)).toEqual([]);
        expect(valWithErrors('hello')).toEqual([]);
        expect(valWithErrors({a: {a: {}}})).toEqual([]);
        expect(valWithErrors({})).toEqual([]);
        expect(valWithErrors(['a', 'b', 'c'])).toEqual([]);
        expect(valWithErrors([])).toEqual([]);
        expect(valWithErrors([[]])).toEqual([]);
        expect(valWithErrors([[new Date()], 3, 'hello'])).toEqual([]);

        // error inside the recursion (bigint and boolean are not allowed)
        console.log(valWithErrors([new Date(), true]));
        expect(valWithErrors([new Date(), true])).toEqual([{path: [1], expected: 'union'}]);
        expect(valWithErrors([[new Date()], 3, 3n])).toEqual([{path: [0, 2], expected: 'union'}]);

        // wrong root type
        expect(valWithErrors(true)).toEqual([{path: [], expected: 'union'}]);
    });

    it('encode/decode CircularProperty to json', () => {});

    it('json stringify CircularProperty with discriminator', () => {});
});
