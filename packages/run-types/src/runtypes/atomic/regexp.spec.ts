/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../runType';
import {JitFunctions} from '../../constants';
import {mockRegExpsList} from '../../constants.mock';

const rt = runType<RegExp>();

it('validate regexp', () => {
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(validate(/abc/)).toBe(true);
    expect(validate(new RegExp('abc'))).toBe(true);
    expect(validate(undefined)).toBe(false);
    expect(validate(42)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate regexp + errors', () => {
    const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);
    expect(valWithErrors(/abc/)).toEqual([]);
    expect(valWithErrors(undefined)).toEqual([{path: [], expected: 'regexp'}]);
    expect(valWithErrors(42)).toEqual([{path: [], expected: 'regexp'}]);
    expect(valWithErrors('hello')).toEqual([{path: [], expected: 'regexp'}]);
});

it('encode/decode json', () => {
    const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
    const toJsonVal = rt.createJitFunction(JitFunctions.toJsonVal);
    mockRegExpsList.forEach((regexp) => {
        expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(regexp))))).toEqual(regexp);
    });
});

it('json stringify', () => {
    const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
    const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
    mockRegExpsList.forEach((regexp) => {
        const typeValue = regexp;
        const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);
    });
});

it('mock', async () => {
    const mocked = await rt.mock();
    expect(mocked instanceof RegExp).toBe(true);
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(validate(mocked)).toBe(true);
});
