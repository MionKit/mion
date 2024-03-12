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

const rt = runType<Date>();

it('validate Date', () => {
    const validate = buildIsTypeJITFn(rt).fn;
    expect(validate(new Date())).toBe(true);
    expect(validate('hello')).toBe(false);
});

it('validate Date + errors', () => {
    const valWithErrors = buildTypeErrorsJITFn(rt).fn;
    expect(valWithErrors(new Date())).toEqual([]);
    expect(valWithErrors('hello')).toEqual([{path: '', expected: 'date'}]);
});

it('encode/decode to json', () => {
    const toJson = buildJsonEncodeJITFn(rt).fn;
    const fromJson = buildJsonDecodeJITFn(rt).fn;
    const typeValue = new Date();
    expect(fromJson(toJson(typeValue))).toEqual(typeValue);
});

it('json stringify', () => {
    const jsonStringify = buildJsonStringifyJITFn(rt).fn;
    const fromJson = buildJsonDecodeJITFn(rt).fn;
    const typeValue = new Date();
    const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
    expect(roundTrip).toEqual(typeValue);
});

it('mock', () => {
    expect(rt.mock() instanceof Date).toBe(true);
    const validate = buildIsTypeJITFn(rt).fn;
    expect(validate(rt.mock())).toBe(true);
});
