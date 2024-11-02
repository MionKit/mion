/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../runType';
import {JitFnIDs} from '../constants';

const rt = runType<string>();

it('validate string', () => {
    const validate = rt.createJitFunction(JitFnIDs.isType);
    expect(validate('hello')).toBe(true);
    expect(validate(2)).toBe(false);
});

it('validate string + errors', () => {
    const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);
    expect(valWithErrors('hello')).toEqual([]);
    expect(valWithErrors(2)).toEqual([{path: [], expected: 'string'}]);
});

it('encode to json', () => {
    const toJson = rt.createJitFunction(JitFnIDs.jsonEncode);
    expect(toJson('hello')).toBe('hello');
});

it('decode from json', () => {
    const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);
    expect(fromJson('hello')).toBe('hello');
});

it('json stringify', () => {
    const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
    const fromJson = rt.createJitFunction(JitFnIDs.jsonDecode);
    const typeValue = 'hello';
    const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
    expect(roundTrip).toEqual(typeValue);
});

it('mock', () => {
    expect(typeof rt.mock()).toBe('string');
    const validate = rt.createJitFunction(JitFnIDs.isType);
    expect(validate(rt.mock())).toBe(true);
});
