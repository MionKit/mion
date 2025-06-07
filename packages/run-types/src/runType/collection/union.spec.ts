/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {UnionRunType} from '@mionkit/run-types/src/runType/collection/union';
import {JitFunctions} from '../../constants';
import {BaseRunType} from '../../lib/baseRunTypes';
import {runType} from '../../lib/runType';
import {jitUtils} from '@mionkit/core/src/jitUtils';

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
        const validate = rt.createJitFunction(JitFunctions.isType);

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
        const validate = rtConf.createJitFunction(JitFunctions.isType);

        expect(validate('UNO')).toBe(true);
        expect(validate('DOS')).toBe(true);
        expect(validate('TRES')).toBe(true);
        expect(validate('INVALID')).toBe(false);
        expect(validate(null)).toBe(false);
        expect(validate(true)).toBe(false);
    });

    it('validate union + errors', () => {
        const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);

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
        const toJsonVal = rt.createJitFunction(JitFunctions.toJsonVal);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);

        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(a))))).toEqual(a);
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(b))))).toEqual(b);
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(c))))).toEqual(c);
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(d))))).toEqual(d);
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(e))))).toEqual(e);
    });

    it('json stringify', () => {
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);

        expect(fromJsonVal(JSON.parse(jsonStringify(a)))).toEqual(a);
        expect(fromJsonVal(JSON.parse(jsonStringify(b)))).toEqual(b);
        expect(fromJsonVal(JSON.parse(jsonStringify(c)))).toEqual(c);
        expect(fromJsonVal(JSON.parse(jsonStringify(d)))).toEqual(d);
        expect(fromJsonVal(JSON.parse(jsonStringify(e)))).toEqual(e);
    });

    it('throw errors when serializing deserializing object not belonging to the union', () => {
        type UT = string | number;
        const rtU = runType<UT>();
        const jsonStringify = rtU.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rtU.createJitFunction(JitFunctions.fromJsonVal);
        const toJsonVal = rtU.createJitFunction(JitFunctions.toJsonVal);
        const wrongUnionItem = [0, true];

        expect(() => jsonStringify(wrongUnionItem)).toThrow('Can not JsonStringify union: expected one of <string | number>');
        expect(() => fromJsonVal(123)).toThrow('Can not decode union from json: expected format [index, value]');
        expect(() => toJsonVal(wrongUnionItem)).toThrow('Can not encode json to union: expected one of <string | number>');
    });

    it('mock', async () => {
        const mocked = await rt.mock();
        expect(
            typeof mocked === 'string' ||
                typeof mocked === 'number' ||
                typeof mocked === 'bigint' ||
                mocked instanceof Date ||
                mocked === null
        ).toBe(true);
        const validate = rt.createJitFunction(JitFunctions.isType);
        expect(validate(mocked)).toBe(true);
    });

    it('json encode/decode should never be marked as noop as encoding/decoding is always required', () => {
        type atomicNoEncRequired = number | string;
        type atomicEncRequired = bigint | Date;

        const rtNoop = runType<atomicNoEncRequired>() as BaseRunType;
        const rtEncRequired = runType<atomicEncRequired>() as BaseRunType;
        expect(rtNoop.createJitCompiledFunction(JitFunctions.toJsonVal.id).isNoop).toBe(false);
        expect(rtNoop.createJitCompiledFunction(JitFunctions.fromJsonVal.id).isNoop).toBe(false);
        expect(rtEncRequired.createJitCompiledFunction(JitFunctions.toJsonVal.id).isNoop).toBe(false);
        expect(rtEncRequired.createJitCompiledFunction(JitFunctions.fromJsonVal.id).isNoop).toBe(false);
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
        const validate = rt.createJitFunction(JitFunctions.isType);

        expect(validate(arrA)).toBe(true);
        expect(validate(arrB)).toBe(true);
        expect(validate(arrC)).toBe(true);
        expect(validate(arrD)).toBe(true);

        expect(validate(notArr)).toBe(false);
    });

    it('validate union + errors', () => {
        const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);

        expect(valWithErrors(arrA)).toEqual([]);
        expect(valWithErrors(arrB)).toEqual([]);
        expect(valWithErrors(arrC)).toEqual([]);
        expect(valWithErrors(arrD)).toEqual([]);

        expect(valWithErrors(notArr)).toEqual([{path: [], expected: 'union'}]);
    });

    it('encode/decode to json', () => {
        const toJsonVal = rt.createJitFunction(JitFunctions.toJsonVal);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);

        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(arrA))))).toEqual(arrA);
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(arrB))))).toEqual(arrB);
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(arrC))))).toEqual(arrC);
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(arrD))))).toEqual(arrD);

        // objects are not the same same object in memory after round trip
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(arrA))))).not.toBe(arrA);
    });

    it('json stringify with discriminator', () => {
        // this should be serialized as [discriminatorIndex, value]
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);

        const copyA = structuredClone(arrA);
        const copyB = structuredClone(arrB);
        const copyC = structuredClone(arrC);
        const copyD = structuredClone(arrD);
        expect(fromJsonVal(JSON.parse(jsonStringify(copyA)))).toEqual(arrA);
        expect(fromJsonVal(JSON.parse(jsonStringify(copyB)))).toEqual(arrB);
        expect(fromJsonVal(JSON.parse(jsonStringify(copyC)))).toEqual(arrC);
        expect(fromJsonVal(JSON.parse(jsonStringify(copyD)))).toEqual(arrD);
    });

    it('throw errors when serializing deserializing object not belonging to the union', () => {
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const toJsonVal = rt.createJitFunction(JitFunctions.toJsonVal);
        const typeValue = new Date();

        expect(() => jsonStringify(typeValue)).toThrow('Can not JsonStringify union: expected one of <array | array | array>');
        expect(() => fromJsonVal(123)).toThrow('Can not decode union from json: expected format [index, value]');
        expect(() => toJsonVal(typeValue)).toThrow('Can not encode json to union: expected one of <array | array | array>');
    });

    it('mock', async () => {
        const mocked = await rt.mock();
        expect(Array.isArray(mocked)).toBe(true);
        const validate = rt.createJitFunction(JitFunctions.isType);
        expect(validate(mocked)).toBe(true);
    });
});

