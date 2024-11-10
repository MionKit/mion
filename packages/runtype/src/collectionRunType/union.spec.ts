/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {JitFnIDs} from '../constants';
import {jitUtils} from '../jitUtils';
import {runType} from '../runType';

describe('Atomic Union', () => {
    type AtomicUnion = Date | number | string | null | bigint;
    type configOpt = 'UNO' | 'DOS' | 'TRES';

    const a: AtomicUnion = new Date();
    const b: AtomicUnion = 123;
    const c: AtomicUnion = 'hello';
    const d: AtomicUnion = null;
    const e: AtomicUnion = 3n;

    const notA = {};
    const notB = true;
    const notC = [];

    const rt = runType<AtomicUnion>();
    const rtConf = runType<configOpt>();

    it('validate union', () => {
        const validate = rt.createJitFunction(JitFnIDs.isType);

        expect(validate(a)).toBe(true);
        expect(validate(b)).toBe(true);
        expect(validate(c)).toBe(true);
        expect(validate(d)).toBe(true);
        expect(validate(e)).toBe(true);
        expect(validate(notA)).toBe(false);
        expect(validate(notB)).toBe(false);
        expect(validate(notC)).toBe(false);
    });

    it('validate union discriminator string', () => {
        const validate = rtConf.createJitFunction(JitFnIDs.isType);

        expect(validate('UNO')).toBe(true);
        expect(validate('DOS')).toBe(true);
        expect(validate('TRES')).toBe(true);
        expect(validate('INVALID')).toBe(false);
        expect(validate(null)).toBe(false);
        expect(validate(true)).toBe(false);
    });

    it('validate union + errors', () => {
        const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);

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
        const toJson = rt.createJitFunction(JitFnIDs.jsonEncode);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);

        expect(fromJson(JSON.parse(JSON.stringify(toJson(a))))).toEqual(a);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(b))))).toEqual(b);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(c))))).toEqual(c);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(d))))).toEqual(d);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(e))))).toEqual(e);
    });

    it('json stringify with discriminator', () => {
        // this should be serialized as [discriminatorIndex, value]
        const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);

        expect(fromJson(JSON.parse(jsonStringify(a)))).toEqual(a);
        expect(fromJson(JSON.parse(jsonStringify(b)))).toEqual(b);
        expect(fromJson(JSON.parse(jsonStringify(c)))).toEqual(c);
        expect(fromJson(JSON.parse(jsonStringify(d)))).toEqual(d);
        expect(fromJson(JSON.parse(jsonStringify(e)))).toEqual(e);
    });

    it('throw errors when serializing deserializing object not belonging to the union', () => {
        type UT = string | number;
        const rtU = runType<UT>();
        const jsonStringify = rtU.createJitFunction(JitFnIDs.jsonStringify);
        const fromJson = rtU.createJitFunction(JitFnIDs.jsonDecode);
        const toJson = rtU.createJitFunction(JitFnIDs.jsonEncode);
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
        const validate = rt.createJitFunction(JitFnIDs.isType);
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
        const validate = rt.createJitFunction(JitFnIDs.isType);

        expect(validate(arrA)).toBe(true);
        expect(validate(arrB)).toBe(true);
        expect(validate(arrC)).toBe(true);
        expect(validate(arrD)).toBe(true);

        expect(validate(notArr)).toBe(false);
    });

    it('validate union + errors', () => {
        const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);

        expect(valWithErrors(arrA)).toEqual([]);
        expect(valWithErrors(arrB)).toEqual([]);
        expect(valWithErrors(arrC)).toEqual([]);
        expect(valWithErrors(arrD)).toEqual([]);

        expect(valWithErrors(notArr)).toEqual([{path: [], expected: 'union'}]);
    });

    it('encode/decode to json', () => {
        const toJson = rt.createJitFunction(JitFnIDs.jsonEncode);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);

        expect(fromJson(JSON.parse(JSON.stringify(toJson(arrA))))).toEqual(arrA);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(arrB))))).toEqual(arrB);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(arrC))))).toEqual(arrC);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(arrD))))).toEqual(arrD);

        // objects are not the same same object in memory after round trip
        expect(fromJson(JSON.parse(JSON.stringify(toJson(arrA))))).not.toBe(arrA);
    });

    it('json stringify with discriminator', () => {
        // this should be serialized as [discriminatorIndex, value]
        const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);

        const copyA = structuredClone(arrA);
        const copyB = structuredClone(arrB);
        const copyC = structuredClone(arrC);
        const copyD = structuredClone(arrD);
        expect(fromJson(JSON.parse(jsonStringify(copyA)))).toEqual(arrA);
        expect(fromJson(JSON.parse(jsonStringify(copyB)))).toEqual(arrB);
        expect(fromJson(JSON.parse(jsonStringify(copyC)))).toEqual(arrC);
        expect(fromJson(JSON.parse(jsonStringify(copyD)))).toEqual(arrD);
    });

    it('throw errors when serializing deserializing object not belonging to the union', () => {
        const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);
        const toJson = rt.createJitFunction(JitFnIDs.jsonEncode);
        const typeValue = new Date();

        expect(() => jsonStringify(typeValue)).toThrow(
            'Can not stringify union: expected one of <array | array | array> but got Date'
        );
        expect(() => fromJson(123)).toThrow(
            'Can not decode json to union: expected one of <array | array | array> but got Number'
        );
        expect(() => toJson(typeValue)).toThrow(
            'Can not encode json to union: expected one of <array | array | array> but got Date'
        );
    });

    it('mock', () => {
        const mocked = rt.mock();
        expect(Array.isArray(mocked)).toBe(true);
        const validate = rt.createJitFunction(JitFnIDs.isType);
        expect(validate(rt.mock())).toBe(true);
    });
});

