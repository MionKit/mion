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

const rt = runType<Promise<string>>();

it('validate promise<string>', () => {
    const validate = buildIsTypeJITFn(rt).fn;
    const prom = new Promise<string>(() => {});
    expect(validate(prom)).toBe(true);
    expect(validate('hello')).toBe(false);
});

it('validate promise<string> + errors', () => {
    const valWithErrors = buildTypeErrorsJITFn(rt).fn;
    const prom = new Promise<string>(() => {});
    expect(valWithErrors(prom)).toEqual([]);
    expect(valWithErrors('hello')).toEqual([{path: [], expected: 'promise'}]);
});

it('encode to json should throw an error', () => {
    expect(() => buildJsonEncodeJITFn(rt)).toThrow('promise can not be encoded to json.');
});

it('decode from json should throw an error', () => {
    expect(() => buildJsonDecodeJITFn(rt)).toThrow('promise can not be decoded from json.');
});

it('json stringify', () => {
    expect(() => buildJsonStringifyJITFn(rt)).toThrow('promise can not be stringified.');
});

it('mock', async () => {
    const mock = rt.mock();
    const result = await mock;
    expect(mock instanceof Promise).toBe(true);
    expect(typeof result).toBe('string');

    const validate = buildIsTypeJITFn(rt).fn;
    expect(validate(rt.mock())).toBe(true);
});

it('mock with reject', async () => {
    try {
        const mock = rt.mock({promiseTimeOut: 1, promiseReject: new Error('rejected')});
        await mock;
        throw new Error('promise not rejected');
    } catch (error: any) {
        // eslint-disable-next-line jest/no-conditional-expect
        expect(error.message).toBe('rejected');
    }
});
