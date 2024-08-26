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
type TupleWithOptionals = [number, bigint?, boolean?, number?];

const rt = runType<TupleType>();

it('validate tuple', () => {
    const validate = buildIsTypeJITFn(rt).fn;
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
    // extra elements in the tuple
    expect(validate([new Date(), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123), 34])).toBe(false);
});

it('validate tuple with optional parameters', () => {
    const validate = buildIsTypeJITFn(runType<TupleWithOptionals>()).fn;
    expect(validate([3, undefined, true, 4])).toBe(true);
    expect(validate([3, undefined, undefined, 4])).toBe(true);
    expect(validate([3, 2n, true, 4])).toBe(true);
    expect(validate([3])).toBe(true);
    // invalid scenarios
    expect(validate([])).toBe(false);
    expect(validate([3, '2', true, 4])).toBe(false);
});

it('validate tuple + errors', () => {
    const valWithErrors = buildTypeErrorsJITFn(rt).fn;
    expect(valWithErrors([new Date(), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123)])).toEqual([]);
    expect(valWithErrors([new Date(), 123, 'hello', null, [], BigInt(123)])).toEqual([]);
    expect(valWithErrors([new Date(), 123, 'hello', null])).toEqual([
        {path: [4], expected: 'array'},
        {path: [5], expected: 'bigint'},
    ]);
    expect(valWithErrors([new Date(), 123, 'hello'])).toEqual([
        {path: [3], expected: 'null'},
        {path: [4], expected: 'array'},
        {path: [5], expected: 'bigint'},
    ]);
    expect(valWithErrors([new Date(), 123])).toEqual([
        {path: [2], expected: 'string'},
        {path: [3], expected: 'null'},
        {path: [4], expected: 'array'},
        {path: [5], expected: 'bigint'},
    ]);
    expect(valWithErrors([new Date()])).toEqual([
        {path: [1], expected: 'number'},
        {path: [2], expected: 'string'},
        {path: [3], expected: 'null'},
        {path: [4], expected: 'array'},
        {path: [5], expected: 'bigint'},
    ]);
    expect(valWithErrors([])).toEqual([
        {path: [0], expected: 'date'},
        {path: [1], expected: 'number'},
        {path: [2], expected: 'string'},
        {path: [3], expected: 'null'},
        {path: [4], expected: 'array'},
        {path: [5], expected: 'bigint'},
    ]);
    expect(valWithErrors({})).toEqual([{path: [], expected: 'tuple'}]);
    // extra elements in the tuple
    expect(valWithErrors([new Date(), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123), 34])).toEqual([
        {path: [], expected: 'tuple'},
    ]);
});

it('validate tuple with optional parameters + errors', () => {
    const valWithErrors = buildTypeErrorsJITFn(runType<TupleWithOptionals>()).fn;
    expect(valWithErrors([3, undefined, true, 4])).toEqual([]);
    expect(valWithErrors([3, undefined, undefined, 4])).toEqual([]);
    expect(valWithErrors([3, 2n, true, 4])).toEqual([]);
    expect(valWithErrors([3])).toEqual([]);
    // invalid scenarios
    expect(valWithErrors([])).toEqual([{path: [0], expected: 'number'}]);
    expect(valWithErrors([3, '2', true, 4])).toEqual([{path: [1], expected: 'bigint'}]);
});

it('encode/decode to json', () => {
    const toJson = buildJsonEncodeJITFn(rt).fn;
    const fromJson = buildJsonDecodeJITFn(rt).fn;
    const typeValue = [new Date(), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123)];
    expect(rt.isJsonDecodeRequired).toBe(true);
    expect(rt.isJsonEncodeRequired).toBe(true);
    expect(fromJson(toJson(typeValue))).toEqual(typeValue);
});

it('encode/decode tuple with optional parameters to json', () => {
    const toJson = buildJsonEncodeJITFn(runType<TupleWithOptionals>()).fn;
    const fromJson = buildJsonDecodeJITFn(runType<TupleWithOptionals>()).fn;
    const typeValue = [3, undefined, true, 4];
    expect(fromJson(toJson(typeValue))).toEqual(typeValue);
    expect(fromJson(toJson([3, undefined, undefined, 4]))).toEqual([3, undefined, undefined, 4]);
    expect(fromJson(toJson([3, 2n, true, 4]))).toEqual([3, 2n, true, 4]);
    expect(fromJson(toJson([3]))).toEqual([3, undefined, undefined, undefined]);
    expect(fromJson(toJson([3]))).toEqual([3]);
});

it('json stringify', () => {
    const jsonStringify = buildJsonStringifyJITFn(rt).fn;
    const fromJson = buildJsonDecodeJITFn(rt).fn;
    const typeValue = [new Date(), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123)];
    const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
    expect(roundTrip).toEqual(typeValue);
});

it('json stringify tuple with optional params', () => {
    const jsonStringify = buildJsonStringifyJITFn(runType<TupleWithOptionals>()).fn;
    const fromJson = buildJsonDecodeJITFn(runType<TupleWithOptionals>()).fn;
    const typeValue = [3, undefined, true, 4];
    const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
    expect(roundTrip).toEqual(typeValue);
    const typeValue2 = [3];
    console.log(jsonStringify(typeValue2));
    console.log(JSON.parse(jsonStringify(typeValue2)));
    const roundTrip2 = fromJson(JSON.parse(jsonStringify(typeValue2)));
    expect(roundTrip2).toEqual([3]);
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
    const validate = buildIsTypeJITFn(rt).fn;
    expect(validate(rt.mock())).toBe(true);
});

it('mock  tuple with optional params', () => {
    const mocked = runType<TupleWithOptionals>().mock();
    console.log(mocked);
    expect(mocked.length).toBeLessThanOrEqual(4);
    expect(typeof mocked[0]).toBe('number');
    expect(typeof mocked[1] === 'bigint' || typeof mocked[1] === 'undefined').toBeTruthy();
    expect(typeof mocked[2] === 'boolean' || typeof mocked[2] === 'undefined').toBeTruthy();
    expect(typeof mocked[3] === 'number' || typeof mocked[3] === 'undefined').toBeTruthy();
    const validate = buildIsTypeJITFn(runType<TupleWithOptionals>()).fn;
    expect(validate(mocked)).toBe(true);
});
