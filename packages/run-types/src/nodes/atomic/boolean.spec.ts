/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {it, expect} from 'vitest';
import {runType} from '../../createRunType.ts';
import {JitFunctions} from '../../constants.functions.ts';

const rt = runType<boolean>();

it('validate boolean', () => {
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(validate(true)).toBe(true);
    expect(validate(false)).toBe(true);
    expect(validate(42)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate boolean + errors', () => {
    const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);
    expect(valWithErrors(true)).toEqual([]);
    expect(valWithErrors(false)).toEqual([]);
    expect(valWithErrors(42)).toEqual([{path: [], expected: 'boolean'}]);
    expect(valWithErrors('hello')).toEqual([{path: [], expected: 'boolean'}]);
});

it('mock', async () => {
    const mocked = await rt.mock();
    expect(typeof mocked).toBe('boolean');
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(validate(mocked)).toBe(true);
});
