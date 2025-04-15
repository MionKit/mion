/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../lib/runType';
import {JitFunctions} from '../../constants';

const rt = runType<Date>();

it('validate Date', () => {
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(validate(new Date())).toBe(true);
    expect(validate('hello')).toBe(false);
});

it('validate Date + errors', () => {
    const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);
    expect(valWithErrors(new Date())).toEqual([]);
    expect(valWithErrors('hello')).toEqual([{path: [], expected: 'date'}]);
});

it('encode/decode to json', () => {
    const toJsonVal = rt.createJitFunction(JitFunctions.toJsonVal);
    const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
    const typeValue = new Date();
    expect(fromJsonVal(JSON.parse(JSON.stringify(toJsonVal(typeValue))))).toEqual(typeValue);
});

it('json stringify', () => {
    const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
    const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
    const typeValue = new Date();
    const roundTrip = fromJsonVal(JSON.parse(jsonStringify(typeValue)));
    expect(roundTrip).toEqual(typeValue);
});

it('mock', async () => {
    const mocked = await rt.mock();
    expect(mocked instanceof Date).toBe(true);
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(validate(mocked)).toBe(true);
});
