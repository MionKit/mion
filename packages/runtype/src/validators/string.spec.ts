/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {JitFunctions} from '../constants';
import {runType} from '../runType';
import {StringFormat} from '../brandedtypes/string';

it('validate string max length', () => {
    type Max5 = StringFormat<{maxLength: 5}>;
    const rt = runType<Max5>();
    const isType = rt.createJitFunction(JitFunctions.isType);
    expect(isType('a'.repeat(4))).toBe(true);
    expect(isType('a'.repeat(5))).toBe(true);
    expect(isType('a'.repeat(6))).toBe(false);
});

it('validate string min length', () => {
    type Min5 = StringFormat<{minLength: 5}>;
    const rt = runType<Min5>();
    const isType = rt.createJitFunction(JitFunctions.isType);
    expect(isType('a'.repeat(4))).toBe(false);
    expect(isType('a'.repeat(5))).toBe(true);
    expect(isType('a'.repeat(6))).toBe(true);
});
