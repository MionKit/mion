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

type TupleType = [Date, number, string, null, string[], bigint];

const rt = runType<TupleType>();

it('validate tuple', () => {
    const validate = buildIsTypeJITFn(rt);
    expect(validate([new Date(), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123)])).toBe(true);
    expect(validate([new Date(), 123, 'hello', null, [], BigInt(123)])).toBe(true);
    expect(validate([new Date(), 123, 'hello', null, ['a', 'b', 'c']])).toBe(false);
    expect(validate([new Date(), 123, 'hello', null])).toBe(false);
    expect(validate([new Date(), 123, 'hello'])).toBe(false);
    expect(validate([new Date(), 123])).toBe(false);
    expect(validate([new Date()])).toBe(false);
    expect(validate([])).toBe(false);
    expect(validate({})).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate tuple + errors', () => {
    const valWithErrors = buildTypeErrorsJITFn(rt);
    expect(valWithErrors([new Date(), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123)])).toEqual([]);
    expect(valWithErrors([new Date(), 123, 'hello', null, [], BigInt(123)])).toEqual([]);
    expect(valWithErrors([new Date(), 123, 'hello', null])).toEqual([
        {path: '/4', expected: 'array<string>'},
        {path: '/5', expected: 'bigint'},
    ]);
    expect(valWithErrors([new Date(), 123, 'hello'])).toEqual([
        {path: '/3', expected: 'null'},
        {path: '/4', expected: 'array<string>'},
        {path: '/5', expected: 'bigint'},
    ]);
    expect(valWithErrors([new Date(), 123])).toEqual([
        {path: '/2', expected: 'string'},
        {path: '/3', expected: 'null'},
        {path: '/4', expected: 'array<string>'},
        {path: '/5', expected: 'bigint'},
    ]);
    expect(valWithErrors([new Date()])).toEqual([
        {path: '/1', expected: 'number'},
        {path: '/2', expected: 'string'},
        {path: '/3', expected: 'null'},
        {path: '/4', expected: 'array<string>'},
        {path: '/5', expected: 'bigint'},
    ]);
    expect(valWithErrors([])).toEqual([
        {path: '/0', expected: 'date'},
        {path: '/1', expected: 'number'},
        {path: '/2', expected: 'string'},
        {path: '/3', expected: 'null'},
        {path: '/4', expected: 'array<string>'},
        {path: '/5', expected: 'bigint'},
    ]);
    expect(valWithErrors({})).toEqual([{path: '', expected: 'tuple<date, number, string, null, array<string>, bigint>'}]);
});

it('encode/decode to json', () => {
    const toJson = buildJsonEncodeJITFn(rt);
    const fromJson = buildJsonDecodeJITFn(rt);
    const typeValue = [new Date(), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123)];
    expect(rt.isJsonDecodeRequired).toBe(true);
    expect(rt.isJsonEncodeRequired).toBe(true);
    expect(fromJson(toJson(typeValue))).toEqual(typeValue);
});

it('json stringify', () => {
    const jsonStringify = buildJsonStringifyJITFn(rt);
    const fromJson = buildJsonDecodeJITFn(rt);
    const typeValue = [new Date(), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123)];
    const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
    expect(roundTrip).toEqual(typeValue);
});

it('mock', () => {
    const mocked = rt.mock();
    expect(mocked).toHaveLength(6);
    expect(mocked[0]).toBeInstanceOf(Date);
    expect(typeof mocked[1]).toBe('number');
    expect(typeof mocked[2]).toBe('string');
    expect(mocked[3]).toBeNull();
    expect(Array.isArray(mocked[4])).toBe(true);
    expect(typeof mocked[5]).toBe('bigint');
    const validate = buildIsTypeJITFn(rt);
    expect(validate(rt.mock())).toBe(true);
});
