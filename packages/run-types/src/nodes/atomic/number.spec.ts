/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../createRunType.ts';
import {JitFunctions} from '../../constants.functions.ts';

const rt = runType<number>();

it('validate number', () => {
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(validate(42)).toBe(true);
    expect(validate(Infinity)).toBe(false);
    expect(validate(-Infinity)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate number + errors', () => {
    const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);
    expect(valWithErrors(42)).toEqual([]);
    expect(valWithErrors('hello')).toEqual([{path: [], expected: 'number'}]);
});

it('mock', async () => {
    const mocked = await rt.mock();
    expect(typeof mocked).toBe('number');
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(validate(mocked)).toBe(true);
});
