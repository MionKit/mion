/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JitFunctions} from '../constants';
import {runType} from '../runType';
import {StringFormat} from '../brandedtypes/string.runtypes';

it('validate string max length 2', () => {
    type StringMaxL5 = StringFormat<{maxLength: 5}>;
    const runT = runType<StringMaxL5>();
    const isType = runT.createJitFunction(JitFunctions.isType);
    console.log(isType.toString());
    expect(isType('aaaa')).toBe(true);
    expect(isType('aaaaa')).toBe(true);
    expect(isType('aaaaaa')).toBe(false);
});

it('validate string min length', () => {
    type Min5 = StringFormat<{minLength: 5}>;
    const rt = runType<Min5>();
    const isType = rt.createJitFunction(JitFunctions.isType);
    expect(isType('a'.repeat(4))).toBe(false);
    expect(isType('a'.repeat(5))).toBe(true);
    expect(isType('a'.repeat(6))).toBe(true);
});
