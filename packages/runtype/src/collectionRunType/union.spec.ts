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
import {jitUtils} from '../jitUtils';

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

        expect(fromJson(JSON.parse(JSON.stringify(toJson(a))))).toEqual(a);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(b))))).toEqual(b);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(c))))).toEqual(c);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(d))))).toEqual(d);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(e))))).toEqual(e);

        // objects are not the same same object in memory after round trip
        expect(fromJson(JSON.parse(JSON.stringify(toJson(a))))).not.toBe(a);
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

        expect(fromJson(JSON.parse(JSON.stringify(toJson(arrA))))).toEqual(arrA);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(arrB))))).toEqual(arrB);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(arrC))))).toEqual(arrC);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(arrD))))).toEqual(arrD);

        // objects are not the same same object in memory after round trip
        expect(fromJson(JSON.parse(JSON.stringify(toJson(arrA))))).not.toBe(arrA);
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
    type UnionObj = {a: string} | {b: number} | {c: bigint};

    // mion does not allow mix of properties in the union
    const objA: UnionObj = {a: 'hello', b: 123, c: 1n};
    const objB: UnionObj = {a: 'world'};
    const objC: UnionObj = {c: 1n};
    const notA = {}; // union of object must have at least one of the properties of the union
    const notB = {a: 123}; // properties of the union must be of the correct type

    // disabled as we are not yet checking strictness of the object
    // const notC = {a: 'hello', d: 'extra'}; // extra properties are not allowed in the union

    const rt = runType<UnionObj>();

    it('validate union', () => {
        const validate = buildIsTypeJITFn(rt).fn;

        expect(validate(objA)).toBe(false);
        expect(validate(objB)).toBe(true);
        expect(validate(objC)).toBe(true);

        expect(validate(notA)).toBe(false);
        expect(validate(notB)).toBe(false);
        // expect(validate(notC)).toBe(false);
    });

    it('validate union + errors', () => {
        const valWithErrors = buildTypeErrorsJITFn(rt).fn;

        expect(valWithErrors(objA)).toEqual([{path: [], expected: 'union'}]);
        expect(valWithErrors(objB)).toEqual([]);
        expect(valWithErrors(objC)).toEqual([]);

        expect(valWithErrors(notA)).toEqual([{path: [], expected: 'union'}]);
        expect(valWithErrors(notB)).toEqual([{path: [], expected: 'union'}]);
        // expect(valWithErrors(notC)).toEqual([{path: [], expected: 'union'}]);
    });

    it('encode/decode to json', () => {
        const toJson = buildJsonEncodeJITFn(rt).fn;
        const fromJson = buildJsonDecodeJITFn(rt).fn;

        expect(fromJson(JSON.parse(JSON.stringify(toJson(objA))))).toEqual(objA);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(objB))))).toEqual(objB);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(objC))))).toEqual(objC);

        // objects are not the same same object in memory after round trip
        expect(fromJson(JSON.parse(JSON.stringify(toJson(objA))))).not.toBe(objA);
    });

    it('json stringify with discriminator', () => {
        // this should be serialized as [discriminatorIndex, value]
        const jsonStringify = buildJsonStringifyJITFn(rt).fn;
        const fromJson = buildJsonDecodeJITFn(rt).fn;

        console.log(jsonStringify(objA));

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
    /**
     * Union of mixed types
     * Mion's run time union validation is slightly different from typescript union algorithm.
     * typescript allows for mixing of properties of objects in the union, mion does not.
     * Look mixD object bellow, it has mixed properties of the objects in the union, typescript allows this but mion validation fails.
     */
    class D {
        public d: Date = new Date();
    }
    type UnionMix = string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'};
    type UnMix2 = {a: boolean} | {a: number};

    const mixA: UnionMix = ['a', 'b', 'c'];
    const mixB: UnionMix = {a: 'hello', aa: true};
    // TODO: class disabled until we decide how to handle serialization of classes
    // const mixC: UnionMix = {d: new Date()}; // although is not a class instance, it has the same properties so is true
    const mixD: UnionMix = {b: 123, c: 123n}; // typescript allow mixed properties of objects, but mion runType validation does not
    const notMixA = [1, 'b'];
    const notMixB = {};
    const notMixC = {a: 'hello', aa: true, j: 'extra'}; // union uses strict assertion that checks for extra properties
    const notMixD = {a: 'hello', d: 'world'}; // expect aa property

    const mix2A: UnMix2 = {a: true};
    const mix2B: UnMix2 = {a: 123};
    const notMix2A = {a: 'hello'};
    const notMix2B = {};

    const rt = runType<UnionMix>();
    const rt2 = runType<UnMix2>();

    it('validate union', () => {
        const validate = buildIsTypeJITFn(rt).fn;

        expect(validate(mixA)).toBe(true);
        expect(validate(mixB)).toBe(true);
        // TODO: class disabled until we decide how to handle serialization of classes
        // expect(validate(mixC)).toBe(true);

        expect(validate(mixD)).toBe(false); // mion does not allow mixed properties in objects

        expect(validate(notMixA)).toBe(false);
        expect(validate(notMixB)).toBe(false);
        expect(validate(notMixD)).toBe(false);

        expect(validate(notMixC)).toBe(false); // union type does check for extra properties so object with extra properties are not valid
    });

    // for UnMix2 the 'a' property is merged into a single union prop, so 'a' accepts both boolean and number
    it('validate union with merged properties', () => {
        const validate = buildIsTypeJITFn(rt2).fn;

        expect(validate(mix2A)).toBe(true);
        expect(validate(mix2B)).toBe(true);

        expect(validate(notMix2A)).toBe(false);
        expect(validate(notMix2B)).toBe(false);
    });

    // validation for Unions does not return info about the path as we can't know which type of the union the user was trying to use.
    it('validate union + errors', () => {
        const valWithErrors = buildTypeErrorsJITFn(rt).fn;

        expect(valWithErrors(mixA)).toEqual([]);
        expect(valWithErrors(mixB)).toEqual([]);

        expect(valWithErrors(notMixA)).toEqual([{path: [], expected: 'union'}]);
        expect(valWithErrors(notMixB)).toEqual([{path: [], expected: 'union'}]);
        // expect(valWithErrors(notC)).toEqual([{path: [], expected: 'union'}]);
    });

    it('encode/decode to json', () => {
        const toJson = buildJsonEncodeJITFn(rt).fn;
        const fromJson = buildJsonDecodeJITFn(rt).fn;

        console.log(toJson(mixB));
        console.log(fromJson(JSON.parse(JSON.stringify(toJson(mixB)))));
        fromJson(JSON.parse(JSON.stringify(toJson(mixB))));
        expect(fromJson(JSON.parse(JSON.stringify(toJson(mixA))))).toEqual(mixA);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(mixB))))).toEqual(mixB);
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