describe('Union Obj', () => {
    type UnionObj = {a: string} | {b: number} | {c: bigint};

    const objA: UnionObj = {a: 'hello', b: 123, c: 1n}; // mion does not allow mix of properties in the union
    const objB: UnionObj = {a: 'world'};
    const objC: UnionObj = {c: 1n};
    const notA = {}; // union of object must have at least one of the properties of the union
    const notB = {a: 123}; // properties of the union must be of the correct type

    // disabled as we are not yet checking strictness of the object
    // const notC = {a: 'hello', d: 'extra'}; // extra properties are not allowed in the union

    const rt = runType<UnionObj>();

    it('validate union', () => {
        const validate = rt.createJitFunction(JitFnIDs.isType);

        expect(validate(objA)).toBe(false);
        expect(validate(objB)).toBe(true);
        expect(validate(objC)).toBe(true);

        expect(validate(notA)).toBe(false);
        expect(validate(notB)).toBe(false);
        // expect(validate(notC)).toBe(false);
    });

    it('validate union + errors', () => {
        const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);

        expect(valWithErrors(objA)).toEqual([{path: [], expected: 'union'}]);
        expect(valWithErrors(objB)).toEqual([]);
        expect(valWithErrors(objC)).toEqual([]);

        expect(valWithErrors(notA)).toEqual([{path: [], expected: 'union'}]);
        expect(valWithErrors(notB)).toEqual([{path: [], expected: 'union'}]);
        // expect(valWithErrors(notC)).toEqual([{path: [], expected: 'union'}]);
    });

    it('encode/decode to json', () => {
        const toJson = rt.createJitFunction(JitFnIDs.jsonEncode);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);

        const copyA = structuredClone(objA);
        const copyB = structuredClone(objB);
        const copyC = structuredClone(objC);

        expect(() => toJson(copyA)).toThrow(); // mion throws an error for mixed properties in the union
        expect(fromJson(JSON.parse(JSON.stringify(toJson(copyB))))).toEqual(objB);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(copyC))))).toEqual(objC);
    });

    it('json stringify with discriminator', () => {
        // this should be serialized as [discriminatorIndex, value]
        const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);

        expect(() => jsonStringify(objA)).toThrow(); // mion throws an error for mixed properties in the union
        expect(fromJson(JSON.parse(jsonStringify(objB)))).toEqual(objB);
        expect(fromJson(JSON.parse(jsonStringify(objC)))).toEqual(objC);
    });

    it('throw errors whe serializing deserializing object not belonging to the union', () => {
        const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);
        const toJson = rt.createJitFunction(JitFnIDs.jsonEncode);
        const typeValue = new Date();

        expect(() => jsonStringify(typeValue)).toThrow(
            'Can not stringify union: expected one of <objectLiteral | objectLiteral | objectLiteral> but got Date'
        );
        expect(() => fromJson(123)).toThrow(
            'Can not decode json to union: expected one of <objectLiteral | objectLiteral | objectLiteral> but got Number'
        );
        expect(() => toJson(typeValue)).toThrow(
            'Can not encode json to union: expected one of <objectLiteral | objectLiteral | objectLiteral> but got Date'
        );
    });

    it('mock', () => {
        const mocked = rt.mock();
        expect(typeof mocked === 'object').toBe(true);
        const validate = rt.createJitFunction(JitFnIDs.isType);
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
        const validate = rt.createJitFunction(JitFnIDs.isType);

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
        const validate = rt2.createJitFunction(JitFnIDs.isType);

        expect(validate(mix2A)).toBe(true);
        expect(validate(mix2B)).toBe(true);

        expect(validate(notMix2A)).toBe(false);
        expect(validate(notMix2B)).toBe(false);
    });

    // validation for Unions does not return info about the path as we can't know which type of the union the user was trying to use.
    it('validate union + errors', () => {
        const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);

        expect(valWithErrors(mixA)).toEqual([]);
        expect(valWithErrors(mixB)).toEqual([]);

        expect(valWithErrors(notMixA)).toEqual([{path: [], expected: 'union'}]);
        expect(valWithErrors(notMixB)).toEqual([{path: [], expected: 'union'}]);
        // expect(valWithErrors(notC)).toEqual([{path: [], expected: 'union'}]);
    });

    it('encode/decode to json', () => {
        const toJson = rt.createJitFunction(JitFnIDs.jsonEncode);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);

        const copyA = structuredClone(mixA);
        const copyB = structuredClone(mixB);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(copyA))))).toEqual(mixA);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(copyB))))).toEqual(mixB);
    });

    it('json stringify with discriminator', () => {
        // this should be serialized as [discriminatorIndex, value]
        const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);

        expect(fromJson(JSON.parse(jsonStringify(mixA)))).toEqual(mixA);
        expect(fromJson(JSON.parse(jsonStringify(mixB)))).toEqual(mixB);
    });

    it('throw errors whe serializing deserializing object not belonging to the union', () => {
        const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);
        const toJson = rt.createJitFunction(JitFnIDs.jsonEncode);
        const typeValue = new Date();

        expect(() => jsonStringify(typeValue)).toThrow(
            'Can not stringify union: expected one of <array | array | array | objectLiteral | objectLiteral | objectLiteral> but got Date'
        );
        expect(() => fromJson(123)).toThrow(
            'Can not decode json to union: expected one of <array | array | array | objectLiteral | objectLiteral | objectLiteral> but got Number'
        );
        expect(() => toJson(typeValue)).toThrow(
            'Can not encode json to union: expected one of <array | array | array | objectLiteral | objectLiteral | objectLiteral> but got Date'
        );
    });

    it('mock', () => {
        const mocked = rt.mock();
        expect(typeof mocked === 'object').toBe(true);
        const validate = rt.createJitFunction(JitFnIDs.isType);
        expect(validate(rt.mock())).toBe(true);
    });
});