describe('Union Obj', () => {
    type UnionObj = {a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string};

    const objA: UnionObj = {a: 'hello', b: 123, c: 1n}; // unlike typescript we don't allow mix of properties in the union
    const objB: UnionObj = {a: 'world', aa: true};
    const objC: UnionObj = {c: 1n};
    const objD: UnionObj = {d: 'hello'};
    const objE: UnionObj = {};
    const notA = {a: 'hello'}; // missing aa property
    const notB = {b: 'hello'}; // properties of the union must be of the correct type
    const notC = {a: 'hello', d: 'extra'}; // extra properties are not allowed in the union
    const notD = {d: 123}; // properties of the union must be of the correct type

    const rt = runType<UnionObj>();

    it('validate union', () => {
        const validate = rt.createJitFunction(JitFunctions.isType);

        expect(validate(objA)).toBe(false); // mix of properties is not allowed in the union
        expect(validate(objB)).toBe(true);
        expect(validate(objC)).toBe(true);
        expect(validate(objD)).toBe(true);
        expect(validate(objE)).toBe(true);

        expect(validate(notA)).toBe(false);
        expect(validate(notB)).toBe(false);
        expect(validate(notC)).toBe(false);
        expect(validate(notD)).toBe(false);
        expect(validate([])).toBe(false);
    });

    it('validate an union with index property', () => {
        type UnionObj = {a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint};

        const rt = runType<UnionObj>();
        const validate = rt.createJitFunction(JitFunctions.isType);

        const obj1: UnionObj = {a: 'hello', aa: true};
        const obj2: UnionObj = {b: 123};
        const obj3: UnionObj = {c: 1n, d: 2n};

        expect(validate(obj1)).toBe(true);
        expect(validate(obj2)).toBe(true);
        expect(validate(obj3)).toBe(true);

        const not1 = {a: 'hello'}; // missing aa property
        const not2 = {b: 'hello'}; // properties of the union must be of the correct type
        const not3 = {a: 'hello', d: 'extra'}; // extra properties are not allowed in the union
        const not4 = {c: 1n, d: 'hello'}; // properties of the union must be of the correct type

        expect(validate(not1)).toBe(false);
        expect(validate(not2)).toBe(false);
        expect(validate(not3)).toBe(false);
        expect(validate(not4)).toBe(false);
    });

    it('validate union + errors', () => {
        const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);

        expect(valWithErrors(objA)).toEqual([{path: [], expected: 'union'}]); // mix of properties is not allowed in the union
        expect(valWithErrors(objB)).toEqual([]);
        expect(valWithErrors(objC)).toEqual([]);
        expect(valWithErrors(objD)).toEqual([]);
        expect(valWithErrors(objE)).toEqual([]);

        expect(valWithErrors(notA)).toEqual([{path: [], expected: 'union'}]);
        expect(valWithErrors(notB)).toEqual([{path: [], expected: 'union'}]);
        expect(valWithErrors(notC)).toEqual([{path: [], expected: 'union'}]);
        expect(valWithErrors(notD)).toEqual([{path: [], expected: 'union'}]);
    });

    it('encode/decode to json', () => {
        const toJsonVal = rt.createJitFunction(JitFunctions.toJsonVal);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);

        const copyA = structuredClone(objA);
        const copyB = structuredClone(objB);
        const copyC = structuredClone(objC);

        expect(() => toJsonVal(copyA)).toThrow(
            'Can not encode json to union: expected one of <object | object | object | object>'
        );
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(copyB))))).toEqual(objB);
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(copyC))))).toEqual(objC);
    });

    it('json stringify with discriminator', () => {
        // this should be serialized as [discriminatorIndex, value]
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);

        expect(() => jsonStringify(objA)).toThrow(); // mion throws an error for mixed properties in the union
        expect(fromJsonVal(JSON.parse(jsonStringify(objB)))).toEqual(objB);
        expect(fromJsonVal(JSON.parse(jsonStringify(objC)))).toEqual(objC);
    });

    it('throw errors whe serializing deserializing object not belonging to the union', () => {
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const toJsonVal = rt.createJitFunction(JitFunctions.toJsonVal);
        const typeValue = new Date();

        expect(() => jsonStringify(typeValue)).toThrow(
            'Can not JsonStringify union: expected one of <object | object | object | object>'
        );
        expect(() => fromJsonVal(123)).toThrow('Can not decode union from json: expected format [index, value]');
        expect(() => toJsonVal(typeValue)).toThrow(
            'Can not encode json to union: expected one of <object | object | object | object>'
        );
    });

    it('mock', async () => {
        const mocked = await rt.mock();
        expect(typeof mocked === 'object').toBe(true);
        const validate = rt.createJitFunction(JitFunctions.isType);
        expect(validate(mocked)).toBe(true);
    });
});

