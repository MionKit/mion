/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../lib/createRunType';
import {JitFunctions} from '../../constants.functions';

const rt = runType<null>();

it('validate null', () => {
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(validate(null)).toBe(true);
    expect(validate(undefined)).toBe(false);
    expect(validate(42)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate null + errors', () => {
    const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);
    expect(valWithErrors(null)).toEqual([]);
    expect(valWithErrors(undefined)).toEqual([{path: [], expected: 'null'}]);
    expect(valWithErrors(42)).toEqual([{path: [], expected: 'null'}]);
    expect(valWithErrors('hello')).toEqual([{path: [], expected: 'null'}]);
});

it('mock', async () => {
    const mocked = await rt.mock();
    expect(mocked).toBeNull();
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(validate(mocked)).toBe(true);
});
