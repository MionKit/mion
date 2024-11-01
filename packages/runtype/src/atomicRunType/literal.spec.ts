/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../runType';

const reg = /abc/i;
const reg2 = /['"]\/ \\ \//; // regexp with characters that can be problematic in jit code if not correctly scaped
const sym = Symbol('hello');
const rt2 = runType<2>();
const rtA = runType<'a'>();
const rtReg = runType<typeof reg>();
const rtReg2 = runType<typeof reg2>();
const rtTrue = runType<true>();
const rtBig = runType<1n>();
const rtSym = runType<typeof sym>();

it('validate literal', () => {
    const validate2 = rt2.isType;
    const validateA = rtA.isType;
    const validateReg = rtReg.isType;
    const validateReg2 = rtReg2.isType;
    const validateTrue = rtTrue.isType;
    const validateBig = rtBig.isType;
    const validateSym = rtSym.isType;

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
    const valWithErrors2 = rt2.typeErrors;
    const valWithErrorsA = rtA.typeErrors;
    const valWithErrorsReg = rtReg.typeErrors;
    const valWithErrorsReg2 = rtReg2.typeErrors;
    const valWithErrorsTrue = rtTrue.typeErrors;
    const valWithErrorsBig = rtBig.typeErrors;
    const valWithErrorsSym = rtSym.typeErrors;

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

it('encode to json', () => {
    const toJson2 = rt2.jsonEncode;
    const toJsonA = rtA.jsonEncode;
    const toJsonReg = rtReg.jsonEncode;
    const toJsonTrue = rtTrue.jsonEncode;
    const toJsonBig = rtBig.jsonEncode;
    const toJsonSym = rtSym.jsonEncode;

    expect(toJson2(2)).toEqual(2);
    expect(toJsonA('a')).toEqual('a');
    expect(toJsonReg(/abc/i)).toEqual('/abc/i');
    expect(toJsonTrue(true)).toEqual(true);
    expect(toJsonBig(1n)).toEqual('1');
    expect(toJsonSym(sym)).toEqual('Symbol:hello');
});

it('decode from json', () => {
    const fromJson2 = rt2.jsonDecode;
    const fromJsonA = rtA.jsonDecode;
    const fromJsonReg = rtReg.jsonDecode;
    const fromJsonTrue = rtTrue.jsonDecode;
    const fromJsonBig = rtBig.jsonDecode;
    const fromJsonSym = rtSym.jsonDecode;

    expect(fromJson2(2)).toEqual(2);
    expect(fromJsonA('a')).toEqual('a');
    expect(fromJsonReg('/abc/i')).toEqual(/abc/i);
    expect(fromJsonTrue(true)).toEqual(true);
    expect(fromJsonBig('1')).toEqual(1n);
    expect(fromJsonSym('Symbol:hello').toString()).toEqual(sym.toString());
});

it('json stringify', () => {
    const jsonStringify2 = rt2.jsonStringify;
    const jsonStringifyA = rtA.jsonStringify;
    const jsonStringifyReg = rtReg.jsonStringify;
    const jsonStringifyTrue = rtTrue.jsonStringify;
    const jsonStringifyBig = rtBig.jsonStringify;
    const jsonStringifySym = rtSym.jsonStringify;

    const fromJson2 = rt2.jsonDecode;
    const fromJsonA = rtA.jsonDecode;
    const fromJsonReg = rtReg.jsonDecode;
    const fromJsonTrue = rtTrue.jsonDecode;
    const fromJsonBig = rtBig.jsonDecode;
    const fromJsonSym = rtSym.jsonDecode;

    const typeValue2 = null;
    const roundTrip2 = fromJson2(JSON.parse(jsonStringify2(typeValue2)));
    expect(roundTrip2).toEqual(typeValue2);
    const typeValueA = 'a';
    const roundTripA = fromJsonA(JSON.parse(jsonStringifyA(typeValueA)));
    expect(roundTripA).toEqual(typeValueA);
    const typeValueReg = /abc/i;
    const roundTripReg = fromJsonReg(JSON.parse(jsonStringifyReg(typeValueReg)));
    expect(roundTripReg).toEqual(typeValueReg);
    const typeValueTrue = true;
    const roundTripTrue = fromJsonTrue(JSON.parse(jsonStringifyTrue(typeValueTrue)));
    expect(roundTripTrue).toEqual(typeValueTrue);
    const typeValueBig = 1n;
    const roundTripBig = fromJsonBig(JSON.parse(jsonStringifyBig(typeValueBig)));
    expect(roundTripBig).toEqual(typeValueBig);
    const typeValueSym = sym;
    const roundTripSym = fromJsonSym(JSON.parse(jsonStringifySym(typeValueSym)));
    expect(roundTripSym.toString()).toEqual(typeValueSym.toString());
});

it('mock', () => {
    expect(rt2.mock()).toEqual(2);
    expect(rtA.mock()).toEqual('a');
    expect(rtReg.mock()).toEqual(/abc/i);
    expect(rtTrue.mock()).toEqual(true);
    expect(rtBig.mock()).toEqual(1n);
    expect(rtSym.mock().toString()).toEqual(sym.toString());
});