describe('Union with discriminator property', () => {
    // type is a discriminator property because it is present in all the types of the union and has different types
    // be sure discriminator is not declared as the first property so we test behavior correctly
    type UnionDisc =
        | {otherProp: boolean; type: 'a'}
        | {otherProp: number; type: 'b'}
        | {otherProp: string; type: 'c'; time: Date}
        | {type: boolean; otherProp: string};

    const objA: UnionDisc = {type: 'a', otherProp: true};
    const objB: UnionDisc = {type: 'b', otherProp: 123};
    const objC: UnionDisc = {type: 'c', otherProp: 'hello', time: new Date()};
    const objD: UnionDisc = {type: true, otherProp: 'typeD'};
    const notA = {type: 'a', otherProp: 'hello'};
    const notB = {type: 'b', otherProp: true};
    const notC = {type: 'c', otherProp: 'hello', time: 'world'};
    const notD = {type: true, otherProp: 123};
    const notKnown = {type: 'a', hello: 'world'};

    const rt = runType<UnionDisc>() as UnionRunType;

    it('validate union', () => {
        const validate = rt.createJitFunction(JitFunctions.isType);
        const fnCode = validate.toString();

        // ensure discriminator property is checked first for early return
        expect(fnCode).toContain('(v.type === "a" &&');
        expect(fnCode).toContain('(v.type === "b" &&');
        expect(fnCode).toContain('(v.type === "c" &&');
        expect(fnCode).toContain(`(typeof v.type === 'boolean' &&`);

        expect(validate(objA)).toBe(true);
        expect(validate(objB)).toBe(true);
        expect(validate(objC)).toBe(true);
        expect(validate(objD)).toBe(true);

        expect(validate(notA)).toBe(false);
        expect(validate(notB)).toBe(false);
        expect(validate(notC)).toBe(false);
        expect(validate(notD)).toBe(false);
        expect(validate(notKnown)).toBe(false);
    });

    it('validate union same prop with different types', () => {
        type UnionSameProp = {type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string};

        const rt = runType<UnionSameProp>();
        const validate = rt.createJitFunction(JitFunctions.isType);

        expect(validate({type: 'a', prop: true})).toBe(true);
        expect(validate({type: 'b', prop: 123})).toBe(true);
        expect(validate({type: 'c', prop: 'hello'})).toBe(true);

        expect(validate({type: 'a', prop: 123})).toBe(false);
        expect(validate({type: 'b', prop: 'hello'})).toBe(false);
        expect(validate({type: 'c', prop: true})).toBe(false);
    });

    it('should use the discriminator that have less complexity', () => {
        type UnionDisc2 =
            | {obj: {a: string}; type: 'a'; prop: boolean}
            | {obj: {a: number}; type: 'b'; prop: number}
            | {obj: {a: boolean}; type: 'c'; prop: string}
            | {obj: {a: null}; type: boolean; prop: string};

        const rt = runType<UnionDisc2>();
        const validate = rt.createJitFunction(JitFunctions.isType);
        const fnCode = validate.toString();

        expect(fnCode).toContain('(v.type === "a" &&');
        expect(fnCode).toContain('(v.type === "b" &&');
        expect(fnCode).toContain('(v.type === "c" &&');
        expect(fnCode).toContain(`(typeof v.type === 'boolean' &&`);

        const obj1: UnionDisc2 = {type: 'a', obj: {a: 'hello'}, prop: true};
        const obj2: UnionDisc2 = {type: 'b', obj: {a: 123}, prop: 123};
        const obj3: UnionDisc2 = {type: 'c', obj: {a: true}, prop: 'hello'};
        const obj4: UnionDisc2 = {type: true, obj: {a: null}, prop: 'hello'};

        expect(validate(obj1)).toBe(true);
        expect(validate(obj2)).toBe(true);
        expect(validate(obj3)).toBe(true);
        expect(validate(obj4)).toBe(true);

        const not1 = {type: 'a', obj: {a: 123}, prop: true};
        const not2 = {type: 'b', obj: {a: 'hello'}, prop: 123};
        const not3 = {type: 'c', obj: {a: 123}, prop: 'hello'};

        expect(validate(not1)).toBe(false);
        expect(validate(not2)).toBe(false);
        expect(validate(not3)).toBe(false);
    });

    it('validate union + errors', () => {
        const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);

        expect(valWithErrors(objA)).toEqual([]);
        expect(valWithErrors(objB)).toEqual([]);
        expect(valWithErrors(objC)).toEqual([]);
        expect(valWithErrors(objD)).toEqual([]);

        expect(valWithErrors(notA)).toEqual([{path: [], expected: 'union'}]);
        expect(valWithErrors(notB)).toEqual([{path: [], expected: 'union'}]);
        expect(valWithErrors(notC)).toEqual([{path: [], expected: 'union'}]);
        expect(valWithErrors(notD)).toEqual([{path: [], expected: 'union'}]);
        expect(valWithErrors(notKnown)).toEqual([{path: [], expected: 'union'}]);
    });

    it('encode/decode to json', () => {
        const toJsonVal = rt.createJitFunction(JitFunctions.toJsonVal);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);

        const copyA = structuredClone(objA);
        const copyB = structuredClone(objB);
        // cant use structuredClone for dates: https://stackoverflow.com/questions/76664834/structuredclone-not-keeping-date-type
        const copyC = {...objC, time: new Date(objC.time.getTime())};
        const copyD = structuredClone(objD);

        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(copyA))))).toEqual(objA);
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(copyB))))).toEqual(objB);
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(copyC))))).toEqual(objC);
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(copyD))))).toEqual(objD);
    });

    it('json stringify with discriminator', () => {
        // this should be serialized as [discriminatorIndex, value]
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);

        const copyA = structuredClone(objA);
        const copyB = structuredClone(objB);
        // cant use structuredClone for dates: https://stackoverflow.com/questions/76664834/structuredclone-not-keeping-date-type
        const copyC = {...objC, time: new Date(objC.time.getTime())};
        const copyD = structuredClone(objD);

        expect(fromJsonVal(JSON.parse(jsonStringify(copyA)))).toEqual(objA);
        expect(fromJsonVal(JSON.parse(jsonStringify(copyB)))).toEqual(objB);
        expect(fromJsonVal(JSON.parse(jsonStringify(copyC)))).toEqual(objC);
        expect(fromJsonVal(JSON.parse(jsonStringify(copyD)))).toEqual(objD);
    });
});

