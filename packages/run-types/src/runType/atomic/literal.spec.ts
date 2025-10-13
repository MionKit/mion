/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../lib/runType';
import {JitFunctions} from '../../constants.functions';

const reg = /abc/i;
const reg2 = /['"]\/ \\ \//; // regexp with characters that can be problematic in jit code if not correctly scaped
const sym = Symbol('hello');
const rt2 = runType<2>();
const rtA = runType<'a'>();
const rtReg = runType<typeof reg>(); // eslint-disable-line @mionkit/no-typeof-runtype
const rtReg2 = runType<typeof reg2>(); // eslint-disable-line @mionkit/no-typeof-runtype
const rtTrue = runType<true>();
const rtBig = runType<1n>();
const rtSym = runType<typeof sym>(); // eslint-disable-line @mionkit/no-typeof-runtype

it('validate literal', () => {
    const validate2 = rt2.createJitFunction(JitFunctions.isType);
    const validateA = rtA.createJitFunction(JitFunctions.isType);
    const validateReg = rtReg.createJitFunction(JitFunctions.isType);
    const validateReg2 = rtReg2.createJitFunction(JitFunctions.isType);
    const validateTrue = rtTrue.createJitFunction(JitFunctions.isType);
    const validateBig = rtBig.createJitFunction(JitFunctions.isType);
    const validateSym = rtSym.createJitFunction(JitFunctions.isType);

    // success
    expect(validate2(2)).toBe(true);
    expect(validateA('a')).toBe(true);
    expect(validateReg(reg)).toEqual(true);
    expect(validateReg2(reg2)).toEqual(true);
    expect(validateTrue(true)).toBe(true);
    expect(validateBig(1n)).toBe(true);
    expect(validateSym(sym)).toBe(true);

    // fail
    expect(validate2(4)).toBe(false);
    expect(validateA('b')).toBe(false);
    expect(validateReg(/asdf/i)).toBe(false);
    expect(validateTrue(false)).toBe(false);
    expect(validateBig(2n)).toBe(false);
    expect(validateSym(Symbol('nice'))).toBe(false);
});

it('validate literal + errors', () => {
    const valWithErrors2 = rt2.createJitFunction(JitFunctions.typeErrors);
    const valWithErrorsA = rtA.createJitFunction(JitFunctions.typeErrors);
    const valWithErrorsReg = rtReg.createJitFunction(JitFunctions.typeErrors);
    const valWithErrorsReg2 = rtReg2.createJitFunction(JitFunctions.typeErrors);
    const valWithErrorsTrue = rtTrue.createJitFunction(JitFunctions.typeErrors);
    const valWithErrorsBig = rtBig.createJitFunction(JitFunctions.typeErrors);
    const valWithErrorsSym = rtSym.createJitFunction(JitFunctions.typeErrors);

    // success
    expect(valWithErrors2(2)).toEqual([]);
    expect(valWithErrorsA('a')).toEqual([]);
    expect(valWithErrorsReg(/abc/i)).toEqual([]);
    expect(valWithErrorsTrue(true)).toEqual([]);
    expect(valWithErrorsBig(1n)).toEqual([]);
    expect(valWithErrorsSym(sym)).toEqual([]);

    // fail
    expect(valWithErrors2(4)).toEqual([{path: [], expected: 'literal'}]);
    expect(valWithErrorsA('b')).toEqual([{path: [], expected: 'literal'}]);
    expect(valWithErrorsReg(/hello/i)).toEqual([{path: [], expected: 'literal'}]);
    expect(valWithErrorsReg2(/hello/i)).toEqual([{path: [], expected: 'literal'}]);
    expect(valWithErrorsTrue(false)).toEqual([{path: [], expected: 'literal'}]);
    expect(valWithErrorsBig(2n)).toEqual([{path: [], expected: 'literal'}]);
    expect(valWithErrorsSym(Symbol('nice'))).toEqual([{path: [], expected: 'literal'}]);
});

it('mock', async () => {
    const mocked2 = await rt2.mock();
    const mockedA = await rtA.mock();
    const mockedReg = await rtReg.mock();
    const mockedTrue = await rtTrue.mock();
    const mockedBig = await rtBig.mock();
    const mockedSym = await rtSym.mock();

    expect(mocked2).toEqual(2);
    expect(mockedA).toEqual('a');
    expect(mockedReg).toEqual(/abc/i);
    expect(mockedTrue).toEqual(true);
    expect(mockedBig).toEqual(1n);
    expect(mockedSym.toString()).toEqual(sym.toString());
});
