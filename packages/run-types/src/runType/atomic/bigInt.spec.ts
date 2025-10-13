/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../lib/runType';
import {JitFunctions} from '../../constants.functions';

const rt = runType<bigint>();

it('validate bigint', () => {
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(validate(1n)).toBe(true);
    expect(validate(42)).toBe(false);
    expect(validate(Infinity)).toBe(false);
    expect(validate(-Infinity)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate bigint + errors', () => {
    const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);
    expect(valWithErrors(1n)).toEqual([]);
    expect(valWithErrors(BigInt(42))).toEqual([]);
    expect(valWithErrors('hello')).toEqual([{path: [], expected: 'bigint'}]);
});

it('mock', async () => {
    const mocked = await rt.mock();
    expect(typeof mocked).toBe('bigint');
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(validate(mocked)).toBe(true);
});
