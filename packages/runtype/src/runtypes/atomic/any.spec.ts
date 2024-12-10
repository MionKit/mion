/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {JitFnIDs} from '../../constants';
import {runType} from '../../runType';

const rt = runType<any>();

it('validate any', () => {
    const validate = rt.createJitFunction(JitFnIDs.isType);
    expect(validate(null)).toBe(true);
    expect(validate(undefined)).toBe(true);
    expect(validate(42)).toBe(true);
    expect(validate('hello')).toBe(true);
});

it('validate any + errors', () => {
    const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);
    expect(valWithErrors(null)).toEqual([]);
    expect(valWithErrors(undefined)).toEqual([]);
    expect(valWithErrors(42)).toEqual([]);
    expect(valWithErrors('hello')).toEqual([]);
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
    const typeValue = {a: 42, b: 'hello'};
    const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
    expect(roundTrip).toEqual(typeValue);
});

it('mock', () => {
    const validate = rt.createJitFunction(JitFnIDs.isType);
    expect(validate(rt.mock())).toBe(true);
});
