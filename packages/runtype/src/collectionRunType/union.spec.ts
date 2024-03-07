/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../runType';
import {buildJsonEncodeJITFn, buildJsonDecodeJITFn, buildIsTypeJITFn, buildTypeErrorsJITFn, buildMockJITFn} from '../jitCompiler';

type UnionType = Date | number | string | null | string[];

const rt = runType<UnionType>();

it('validate union', () => {
    const validate = buildIsTypeJITFn(rt);
    expect(validate(new Date())).toBe(true);
    expect(validate(123)).toBe(true);
    expect(validate('hello')).toBe(true);
    expect(validate(null)).toBe(true);
    expect(validate(['a', 'b', 'c'])).toBe(true);
    expect(validate({})).toBe(false);
    expect(validate(true)).toBe(false);
});

it('validate union + errors', () => {
    const valWithErrors = buildTypeErrorsJITFn(rt);
    expect(valWithErrors(new Date())).toEqual([]);
    expect(valWithErrors(123)).toEqual([]);
    expect(valWithErrors('hello')).toEqual([]);
    expect(valWithErrors(null)).toEqual([]);
    expect(valWithErrors(['a', 'b', 'c'])).toEqual([]);
    expect(valWithErrors({})).toEqual([{path: '', expected: 'union<date | number | string | null | array<string>>'}]);
    expect(valWithErrors(true)).toEqual([{path: '', expected: 'union<date | number | string | null | array<string>>'}]);
});

it('encode/decode to json', () => {
    const toJson = buildJsonEncodeJITFn(rt);
    const fromJson = buildJsonDecodeJITFn(rt);
    const typeValue = new Date();
    expect(rt.shouldDecodeJson).toBe(true);
    expect(rt.shouldEncodeJson).toBe(true);
    expect(fromJson(toJson(typeValue))).toEqual(typeValue);
    expect(fromJson(toJson(123))).toEqual(123);
    expect(fromJson(toJson('hello'))).toEqual('hello');
    expect(fromJson(toJson(null))).toEqual(null);
    expect(fromJson(toJson(['a', 'b', 'c']))).toEqual(['a', 'b', 'c']);

    // objects are not the same after round trip
    expect(fromJson(toJson(typeValue))).not.toBe(typeValue);
});

// test case for an union that does not require encoding/decoding ie string | string[]
it('no encode/decode require to json', () => {
    type UnionType = string | string[];
    const rtu = runType<UnionType>();
    const toJson = buildJsonEncodeJITFn(rtu);
    const fromJson = buildJsonDecodeJITFn(rtu);
    expect(rtu.shouldDecodeJson).toBe(false);
    expect(rtu.shouldEncodeJson).toBe(false);
    const typeValue = 'hello';
    expect(fromJson(toJson(typeValue))).toEqual(typeValue);
    const typeValue2 = ['a', 'b', 'c'];
    expect(fromJson(toJson(typeValue2))).toEqual(typeValue2);

    // objects are the same after round trip
    expect(fromJson(toJson(typeValue))).toBe(typeValue);
});

it('mock', () => {
    const mock = buildMockJITFn(rt);
    const mocked = mock();
    expect(
        typeof mocked === 'string' ||
            typeof mocked === 'number' ||
            mocked instanceof Date ||
            mocked === null ||
            Array.isArray(mocked)
    ).toBe(true);
    const validate = buildIsTypeJITFn(rt);
    expect(validate(mock())).toBe(true);
});
