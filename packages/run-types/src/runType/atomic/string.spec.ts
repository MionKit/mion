/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../lib/runType';
import {JitFunctions} from '../../constants.functions';

const rt = runType<string>();

it('validate string', () => {
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(validate('hello')).toBe(true);
    expect(validate(2)).toBe(false);
});

it('validate string + errors', () => {
    const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);
    expect(valWithErrors('hello')).toEqual([]);
    expect(valWithErrors(2)).toEqual([{path: [], expected: 'string'}]);
});

it('mock', async () => {
    const mocked = await rt.mock();
    expect(typeof mocked).toBe('string');
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(validate(mocked)).toBe(true);
});
