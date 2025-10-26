/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../createRunType';
import {JitFunctions} from '../../constants.functions';

const rt = runType<undefined>();

it('validate undefined', () => {
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(validate(undefined)).toBe(true);
    expect(validate(null)).toBe(false);
    expect(validate(42)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate undefined + errors', () => {
    const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);
    expect(valWithErrors(undefined)).toEqual([]);
    expect(valWithErrors(null)).toEqual([{path: [], expected: 'undefined'}]);
    expect(valWithErrors(42)).toEqual([{path: [], expected: 'undefined'}]);
    expect(valWithErrors('hello')).toEqual([{path: [], expected: 'undefined'}]);
});

it('mock', async () => {
    const mocked = await rt.mock();
    expect(mocked).toBeUndefined();
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(validate(mocked)).toBe(true);
});
