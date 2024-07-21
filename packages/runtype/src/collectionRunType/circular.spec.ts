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

it('should throw an error when trying to get the type of an object with circular reference', () => {
    expect(() => runType<Circular>()).toThrow('Circular references are not supported ie: type T = {a: T}');
    expect(() => runType<CircularClass>()).toThrow('Circular references are not supported ie: type T = {a: T}');
    expect(() => runType<CircularClassConstructor>()).toThrow('Circular references are not supported ie: type T = {a: T}');
    expect(() => runType<CircularTuple>()).toThrow('Circular references are not supported ie: type T = {a: T}');
    expect(() => runType<CircularUnion>()).toThrow('Circular references are not supported ie: type T = {a: T}');
    expect(() => runType<CircularIndex>()).toThrow('Circular references are not supported ie: type T = {a: T}');
    expect(() => runType<CircularDeep>()).toThrow('Circular references are not supported ie: type T = {a: T}');
    expect(() => runType<CircularArray>()).toThrow('Circular references are not supported ie: type T = {a: T}');
    expect(() => runType<CircularArrayUnion>()).toThrow('Circular references are not supported ie: type T = {a: T}');
});

it('should not throw an error when trying to get the type of an object with circular reference', () => {
    expect(() => runType<NonCircular>()).not.toThrow('Circular references are not supported ie: type T = {a: T}');
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
