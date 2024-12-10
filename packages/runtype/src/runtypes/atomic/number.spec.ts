/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../runType';
import {JitFnIDs} from '../../constants';

const rt = runType<number>();

it('validate number', () => {
    const validate = rt.createJitFunction(JitFnIDs.isType);
    expect(validate(42)).toBe(true);
    expect(validate(Infinity)).toBe(false);
    expect(validate(-Infinity)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate number + errors', () => {
    const valWithErrors = rt.createJitFunction(JitFnIDs.typeErrors);
    expect(valWithErrors(42)).toEqual([]);
    expect(valWithErrors('hello')).toEqual([{path: [], expected: 'number'}]);
});

it('encode to json', () => {
    const toJsonVal = rt.createJitFunction(JitFnIDs.toJsonVal);
    const typeValue = 42;
    expect(toJsonVal(typeValue)).toEqual(typeValue);
});

it('decode from json', () => {
    const fromJsonVal = rt.createJitFunction(JitFnIDs.fromJsonVal);
    const typeValue = 42;
    const jsonValue = JSON.parse(JSON.stringify(typeValue));
    expect(fromJsonVal(jsonValue)).toEqual(typeValue);
});

it('json stringify', () => {
    const jsonStringify = rt.createJitFunction(JitFnIDs.jsonStringify);
    const fromJsonVal = rt.createJitFunction(JitFnIDs.fromJsonVal);
    const typeValue = 42;
    const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
    expect(roundTrip).toEqual(typeValue);
});

it('mock', () => {
    expect(typeof rt.mock()).toBe('number');
    const validate = rt.createJitFunction(JitFnIDs.isType);
    expect(validate(rt.mock())).toBe(true);
});
