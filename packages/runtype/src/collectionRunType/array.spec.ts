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

describe('ArrayType', () => {
    const rt = runType<string[]>();
    const rD = runType<Date[]>();

    it('validate string[]', () => {
        const validate = getValidateJitFunction(rt);
        expect(validate([])).toBe(true);
        expect(validate(['hello', 'world'])).toBe(true);
        expect(validate(['hello', 2])).toBe(false);
        expect(validate('hello')).toBe(false);
    });

    it('validate string[] + errors', () => {
        const valWithErrors = getJitValidateWithErrorsFn(rt);
        expect(valWithErrors(['hello', 'world'])).toEqual([]);
        expect(valWithErrors('hello')).toEqual([{path: '', message: 'Expected to be an Array<string>'}]);
        expect(valWithErrors(['hello', 123])).toEqual([{path: '.1', message: 'Expected to be a String'}]);
    });

    it('encode to json', () => {
        const toJson = getJitJsonEncodeFn(rt);
        const typeValue = ['hello', 'world'];
        expect(toJson(typeValue)).toEqual(typeValue);
    });

    it('decode from json', () => {
        const fromJson = getJitJsonDecodeFn(rt);
        const typeValue = ['hello', 'world'];
        const json = JSON.parse(JSON.stringify(typeValue));
        expect(fromJson(json)).toEqual(typeValue);
    });

    it('encode to json date', () => {
        const toJson = getJitJsonEncodeFn(rD);
        const typeValue = [new Date(), new Date()];
        expect(toJson(typeValue)).toBe(typeValue);
    });

    it('decode from json date', () => {
        const fromJson = getJitJsonDecodeFn(rD);
        const typeValue = [new Date(), new Date()];
        const json = JSON.parse(JSON.stringify(typeValue));
        expect(fromJson(json)).toEqual(typeValue);
    });

    it('mock', () => {
        const mock = getJitMockFn(rt);
        expect(mock() instanceof Array).toBe(true);
        const validate = getValidateJitFunction(rt);
        expect(validate(mock())).toBe(true);
    });
});

describe('ArrayType recursion', () => {
    const rt = runType<string[][]>();

    it('validate string[][]', () => {
        const validate = getValidateJitFunction(rt);
        expect(validate([])).toBe(true);
        expect(validate([[]])).toBe(true);
        expect(
            validate([
                ['hello', 'world'],
                ['a', 'b'],
            ])
        ).toBe(true);
        expect(validate([['hello', 2]])).toBe(false);
        expect(validate(['hello'])).toBe(false);
        expect(validate('hello')).toBe(false);
    });

    it('validate string[][] + errors', () => {
        const valWithErrors = getJitValidateWithErrorsFn(rt);
        expect(valWithErrors([])).toEqual([]);
        expect(valWithErrors([[]])).toEqual([]);
        expect(
            valWithErrors([
                ['hello', 'world'],
                ['a', 'b'],
            ])
        ).toEqual([]);
        expect(valWithErrors([['hello', 2]])).toEqual([{path: '.0.1', message: 'Expected to be a String'}]);
        expect(valWithErrors(['hello'])).toEqual([{path: '.0', message: 'Expected to be an Array<string>'}]);
        expect(valWithErrors('hello')).toEqual([{path: '', message: 'Expected to be an Array<Array<string>>'}]);
        expect(valWithErrors(['hello', 'world'])).toEqual([
            {path: '.0', message: 'Expected to be an Array<string>'},
            {path: '.1', message: 'Expected to be an Array<string>'},
        ]);
    });

    it('encode to json', () => {
        const toJson = getJitJsonEncodeFn(rt);
        const typeValue = ['hello', 'world'];
        expect(toJson(typeValue)).toEqual(typeValue);
    });

    it('decode from json', () => {
        const fromJson = getJitJsonDecodeFn(rt);
        const typeValue = ['hello', 'world'];
        const json = JSON.parse(JSON.stringify(typeValue));
        expect(fromJson(json)).toEqual(typeValue);
    });

    it('mock', () => {
        const mock = getJitMockFn(rt);
        const validate = getValidateJitFunction(rt);
        expect(mock() instanceof Array).toBe(true);
        expect(validate(mock())).toBe(true);
    });
});
