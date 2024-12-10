/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../runType';
import {JitFnIDs} from '../../constants';

const rt = runType<undefined>();

it('validate undefined', () => {
    const validate = rt.createJitFunction(JitFnIDs.isType);
    expect(validate(undefined)).toBe(true);
    expect(validate(null)).toBe(false);
    expect(validate(42)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate undefined + errors', () => {
    const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);
    expect(valWithErrors(undefined)).toEqual([]);
    expect(valWithErrors(null)).toEqual([{path: [], expected: 'undefined'}]);
    expect(valWithErrors(42)).toEqual([{path: [], expected: 'undefined'}]);
    expect(valWithErrors('hello')).toEqual([{path: [], expected: 'undefined'}]);
});

it('encode to json', () => {
    const toJsonVal = rt.createJitFunction(JitFnIDs.toJsonVal);
    const typeValue = undefined;
    expect(toJsonVal(typeValue)).toEqual(null);
});

it('decode from json', () => {
    const fromJsonVal = rt.createJitFunction(JitFnIDs.fromJsonVal);
    const typeValue = null;
    expect(fromJsonVal(typeValue)).toEqual(undefined);
});

it('json stringify', () => {
    const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
    const fromJsonVal = rt.createJitFunction(JitFnIDs.fromJsonVal);
    const typeValue = undefined;
    const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
    expect(roundTrip).toEqual(typeValue);
});

it('mock', () => {
    expect(rt.mock()).toBeUndefined();
    const validate = rt.createJitFunction(JitFnIDs.isType);
    expect(validate(rt.mock())).toBe(true);
});
