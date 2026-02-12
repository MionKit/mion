/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../createRunType.ts';
import {JitFunctions} from '../../constants.functions.ts';

const rt = runType<never>();

it('validate never', () => {
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(validate(true)).toBe(false);
    expect(validate(false)).toBe(false);
    expect(validate(1)).toBe(false);
    expect(validate('3')).toBe(false);
    expect(validate({})).toBe(false);
});

it('validate never + errors', () => {
    const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);
    expect(valWithErrors(true)).toEqual([{path: [], expected: 'never'}]);
    expect(valWithErrors(false)).toEqual([{path: [], expected: 'never'}]);
    expect(valWithErrors(1)).toEqual([{path: [], expected: 'never'}]);
    expect(valWithErrors('3')).toEqual([{path: [], expected: 'never'}]);
    expect(valWithErrors({})).toEqual([{path: [], expected: 'never'}]);
    expect(valWithErrors('hello')).toEqual([{path: [], expected: 'never'}]);
});

it('mock', async () => {
    await expect(() => rt.mock()).rejects.toThrow('Cannot mock never type.');
});
