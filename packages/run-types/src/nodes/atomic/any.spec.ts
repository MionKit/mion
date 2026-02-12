/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {JitFunctions} from '../../constants.functions.ts';
import {runType} from '../../createRunType.ts';

const rt = runType<any>();

it('validate any', () => {
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(validate(null)).toBe(true);
    expect(validate(undefined)).toBe(true);
    expect(validate(42)).toBe(true);
    expect(validate('hello')).toBe(true);
});

it('validate any + errors', () => {
    const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);
    expect(valWithErrors(null)).toEqual([]);
    expect(valWithErrors(undefined)).toEqual([]);
    expect(valWithErrors(42)).toEqual([]);
    expect(valWithErrors('hello')).toEqual([]);
});

it('mock', async () => {
    const mocked = await rt.mock();
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(validate(mocked)).toBe(true);
});
