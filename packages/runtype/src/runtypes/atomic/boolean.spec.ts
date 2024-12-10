/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../runType';
import {JitFnIDs} from '../../constants';

const rt = runType<boolean>();

it('validate boolean', () => {
    const validate = rt.createJitFunction(JitFnIDs.isType);
    expect(validate(true)).toBe(true);
    expect(validate(false)).toBe(true);
    expect(validate(42)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate boolean + errors', () => {
    const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);
    expect(valWithErrors(true)).toEqual([]);
    expect(valWithErrors(false)).toEqual([]);
    expect(valWithErrors(42)).toEqual([{path: [], expected: 'boolean'}]);
    expect(valWithErrors('hello')).toEqual([{path: [], expected: 'boolean'}]);
});

it('encode to json', () => {
    const toJsonVal = rt.createJitFunction(JitFnIDs.toJsonVal);
    const typeValue = true;
    expect(toJsonVal(typeValue)).toEqual(typeValue);
});

it('decode from json', () => {
    const fromJsonVal = rt.createJitFunction(JitFnIDs.fromJsonVal);
    const typeValue = true;
    const jsonValue = JSON.parse(JSON.stringify(typeValue));
    expect(fromJsonVal(jsonValue)).toEqual(typeValue);
});

it('json stringify', () => {
    const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
    const fromJsonVal = rt.createJitFunction(JitFnIDs.fromJsonVal);
    const typeValue = true;
    const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
    expect(roundTrip).toEqual(typeValue);
});

it('mock', () => {
    expect(typeof rt.mock()).toBe('boolean');
    const validate = rt.createJitFunction(JitFnIDs.isType);
    expect(validate(rt.mock())).toBe(true);
});
