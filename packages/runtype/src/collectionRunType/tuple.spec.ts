/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../runType';
import {
    getJitJsonEncodeFn,
    getJitJsonDecodeFn,
    getValidateJitFunction,
    getJitValidateWithErrorsFn,
    getJitMockFn,
} from '../jitCompiler';

type TupleType = [Date, number, string, null, string[], bigint];

const rt = runType<TupleType>();

it('validate tuple', () => {
    const validate = getValidateJitFunction(rt);
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
    const valWithErrors = getJitValidateWithErrorsFn(rt);
    expect(valWithErrors([new Date(), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123)])).toEqual([]);
    expect(valWithErrors([new Date(), 123, 'hello', null, [], BigInt(123)])).toEqual([]);
    expect(valWithErrors([new Date(), 123, 'hello', null])).toEqual([
        {path: '/4', message: 'Expected to be an Array<string>'},
        {path: '/5', message: 'Expected to be a valid Bigint'},
    ]);
    expect(valWithErrors([new Date(), 123, 'hello'])).toEqual([
        {path: '/3', message: 'Expected to be null'},
        {path: '/4', message: 'Expected to be an Array<string>'},
        {path: '/5', message: 'Expected to be a valid Bigint'},
    ]);
    expect(valWithErrors([new Date(), 123])).toEqual([
        {path: '/2', message: 'Expected to be a String'},
        {path: '/3', message: 'Expected to be null'},
        {path: '/4', message: 'Expected to be an Array<string>'},
        {path: '/5', message: 'Expected to be a valid Bigint'},
    ]);
    expect(valWithErrors([new Date()])).toEqual([
        {path: '/1', message: 'Expected to be a valid Number'},
        {path: '/2', message: 'Expected to be a String'},
        {path: '/3', message: 'Expected to be null'},
        {path: '/4', message: 'Expected to be an Array<string>'},
        {path: '/5', message: 'Expected to be a valid Bigint'},
    ]);
    expect(valWithErrors([])).toEqual([
        {path: '/0', message: 'Expected to be a valid Date'},
        {path: '/1', message: 'Expected to be a valid Number'},
        {path: '/2', message: 'Expected to be a String'},
        {path: '/3', message: 'Expected to be null'},
        {path: '/4', message: 'Expected to be an Array<string>'},
        {path: '/5', message: 'Expected to be a valid Bigint'},
    ]);
    expect(valWithErrors({})).toEqual([
        {path: '', message: 'Expected to be a Tuple<Date, number, string, null, Array<string>, bigint>'},
    ]);
});

it('encode/decode to json', () => {
    const toJson = getJitJsonEncodeFn(rt);
    const fromJson = getJitJsonDecodeFn(rt);
    console.log(toJson.toString());
    console.log(fromJson.toString());
    const typeValue = [new Date(), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123)];
    expect(rt.shouldDecodeJson).toBe(true);
    expect(rt.shouldEncodeJson).toBe(true);
    expect(fromJson(toJson(typeValue))).toEqual(typeValue);
});

it('mock', () => {
    const mock = getJitMockFn(rt);
    const mocked = mock();
    expect(mocked).toHaveLength(6);
    expect(mocked[0]).toBeInstanceOf(Date);
    expect(typeof mocked[1]).toBe('number');
    expect(typeof mocked[2]).toBe('string');
    expect(mocked[3]).toBeNull();
    expect(Array.isArray(mocked[4])).toBe(true);
    expect(typeof mocked[5]).toBe('bigint');
    const validate = getValidateJitFunction(rt);
    expect(validate(mock())).toBe(true);
});