describe('Union Mixed', () => {
    class D {
        public d: Date = new Date();
    }
    type UnionMix = string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'};
    type UnMix2 = {a: boolean} | {a: number};
    type UnMixD = UnionMix | D; // ensures unions get flattened

    const mixA: UnionMix = ['a', 'b', 'c'];
    const mixB: UnionMix = {a: 'hello', aa: true};
    const mixC: UnionMix = {b: 123, c: 123n}; // typescript allow mixed properties of objects, but we don't
    const mixD: UnMixD = {d: new Date()}; // although is not a class instance, it has the same properties so is true
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
    const rtD = runType<UnMixD>();

    it('validate union', () => {
        const validate = rtD.createJitFunction(JitFunctions.isType);

        expect(validate(mixA)).toBe(true);
        expect(validate(mixB)).toBe(true);
        expect(validate(mixC)).toBe(false); // we don't allow mixed properties in the union
        expect(validate(mixD)).toBe(true);

        expect(validate(notMixA)).toBe(false);
        expect(validate(notMixB)).toBe(false);
        expect(validate(notMixD)).toBe(false);

        expect(validate(notMixC)).toBe(false); // union type does check for extra properties so object with extra properties are not valid
    });

    // for UnMix2 the 'a' property is merged into a single union prop, so 'a' accepts both boolean and number
    it('validate union with merged properties', () => {
        const validate = rt2.createJitFunction(JitFunctions.isType);

        expect(validate(mix2A)).toBe(true);
        expect(validate(mix2B)).toBe(true);

        expect(validate(notMix2A)).toBe(false);
        expect(validate(notMix2B)).toBe(false);
    });

    // validation for Unions does not return info about the path as we can't know which type of the union the user was trying to use.
    it('validate union + errors', () => {
        const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);

        expect(valWithErrors(mixA)).toEqual([]);
        expect(valWithErrors(mixB)).toEqual([]);

        expect(valWithErrors(notMixA)).toEqual([{path: [], expected: 'union'}]);
        expect(valWithErrors(notMixB)).toEqual([{path: [], expected: 'union'}]);
        expect(valWithErrors(notMixC)).toEqual([{path: [], expected: 'union'}]);
    });

    it('encode/decode to json', () => {
        const toJsonVal = rt.createJitFunction(JitFunctions.toJsonVal);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);

        const copyA = structuredClone(mixA);
        const copyB = structuredClone(mixB);

        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(copyA))))).toEqual(mixA);
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(copyB))))).toEqual(mixB);
    });

    it('json stringify with discriminator', () => {
        // this should be serialized as [discriminatorIndex, value]
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);

        expect(fromJsonVal(JSON.parse(jsonStringify(mixA)))).toEqual(mixA);
        expect(fromJsonVal(JSON.parse(jsonStringify(mixB)))).toEqual(mixB);
    });

    it('throw errors whe serializing deserializing object not belonging to the union', () => {
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
        const toJsonVal = rt.createJitFunction(JitFunctions.toJsonVal);
        const typeValue = new Date();

        expect(() => jsonStringify(typeValue)).toThrow(
            'Can not JsonStringify union: expected one of <array | array | array | object | object | object>'
        );
        expect(() => fromJsonVal(123)).toThrow('Can not decode union from json: expected format [index, value]');
        expect(() => toJsonVal(typeValue)).toThrow(
            'Can not encode json to union: expected one of <array | array | array | object | object | object>'
        );
    });

    it('mock', async () => {
        const mocked = await rt.mock();
        expect(typeof mocked === 'object').toBe(true);
        const validate = rt.createJitFunction(JitFunctions.isType);
        expect(validate(mocked)).toBe(true);
    });
});

