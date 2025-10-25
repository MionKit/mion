/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../lib/createRunType';
import {JitFunctions} from '../../constants.functions';

const rt = runType<void>();

it('validate void', () => {
    const validate = rt.createJitFunction(JitFunctions.isType);
    function vd() {}
    expect(validate(undefined)).toBe(true);
    expect(validate(vd())).toBe(true);
    expect(validate(null)).toBe(false);
    expect(validate(42)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate void + errors', () => {
    const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);
    expect(valWithErrors(undefined)).toEqual([]);
    expect(valWithErrors(null)).toEqual([{path: [], expected: 'void'}]);
    expect(valWithErrors(42)).toEqual([{path: [], expected: 'void'}]);
    expect(valWithErrors('hello')).toEqual([{path: [], expected: 'void'}]);
});

it('mock', async () => {
    const mocked = await rt.mock();
    expect(mocked).toBeUndefined();
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(validate(mocked)).toBe(true);
});
