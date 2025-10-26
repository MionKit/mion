/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../createRunType';
import {JitFunctions} from '../../constants.functions';

const rt = runType<object>();

it('validate object', () => {
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(validate({})).toBe(true);
    expect(validate({a: 42, b: 'hello'})).toBe(true);
    expect(validate(null)).toBe(false);
    expect(validate(undefined)).toBe(false);
    expect(validate(42)).toBe(false);
    expect(validate('hello')).toBe(false);
});

it('validate object + errors', () => {
    const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);
    expect(valWithErrors({})).toEqual([]);
    expect(valWithErrors({a: 42, b: 'hello'})).toEqual([]);
    expect(valWithErrors(null)).toEqual([{path: [], expected: 'objectLiteral'}]);
    expect(valWithErrors(undefined)).toEqual([{path: [], expected: 'objectLiteral'}]);
    expect(valWithErrors(42)).toEqual([{path: [], expected: 'objectLiteral'}]);
    expect(valWithErrors('hello')).toEqual([{path: [], expected: 'objectLiteral'}]);
});

it('mock', async () => {
    const mocked = await rt.mock();
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(validate(mocked)).toBe(true);
});
