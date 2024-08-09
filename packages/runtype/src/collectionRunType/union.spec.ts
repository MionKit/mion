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

describe('UnionType', () => {
    type UnionType = Date | number | string | null | string[];

    const rt = runType<UnionType>();

    it('validate union', () => {
        const validate = buildIsTypeJITFn(rt).fn;
        expect(validate(new Date())).toBe(true);
        expect(validate(123)).toBe(true);
        expect(validate('hello')).toBe(true);
        expect(validate(null)).toBe(true);
        expect(validate(['a', 'b', 'c'])).toBe(true);
        expect(validate({})).toBe(false);
        expect(validate(true)).toBe(false);
    });

    it('validate union + errors', () => {
        const valWithErrors = buildTypeErrorsJITFn(rt).fn;
        expect(valWithErrors(new Date())).toEqual([]);
        expect(valWithErrors(123)).toEqual([]);
        expect(valWithErrors('hello')).toEqual([]);
        expect(valWithErrors(null)).toEqual([]);
        expect(valWithErrors(['a', 'b', 'c'])).toEqual([]);
        expect(valWithErrors({})).toEqual([{path: [], expected: 'union'}]);
        expect(valWithErrors(true)).toEqual([{path: [], expected: 'union'}]);
    });

    it('encode/decode to json', () => {
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

    it('json stringify with discriminator', () => {
        // this should be serialized as [discriminatorIndex, value]
        const jsonStringify = buildJsonStringifyJITFn(rt).fn;
        const fromJson = buildJsonDecodeJITFn(rt).fn;
        const typeValue = 'hello';
        const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);

        const typeValue2 = ['a', 'b', 'c'];
        const roundTrip2 = fromJson(JSON.parse(jsonStringify(typeValue2)));
        expect(roundTrip2).toEqual(typeValue2);
    });

    it('throw errors whe serializing deserializing object not belonging to the union', () => {
        type UT = string | string[];
        const rtU = runType<UT>();
        const jsonStringify = buildJsonStringifyJITFn(rtU).fn;
        const fromJson = buildJsonDecodeJITFn(rtU).fn;
        const toJson = buildJsonEncodeJITFn(rtU).fn;
        const typeValue = new Date();

        expect(() => jsonStringify(typeValue)).toThrow('Can not stringify union: expected one of <string | array> but got Date');
        expect(() => fromJson(123)).toThrow('Can not decode json from union: expected one of <string | array> but got Number');
        expect(() => toJson(typeValue)).toThrow('Can not encode json to union: expected one of <string | array> but got Date');
    });

    it('mock', () => {
        const mocked = rt.mock();
        expect(
            typeof mocked === 'string' ||
                typeof mocked === 'number' ||
                mocked instanceof Date ||
                mocked === null ||
                Array.isArray(mocked)
        ).toBe(true);
        const validate = buildIsTypeJITFn(rt).fn;
        expect(validate(rt.mock())).toBe(true);
    });
});

describe('UnionType circular', () => {
    type CuArray = (CuArray | Date | number | string)[];
    type CuProperty = Date | number | string | {a: CuProperty} | CuProperty[];

    it('validate CircularUnion', () => {
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
});
