/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../runType';
import {
    getJitJsonEncodeFn,
    getJitJsonDecodeFn,
    getValidateJitFunction,
    getJitValidateWithErrorsFn,
    getJitMockFn,
} from '../jitCompiler';

const reg = /abc/i;
const reg2 = /['"]\/\\\//; // regexp with characters that can be problematic in jit code if not correctly scaped
const sym = Symbol('hello');
const rt2 = runType<2>();
const rtA = runType<'a'>();
const rtReg = runType<typeof reg>();
const rtReg2 = runType<typeof reg2>();
const rtTrue = runType<true>();
const rtBig = runType<1n>();
const rtSym = runType<typeof sym>();

it('validate literal', () => {
    const validate2 = getValidateJitFunction(rt2);
    const validateA = getValidateJitFunction(rtA);
    const validateReg = getValidateJitFunction(rtReg);
    const validateReg2 = getValidateJitFunction(rtReg2);
    const validateTrue = getValidateJitFunction(rtTrue);
    const validateBig = getValidateJitFunction(rtBig);
    const validateSym = getValidateJitFunction(rtSym);

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
    const valWithErrors2 = getJitValidateWithErrorsFn(rt2);
    const valWithErrorsA = getJitValidateWithErrorsFn(rtA);
    const valWithErrorsReg = getJitValidateWithErrorsFn(rtReg);
    const valWithErrorsReg2 = getJitValidateWithErrorsFn(rtReg2);
    const valWithErrorsTrue = getJitValidateWithErrorsFn(rtTrue);
    const valWithErrorsBig = getJitValidateWithErrorsFn(rtBig);
    const valWithErrorsSym = getJitValidateWithErrorsFn(rtSym);

    // success
    expect(valWithErrors2(2)).toEqual([]);
    expect(valWithErrorsA('a')).toEqual([]);
    expect(valWithErrorsReg(/abc/i)).toEqual([]);
    expect(valWithErrorsTrue(true)).toEqual([]);
    expect(valWithErrorsBig(1n)).toEqual([]);
    expect(valWithErrorsSym(sym)).toEqual([]);

    // fail
    expect(valWithErrors2(4)).toEqual([{path: '', message: 'Expected to be 2'}]);
    expect(valWithErrorsA('b')).toEqual([{path: '', message: 'Expected to be a'}]);
    expect(valWithErrorsReg(/hello/i)).toEqual([{path: '', message: 'Expected to be a RegExp: /abc/i'}]);
    expect(valWithErrorsReg2(/hello/i)).toEqual([{path: '', message: 'Expected to be a RegExp: /[\'"]/\\//'}]);
    expect(valWithErrorsTrue(false)).toEqual([{path: '', message: 'Expected to be true'}]);
    expect(valWithErrorsBig(2n)).toEqual([{path: '', message: 'Expected to be a bigint: 1n'}]);
    expect(valWithErrorsSym(Symbol('nice'))).toEqual([{path: '', message: 'Expected to be a symbol: Symbol(hello)'}]);
});

it('encode to json', () => {
    const toJson2 = getJitJsonEncodeFn(rt2);
    const toJsonA = getJitJsonEncodeFn(rtA);
    const toJsonReg = getJitJsonEncodeFn(rtReg);
    const toJsonTrue = getJitJsonEncodeFn(rtTrue);
    const toJsonBig = getJitJsonEncodeFn(rtBig);
    const toJsonSym = getJitJsonEncodeFn(rtSym);

    expect(toJson2(2)).toEqual(2);
    expect(toJsonA('a')).toEqual('a');
    expect(toJsonReg(/abc/i)).toEqual('/abc/i');
    expect(toJsonTrue(true)).toEqual(true);
    expect(toJsonBig(1n)).toEqual('1n');
    expect(toJsonSym(sym)).toEqual('Symbol:hello');
});

it('decode from json', () => {
    const fromJson2 = getJitJsonDecodeFn(rt2);
    const fromJsonA = getJitJsonDecodeFn(rtA);
    const fromJsonReg = getJitJsonDecodeFn(rtReg);
    const fromJsonTrue = getJitJsonDecodeFn(rtTrue);
    const fromJsonBig = getJitJsonDecodeFn(rtBig);
    const fromJsonSym = getJitJsonDecodeFn(rtSym);

    expect(fromJson2(2)).toEqual(2);
    expect(fromJsonA('a')).toEqual('a');
    expect(fromJsonReg('/abc/i')).toEqual(/abc/i);
    expect(fromJsonTrue(true)).toEqual(true);
    expect(fromJsonBig('1n')).toEqual(1n);
    expect(fromJsonSym('Symbol:hello').toString()).toEqual(sym.toString());
});

it('mock', () => {
    const mock2 = getJitMockFn(rt2);
    const mockA = getJitMockFn(rtA);
    const mockReg = getJitMockFn(rtReg);
    const mockTrue = getJitMockFn(rtTrue);
    const mockBig = getJitMockFn(rtBig);
    const mockSym = getJitMockFn(rtSym);

    expect(mock2()).toEqual(2);
    expect(mockA()).toEqual('a');
    expect(mockReg()).toEqual(/abc/i);
    expect(mockTrue()).toEqual(true);
    expect(mockBig()).toEqual(1n);
    expect(mockSym().toString()).toEqual(sym.toString());
});
