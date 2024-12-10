/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../runType';
import {JitFnIDs} from '../../constants';

const rt = runType<null>();

it('validate null', () => {
    const validate = rt.createJitFunction(JitFnIDs.isType);
    expect(validate(null)).toBe(true);
    expect(validate(undefined)).toBe(false);
    expect(validate(42)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate null + errors', () => {
    const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);
    expect(valWithErrors(null)).toEqual([]);
    expect(valWithErrors(undefined)).toEqual([{path: [], expected: 'null'}]);
    expect(valWithErrors(42)).toEqual([{path: [], expected: 'null'}]);
    expect(valWithErrors('hello')).toEqual([{path: [], expected: 'null'}]);
});

it('encode to json', () => {
    const toJsonVal = rt.createJitFunction(JitFnIDs.toJsonVal);
    const typeValue = null;
    expect(toJsonVal(typeValue)).toEqual(typeValue);
});

it('decode from json', () => {
    const fromJsonVal = rt.createJitFunction(JitFnIDs.fromJsonVal);
    const typeValue = null;
    const jsonValue = JSON.parse(JSON.stringify(typeValue));
    expect(fromJsonVal(jsonValue)).toEqual(typeValue);
});

it('json stringify', () => {
    const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
    const fromJsonVal = rt.createJitFunction(JitFnIDs.fromJsonVal);
    const typeValue = null;
    const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
    expect(roundTrip).toEqual(typeValue);
});

it('mock', () => {
    expect(rt.mock()).toBeNull();
    const validate = rt.createJitFunction(JitFnIDs.isType);
    expect(validate(rt.mock())).toBe(true);
});
