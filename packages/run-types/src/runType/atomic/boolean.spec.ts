/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../lib/runType';
import {JitFunctions} from '../../constants';

const rt = runType<boolean>();

it('validate boolean', () => {
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(validate(true)).toBe(true);
    expect(validate(false)).toBe(true);
    expect(validate(42)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate boolean + errors', () => {
    const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);
    expect(valWithErrors(true)).toEqual([]);
    expect(valWithErrors(false)).toEqual([]);
    expect(valWithErrors(42)).toEqual([{path: [], expected: 'boolean'}]);
    expect(valWithErrors('hello')).toEqual([{path: [], expected: 'boolean'}]);
});

it('encode to json', () => {
    const toJsonVal = rt.createJitFunction(JitFunctions.toJsonVal);
    const typeValue = true;
    expect(toJsonVal(typeValue)).toEqual(typeValue);
});

it('decode from json', () => {
    const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
    const typeValue = true;
    const jsonValue = JSON.parse(JSON.stringify(typeValue));
    expect(fromJsonVal(jsonValue)).toEqual(typeValue);
});

it('json stringify', () => {
    const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
    const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
    const typeValue = true;
    const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
    expect(roundTrip).toEqual(typeValue);
});

it('mock', async () => {
    const mocked = await rt.mock();
    expect(typeof mocked).toBe('boolean');
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(validate(mocked)).toBe(true);
});
