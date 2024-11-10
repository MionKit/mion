/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../runType';
import {JitFnIDs} from '../constants';

// ####### NOTE RUNTYPES SUPPORT CIRCULAR TYPE REFERENCES, BUT NOT CIRCULAR OBJECTS AT RUNTIME #####
// circular objects will throw maximum call stack exceeded error

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

describe('Circular object', () => {
    interface Circular {
        n: number;
        s: string;
        c?: Circular;
        d?: Date;
    }

    const rtCircular = runType<Circular>();

    const c1: Circular = {n: 1, s: 'hello', c: {n: 2, s: 'world'}};
    const c2: Circular = {n: 2, s: 'world'};
    const c3: Circular = {n: 3, s: 'foo', c: {n: 3, s: 'foo'}};

    const notC1 = {n: 1, s: 'hello', c: {n: 2, s: 123}}; // c.s is not a string
    const notC2 = {n: 1, s: 'hello', c: {n: 2}}; // c.s is missing

    it('should validate objects with circular references', () => {
        const validate = rtCircular.createJitFunction(JitFnIDs.isType);

        expect(validate(c1)).toBe(true);
        expect(validate(c2)).toBe(true);
        expect(validate(c3)).toBe(true);

        expect(validate(notC1)).toBe(false);
        expect(validate(notC2)).toBe(false);
    });

    it('should validate object + errors with circular references', () => {
        const valWithErrors = rtCircular.createJitFunction(JitFnIDs.typeErrors);

        expect(valWithErrors(c1)).toEqual([]);
        expect(valWithErrors(c2)).toEqual([]);
        expect(valWithErrors(c3)).toEqual([]);

        expect(valWithErrors(notC1)).toEqual([{path: ['c', 's'], expected: 'string'}]);
        expect(valWithErrors(notC2)).toEqual([{path: ['c', 's'], expected: 'string'}]);
    });

    it('should encode/decode objects with circular references', () => {
        const toJson = rtCircular.createJitFunction(JitFnIDs.jsonEncode);
        const fromJson = rtCircular.createJitFunction(JitFnIDs.jsonDecode);

        const copy1 = structuredClone(c1);
        const copy2 = structuredClone(c2);
        const copy3 = structuredClone(c3);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(copy1))))).toEqual(c1);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(copy2))))).toEqual(c2);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(copy3))))).toEqual(c3);
    });

    it('should use JSON.stringify when there are circular references', () => {
        const jsonStringify = rtCircular.createJitFunction(JitFnIDs.jsonStringify);

        const toJson = rtCircular.createJitFunction(JitFnIDs.jsonEncode);
        const fromJson = rtCircular.createJitFunction(JitFnIDs.jsonDecode);

        const copy1 = structuredClone(c1);
        const copy2 = structuredClone(c2);
        const copy3 = structuredClone(c3);
        expect(fromJson(JSON.parse(jsonStringify(toJson(copy1))))).toEqual(c1);
        expect(fromJson(JSON.parse(jsonStringify(toJson(copy2))))).toEqual(c2);
        expect(fromJson(JSON.parse(jsonStringify(toJson(copy3))))).toEqual(c3);
    });
});

describe('Circular array + union', () => {
    type CuArray = (CuArray | Date | number | string)[];

    const rt = runType<CuArray>();

    const cu1 = [new Date(), 123, 'hello', ['a', 'b', 'c']];
    const cu2 = [new Date(), 123, 'hello', ['a', 2, 'c'], cu1];
    const cu3 = [];

    it('validate CircularUnion array', () => {
        const rt = runType<CuArray>();
        const validate = rt.createJitFunction(JitFnIDs.isType);
        expect(validate([new Date()])).toBe(true);
        expect(validate([123])).toBe(true);
        expect(validate(['hello'])).toBe(true);
        expect(validate(['a', 'b', 'c'])).toBe(true);
        expect(validate(['a', 'b', 'c'])).toBe(true);

        expect(validate(null)).toBe(true);
        
        expect(validate({})).toBe(false);
        expect(validate(true)).toBe(false);
    });

    it('validate CircularUnion array + errors', () => {
        const rt = runType<CuArray>();
        const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);
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
        const toJson = rt.createJitFunction(JitFnIDs.jsonEncode);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);
        const typeValue = new Date();
        expect(fromJson(JSON.parse(JSON.stringify(toJson(typeValue))))).toEqual(typeValue);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(123))))).toEqual(123);
        expect(fromJson(JSON.parse(JSON.stringify(toJson('hello'))))).toEqual('hello');
        expect(fromJson(JSON.parse(JSON.stringify(toJson(null))))).toEqual(null);
        expect(fromJson(JSON.parse(JSON.stringify(toJson(['a', 'b', 'c']))))).toEqual(['a', 'b', 'c']);

        // objects are not the same same object in memory after round trip
        expect(fromJson(JSON.parse(JSON.stringify(toJson(typeValue))))).not.toBe(typeValue);
    });

    it('json stringify CircularUnion array with discriminator', () => {
        const rt = runType<CuArray>();
        const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);
        const typeValue = 'hello';
        const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);

        const typeValue2 = ['a', 'b', 'c'];
        const roundTrip2 = fromJson(JSON.parse(jsonStringify(typeValue2)));
        expect(roundTrip2).toEqual(typeValue2);
    });

    it('mock CircularUnion array', () => {
        const rt = runType<CuArray>();
        const validate = rt.createJitFunction(JitFnIDs.isType);
        expect(rt.mock() instanceof Array).toBe(true);
        expect(validate(rt.mock())).toBe(true);
    });
});