describe('Union circular', () => {
    type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];

    const d: UnionC = new Date();
    const n: UnionC = 123;
    const s: UnionC = 'hello';
    const o: UnionC = {a: {a: {}}};
    const o1: UnionC = {};
    const a: UnionC = [];
    const a2: UnionC = [[]];
    const x0: UnionC = [123, 3, {b: 'hello'}];
    const x1: UnionC = [123, 3, 'hello'];
    const x2: UnionC = [[123], 3, [3, 'hello']];

    const notA = true;
    const notB = {c: 'hello'}; // note existing properties are not allowed in the union
    const notC = {a: true}; // properties of the union must be of the correct type

    const rt = runType<UnionC>();

    it('validate Circular Union', () => {
        const validate = rt.createJitFunction(JitFnIDs.isType);

        expect(validate(d)).toBe(true);
        expect(validate(n)).toBe(true);
        expect(validate(s)).toBe(true);
        expect(validate(o)).toBe(true);
        expect(validate(o1)).toBe(true);
        expect(validate(a)).toBe(true);
        expect(validate(a2)).toBe(true);
        expect(validate(x0)).toBe(true);
        expect(validate(x1)).toBe(true);
        expect(validate(x2)).toBe(true);

        expect(validate(notA)).toBe(false);
        expect(validate(notB)).toBe(false);
        expect(validate(notC)).toBe(false);
    });

    it('validate Circular Union + errors', () => {
        const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);

        expect(valWithErrors(d)).toEqual([]);
        expect(valWithErrors(n)).toEqual([]);
        expect(valWithErrors(s)).toEqual([]);
        expect(valWithErrors(o)).toEqual([]);
        expect(valWithErrors(o1)).toEqual([]);
        expect(valWithErrors(a)).toEqual([]);
        expect(valWithErrors(a2)).toEqual([]);
        expect(valWithErrors(x0)).toEqual([]);
        expect(valWithErrors(x1)).toEqual([]);
        expect(valWithErrors(x2)).toEqual([]);

        // union errors return empty path always, as we can't know which type of the union the user was trying to use.
        expect(valWithErrors(notA)).toEqual([{path: [], expected: 'union'}]);
        expect(valWithErrors(notB)).toEqual([{path: [], expected: 'union'}]);
        expect(valWithErrors(notC)).toEqual([{path: [], expected: 'union'}]);
    });

    it('encode/decode Circular Union to json', () => {
        const toJson = rt.createJitFunction(JitFnIDs.jsonEncode);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);

        expect(fromJson(JSON.parse(JSON.stringify(toJson(d))))).toEqual(d);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(n))))).toEqual(n);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(s))))).toEqual(s);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(structuredClone(o)))))).toEqual(o);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(structuredClone(o1)))))).toEqual(o1);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(structuredClone(a)))))).toEqual(a);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(structuredClone(a2)))))).toEqual(a2);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(structuredClone(x0)))))).toEqual(x0);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(structuredClone(x1)))))).toEqual(x1);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(structuredClone(x2)))))).toEqual(x2);
    });

    it('json stringify Circular Union with discriminator', () => {
        // this should be serialized as [discriminatorIndex, value]
        const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);

        expect(fromJson(JSON.parse(jsonStringify(d)))).toEqual(d);
        expect(fromJson(JSON.parse(jsonStringify(n)))).toEqual(n);
        expect(fromJson(JSON.parse(jsonStringify(s)))).toEqual(s);
        expect(fromJson(JSON.parse(jsonStringify(structuredClone(o))))).toEqual(o);
        expect(fromJson(JSON.parse(jsonStringify(structuredClone(o1))))).toEqual(o1);
        expect(fromJson(JSON.parse(jsonStringify(structuredClone(a))))).toEqual(a);
        expect(fromJson(JSON.parse(jsonStringify(structuredClone(a2))))).toEqual(a2);
        expect(fromJson(JSON.parse(jsonStringify(structuredClone(x0))))).toEqual(x0);
        expect(fromJson(JSON.parse(jsonStringify(structuredClone(x1))))).toEqual(x1);
        expect(fromJson(JSON.parse(jsonStringify(structuredClone(x2))))).toEqual(x2);
    });
});
