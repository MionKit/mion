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

interface Circular {
    n: number;
    s: string;
    c?: Circular;
    d?: Date;
}

class CircularClass {
    n?: number;
    s?: string;
    c?: CircularClass;
}

class CircularClassConstructor {
    n?: number;
    s?: string;
    constructor(public c?: CircularClassConstructor) {}
}

interface CircularTuple {
    tuple: [number, CircularTuple];
}

interface CircularUnion {
    union: number | CircularUnion;
}

interface CircularIndex {
    index: {[key: string]: CircularIndex};
}

interface CircularDeep {
    deep: {deep: {deep: {deep: {deep: {deep: {deep: {deep: {deep: {deep: CircularDeep}}}}}}}}};
}

interface CircularArray {
    array: CircularArray[];
}

interface CircularArrayUnion {
    array: (CircularArrayUnion | number)[];
}

interface CircularDeepUnion {
    deep: {deep: {deep: {deep: {deep: {deep: {deep: {or: string | CircularDeepUnion}}}}}}};
}

interface ContainsCircular {
    a: string;
    b: number;
    c: CircularDeep; // is circular and should be
}

const rtCircular = runType<Circular>();

// it('is circular should be set only for property types or where the circular reference is created, not in the parents', () => {
//     // todo: implement
//     // always fail until implemented
//     throw new Error('circular only in properties still Not implemented');
// });

it('should validate objects with circular references', () => {
    const validate = buildIsTypeJITFn(rtCircular).fn;
    const c1: Circular = {n: 1, s: 'hello'};
    const c2: Circular = {n: 2, s: 'world'};
    const c3: Circular = {n: 3, s: 'foo'};
    c1.c = c2; // circular type but non circular reference
    c3.c = c3; // circular type and circular reference
    console.log(validate.toString());
    expect(validate(c1)).toBe(true);
    expect(validate(c2)).toBe(true);
    expect(validate(c3)).toBe(true);
});

it('should validate object + errors with circular references', () => {
    const valWithErrors = buildTypeErrorsJITFn(rtCircular).fn;
    const c1: Circular = {n: 1, s: 'hello'};
    const c2: Circular = {n: 2, s: 'world'};
    const c3: Circular = {n: 3, s: 'foo'};
    c1.c = c2; // non circular
    c3.c = c3; // circular
    console.log(valWithErrors.toString());
    expect(valWithErrors(c1)).toEqual([]);
    expect(valWithErrors(c2)).toEqual([]);
    expect(valWithErrors(c3)).toEqual([]);
});

it('should encode/decode objects with circular references', () => {
    const toJson = buildJsonEncodeJITFn(rtCircular).fn;
    const fromJson = buildJsonDecodeJITFn(rtCircular).fn;
    const c1: Circular = {n: 1, s: 'hello'};
    const c2: Circular = {n: 2, s: 'world'};
    const c3: Circular = {n: 3, s: 'foo'};
    c1.c = c2; // non circular
    c3.c = c3; // circular
    expect(fromJson(toJson(c1))).toEqual(c1);
    expect(fromJson(toJson(c2))).toEqual(c2);
    expect(fromJson(toJson(c3))).toEqual(c3);
});

it('should use JSON.stringify when there are circular references', () => {
    const jsonStringify = buildJsonStringifyJITFn(rtCircular).fn;
    const c1: Circular = {n: 1, s: 'hello'};
    const c2: Circular = {n: 2, s: 'world'};
    const c3: Circular = {n: 3, s: 'foo'};
    c1.c = c2; // non circular
    c3.c = c3; // circular
    console.log(jsonStringify.toString());
    expect(jsonStringify(c1)).toBe(JSON.stringify(c1));
    expect(jsonStringify(c2)).toBe(JSON.stringify(c2));
    expect(() => jsonStringify(c3)).toThrow('Converting circular structure to JSON');
});

describe('Circular array + union', () => {
    type CuArray = (CuArray | Date | number | string)[];

    it('validate CircularUnion array', () => {
        const rt = runType<CuArray>();
        const validate = buildIsTypeJITFn(rt).fn;
        expect(validate(new Date())).toBe(true);
        expect(validate(123)).toBe(true);
        expect(validate('hello')).toBe(true);
        expect(validate(null)).toBe(true);
        expect(validate(['a', 'b', 'c'])).toBe(true);
        expect(validate({})).toBe(false);
        expect(validate(true)).toBe(false);
    });

    it('validate CircularUnion array + errors', () => {
        const rt = runType<CuArray>();
        const valWithErrors = buildTypeErrorsJITFn(rt).fn;
        expect(valWithErrors(new Date())).toEqual([]);
        expect(valWithErrors(123)).toEqual([]);
        expect(valWithErrors('hello')).toEqual([]);
        expect(valWithErrors(null)).toEqual([]);
        expect(valWithErrors(['a', 'b', 'c'])).toEqual([]);
        expect(valWithErrors({})).toEqual([{path: [], expected: 'union'}]);
        expect(valWithErrors(true)).toEqual([{path: [], expected: 'union'}]);
    });

    it('encode/decode CircularUnion array to json', () => {
        const rt = runType<CuArray>();
        const toJson = buildJsonEncodeJITFn(rt).fn;
        const fromJson = buildJsonDecodeJITFn(rt).fn;
        const typeValue = new Date();
        expect(rt.isJsonDecodeRequired).toBe(true);
        expect(rt.isJsonEncodeRequired).toBe(true);
        expect(fromJson(toJson(typeValue))).toEqual(typeValue);
        expect(fromJson(toJson(123))).toEqual(123);
        expect(fromJson(toJson('hello'))).toEqual('hello');
        expect(fromJson(toJson(null))).toEqual(null);
        expect(fromJson(toJson(['a', 'b', 'c']))).toEqual(['a', 'b', 'c']);

        // objects are not the same same object in memory after round trip
        expect(fromJson(toJson(typeValue))).not.toBe(typeValue);
    });

    it('json stringify CircularUnion array with discriminator', () => {
        const rt = runType<CuArray>();
        const jsonStringify = buildJsonStringifyJITFn(rt).fn;
        const fromJson = buildJsonDecodeJITFn(rt).fn;
        const typeValue = 'hello';
        const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);

        const typeValue2 = ['a', 'b', 'c'];
        const roundTrip2 = fromJson(JSON.parse(jsonStringify(typeValue2)));
        expect(roundTrip2).toEqual(typeValue2);
    });

    it('mock CircularUnion array', () => {
        const rt = runType<CuArray>();
        const validate = buildIsTypeJITFn(rt).fn;
        expect(rt.mock() instanceof Array).toBe(true);
        expect(validate(rt.mock())).toBe(true);
    });
});