describe('Union circular', () => {
    type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
    const date = new Date();

    function mockData() {
        const d: UnionC = new Date(date.getTime());
        const n: UnionC = 123;
        const s: UnionC = 'hello';
        const recA: UnionC = {a: {a: {}}};
        const o1: UnionC = {};
        const a: UnionC = [];
        const a2: UnionC = [[]];
        const arrRec0: UnionC = [123, 3, {b: 'hello'}];
        const arrRec1: UnionC = [123, 3, 'hello'];
        const arrRec2: UnionC = [[123], 3, [3, 'hello']];

        const notA = true;
        const notB = {c: 'hello'}; // note existing properties are not allowed in the union
        const notC = {a: true}; // properties of the union must be of the correct type
        return {d, n, s, recA, o1, a, a2, arrRec0, arrRec1, arrRec2, notA, notB, notC};
    }
    const {d, n, s, recA, o1, a, a2, arrRec0, arrRec1, arrRec2, notA, notB, notC} = mockData();

    const rt = runType<UnionC>();

    it('validate Circular Union', () => {
        const validate = rt.createJitFunction(JitFunctions.isType);

        expect(validate(d)).toBe(true);
        expect(validate(n)).toBe(true);
        expect(validate(s)).toBe(true);
        expect(validate(recA)).toBe(true);
        expect(validate(o1)).toBe(true);
        expect(validate(a)).toBe(true);
        expect(validate(a2)).toBe(true);
        expect(validate(arrRec0)).toBe(true);
        expect(validate(arrRec1)).toBe(true);
        expect(validate(arrRec2)).toBe(true);

        expect(validate(notA)).toBe(false);
        expect(validate(notB)).toBe(false);
        expect(validate(notC)).toBe(false);
    });

    it('validate Circular Union + errors', () => {
        const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);

        expect(valWithErrors(d)).toEqual([]);
        expect(valWithErrors(n)).toEqual([]);
        expect(valWithErrors(s)).toEqual([]);
        expect(valWithErrors(recA)).toEqual([]);
        expect(valWithErrors(o1)).toEqual([]);
        expect(valWithErrors(a)).toEqual([]);
        expect(valWithErrors(a2)).toEqual([]);
        expect(valWithErrors(arrRec0)).toEqual([]);
        expect(valWithErrors(arrRec1)).toEqual([]);
        expect(valWithErrors(arrRec2)).toEqual([]);

        // union errors return empty path always, as we can't know which type of the union the user was trying to use.
        expect(valWithErrors(notA)).toEqual([{path: [], expected: 'union'}]);
        expect(valWithErrors(notB)).toEqual([{path: [], expected: 'union'}]);
        expect(valWithErrors(notC)).toEqual([{path: [], expected: 'union'}]);
    });

    it('encode/decode Circular Union to json', () => {
        const toJsonVal = rt.createJitFunction(JitFunctions.toJsonVal);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);

        const copy = mockData();

        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(copy.d))))).toEqual(d);
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(copy.n))))).toEqual(n);
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(copy.s))))).toEqual(s);
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(copy.recA))))).toEqual(recA);
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(copy.o1))))).toEqual(o1);
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(copy.a))))).toEqual(a);
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(copy.a2))))).toEqual(a2);
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(copy.arrRec0))))).toEqual(arrRec0);
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(copy.arrRec1))))).toEqual(arrRec1);
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(copy.arrRec2))))).toEqual(arrRec2);
    });

    it('json stringify Circular Union with discriminator', () => {
        // this should be serialized as [discriminatorIndex, value]
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);

        const copy = mockData();

        expect(fromJsonVal(JSON.parse(jsonStringify(copy.d)))).toEqual(d);
        expect(fromJsonVal(JSON.parse(jsonStringify(copy.n)))).toEqual(n);
        expect(fromJsonVal(JSON.parse(jsonStringify(copy.s)))).toEqual(s);
        expect(fromJsonVal(JSON.parse(jsonStringify(copy.recA)))).toEqual(recA);
        expect(fromJsonVal(JSON.parse(jsonStringify(copy.o1)))).toEqual(o1);
        expect(fromJsonVal(JSON.parse(jsonStringify(copy.a)))).toEqual(a);
        expect(fromJsonVal(JSON.parse(jsonStringify(copy.a2)))).toEqual(a2);
        expect(fromJsonVal(JSON.parse(jsonStringify(copy.arrRec0)))).toEqual(arrRec0);
        expect(fromJsonVal(JSON.parse(jsonStringify(copy.arrRec1)))).toEqual(arrRec1);
        expect(fromJsonVal(JSON.parse(jsonStringify(copy.arrRec2)))).toEqual(arrRec2);
    });
});
