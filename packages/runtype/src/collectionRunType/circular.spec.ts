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

interface NonCircular {
    n: number;
    s: string;
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

// type T1 = {a: number} | string | T1; // circular type reference, ts error
type T1 = {a: number} | string;
type T2 = [{a: number}, string, T2]; // tuple allows circular reference
type T3 = T3[]; // array allows circular reference

it('is circular should be set only for property types or where the circular reference is created, not in the parents', () => {
    // todo: implement
    // always fail until implemented
    throw new Error('circular only in properties still Not implemented');
});

// TODO: circular references are not supported yet

// it('should use JSON.stringify when there are circular references', () => {
//     const jsonStringify = buildJsonStringifyJITFn(rtCircular).fn;
//     const c1: Circular = {n: 1, s: 'hello'};
//     const c2: Circular = {n: 2, s: 'world'};
//     const c3: Circular = {n: 3, s: 'foo'};
//     c1.c = c2; // non circular
//     c3.c = c3; // circular
//     console.log(jsonStringify.toString());
//     expect(jsonStringify(c1)).toBe(JSON.stringify(c1));
//     expect(jsonStringify(c2)).toBe(JSON.stringify(c2));
//     expect(() => jsonStringify(c3)).toThrow('Converting circular structure to JSON');
// });

// it('should validate objects with circular references', () => {
//     const validate = buildIsTypeJITFn(rtCircular).fn;
//     const c1: Circular = {n: 1, s: 'hello'};
//     const c2: Circular = {n: 2, s: 'world'};
//     const c3: Circular = {n: 3, s: 'foo'};
//     c1.c = c2; // non circular
//     c3.c = c3; // circular
//     console.log(validate.toString());
//     expect(validate(c1)).toBe(true);
//     expect(validate(c2)).toBe(true);
//     expect(validate(c3)).toBe(true);
// });

// it('should validate object + errors with circular references', () => {
//     const valWithErrors = buildTypeErrorsJITFn(rtCircular).fn;
//     const c1: Circular = {n: 1, s: 'hello'};
//     const c2: Circular = {n: 2, s: 'world'};
//     const c3: Circular = {n: 3, s: 'foo'};
//     c1.c = c2; // non circular
//     c3.c = c3; // circular
//     console.log(valWithErrors.toString());
//     expect(valWithErrors(c1)).toEqual([]);
//     expect(valWithErrors(c2)).toEqual([]);
//     expect(valWithErrors(c3)).toEqual([]);
// });

// it('should encode/decode objects with circular references', () => {
//     const toJson = buildJsonEncodeJITFn(rtCircular).fn;
//     const fromJson = buildJsonDecodeJITFn(rtCircular).fn;
//     const c1: Circular = {n: 1, s: 'hello'};
//     const c2: Circular = {n: 2, s: 'world'};
//     const c3: Circular = {n: 3, s: 'foo'};
//     c1.c = c2; // non circular
//     c3.c = c3; // circular
//     expect(fromJson(toJson(c1))).toEqual(c1);
//     expect(fromJson(toJson(c2))).toEqual(c2);
//     expect(fromJson(toJson(c3))).toEqual(c3);
// });
