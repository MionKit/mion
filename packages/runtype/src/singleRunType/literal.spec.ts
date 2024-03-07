/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../runType';
import {buildJsonEncodeJITFn, buildJsonDecodeJITFn, buildIsTypeJITFn, buildTypeErrorsJITFn, buildMockJITFn} from '../jitCompiler';

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
    const validate2 = buildIsTypeJITFn(rt2);
    const validateA = buildIsTypeJITFn(rtA);
    const validateReg = buildIsTypeJITFn(rtReg);
    const validateReg2 = buildIsTypeJITFn(rtReg2);
    const validateTrue = buildIsTypeJITFn(rtTrue);
    const validateBig = buildIsTypeJITFn(rtBig);
    const validateSym = buildIsTypeJITFn(rtSym);

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
    const valWithErrors2 = buildTypeErrorsJITFn(rt2);
    const valWithErrorsA = buildTypeErrorsJITFn(rtA);
    const valWithErrorsReg = buildTypeErrorsJITFn(rtReg);
    const valWithErrorsReg2 = buildTypeErrorsJITFn(rtReg2);
    const valWithErrorsTrue = buildTypeErrorsJITFn(rtTrue);
    const valWithErrorsBig = buildTypeErrorsJITFn(rtBig);
    const valWithErrorsSym = buildTypeErrorsJITFn(rtSym);

    // success
    expect(valWithErrors2(2)).toEqual([]);
    expect(valWithErrorsA('a')).toEqual([]);
    expect(valWithErrorsReg(/abc/i)).toEqual([]);
    expect(valWithErrorsTrue(true)).toEqual([]);
    expect(valWithErrorsBig(1n)).toEqual([]);
    expect(valWithErrorsSym(sym)).toEqual([]);

    // fail
    expect(valWithErrors2(4)).toEqual([{path: '', expected: 'literal<2>'}]);
    expect(valWithErrorsA('b')).toEqual([{path: '', expected: "literal<'a'>"}]);
    expect(valWithErrorsReg(/hello/i)).toEqual([{path: '', expected: 'literal</abc/i>'}]);
    expect(valWithErrorsReg2(/hello/i)).toEqual([{path: '', expected: 'literal</[\'"]/\\//>'}]);
    expect(valWithErrorsTrue(false)).toEqual([{path: '', expected: 'literal<true>'}]);
    expect(valWithErrorsBig(2n)).toEqual([{path: '', expected: 'literal<1n>'}]);
    expect(valWithErrorsSym(Symbol('nice'))).toEqual([{path: '', expected: `literal<Symbol('hello')>`}]);
});

it('encode to json', () => {
    const toJson2 = buildJsonEncodeJITFn(rt2);
    const toJsonA = buildJsonEncodeJITFn(rtA);
    const toJsonReg = buildJsonEncodeJITFn(rtReg);
    const toJsonTrue = buildJsonEncodeJITFn(rtTrue);
    const toJsonBig = buildJsonEncodeJITFn(rtBig);
    const toJsonSym = buildJsonEncodeJITFn(rtSym);

    expect(toJson2(2)).toEqual(2);
    expect(toJsonA('a')).toEqual('a');
    expect(toJsonReg(/abc/i)).toEqual('/abc/i');
    expect(toJsonTrue(true)).toEqual(true);
    expect(toJsonBig(1n)).toEqual('1n');
    expect(toJsonSym(sym)).toEqual('Symbol:hello');
});

it('decode from json', () => {
    const fromJson2 = buildJsonDecodeJITFn(rt2);
    const fromJsonA = buildJsonDecodeJITFn(rtA);
    const fromJsonReg = buildJsonDecodeJITFn(rtReg);
    const fromJsonTrue = buildJsonDecodeJITFn(rtTrue);
    const fromJsonBig = buildJsonDecodeJITFn(rtBig);
    const fromJsonSym = buildJsonDecodeJITFn(rtSym);

    expect(fromJson2(2)).toEqual(2);
    expect(fromJsonA('a')).toEqual('a');
    expect(fromJsonReg('/abc/i')).toEqual(/abc/i);
    expect(fromJsonTrue(true)).toEqual(true);
    expect(fromJsonBig('1n')).toEqual(1n);
    expect(fromJsonSym('Symbol:hello').toString()).toEqual(sym.toString());
});

it('mock', () => {
    const mock2 = buildMockJITFn(rt2);
    const mockA = buildMockJITFn(rtA);
    const mockReg = buildMockJITFn(rtReg);
    const mockTrue = buildMockJITFn(rtTrue);
    const mockBig = buildMockJITFn(rtBig);
    const mockSym = buildMockJITFn(rtSym);

    expect(mock2()).toEqual(2);
    expect(mockA()).toEqual('a');
    expect(mockReg()).toEqual(/abc/i);
    expect(mockTrue()).toEqual(true);
    expect(mockBig()).toEqual(1n);
    expect(mockSym().toString()).toEqual(sym.toString());
});
