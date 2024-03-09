/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../runType';
import {
    buildJsonEncodeJITFn,
    buildJsonDecodeJITFn,
    buildIsTypeJITFn,
    buildTypeErrorsJITFn,
    buildJsonStringifyJITFn,
} from '../jitCompiler';

describe('ArrayType', () => {
    const rt = runType<string[]>();
    const rD = runType<Date[]>();

    it('validate string[]', () => {
        const validate = buildIsTypeJITFn(rt);
        expect(validate([])).toBe(true);
        expect(validate(['hello', 'world'])).toBe(true);
        expect(validate(['hello', 2])).toBe(false);
        expect(validate('hello')).toBe(false);
    });

    it('validate string[] + errors', () => {
        const valWithErrors = buildTypeErrorsJITFn(rt);
        expect(valWithErrors(['hello', 'world'])).toEqual([]);
        expect(valWithErrors('hello')).toEqual([{path: '', expected: 'array<string>'}]);
        expect(valWithErrors(['hello', 123])).toEqual([{path: '/1', expected: 'string'}]);
    });

    it('encode to json', () => {
        const toJson = buildJsonEncodeJITFn(rt);
        const typeValue = ['hello', 'world'];
        expect(toJson(typeValue)).toEqual(typeValue);
    });

    it('decode from json', () => {
        const fromJson = buildJsonDecodeJITFn(rt);
        const typeValue = ['hello', 'world'];
        const json = JSON.parse(JSON.stringify(typeValue));
        expect(fromJson(json)).toEqual(typeValue);
    });

    it('encode to json date', () => {
        const toJson = buildJsonEncodeJITFn(rD);
        const typeValue = [new Date(), new Date()];
        expect(toJson(typeValue)).toBe(typeValue);
    });

    it('decode from json date', () => {
        const fromJson = buildJsonDecodeJITFn(rD);
        const typeValue = [new Date(), new Date()];
        const json = JSON.parse(JSON.stringify(typeValue));
        expect(fromJson(json)).toEqual(typeValue);
    });

    it('json stringify', () => {
        const jsonStringify = buildJsonStringifyJITFn(rt);
        const fromJson = buildJsonDecodeJITFn(rt);
        const typeValue = ['hello', 'world'];
        const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);

        const typeValue2 = [];
        const roundTrip2 = fromJson(JSON.parse(jsonStringify(typeValue2)));
        expect(roundTrip2).toEqual(typeValue2);
    });

    it('mock', () => {
        expect(rt.mock() instanceof Array).toBe(true);
        const validate = buildIsTypeJITFn(rt);
        expect(validate(rt.mock())).toBe(true);
    });
});

describe('ArrayType recursion', () => {
    const rt = runType<string[][]>();

    it('validate string[][]', () => {
        const validate = buildIsTypeJITFn(rt);
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
        const valWithErrors = buildTypeErrorsJITFn(rt);
        expect(valWithErrors([])).toEqual([]);
        expect(valWithErrors([[]])).toEqual([]);
        expect(
            valWithErrors([
                ['hello', 'world'],
                ['a', 'b'],
            ])
        ).toEqual([]);
        expect(valWithErrors([['hello', 2]])).toEqual([{path: '/0/1', expected: 'string'}]);
        expect(valWithErrors(['hello'])).toEqual([{path: '/0', expected: 'array<string>'}]);
        expect(valWithErrors('hello')).toEqual([{path: '', expected: 'array<array<string>>'}]);
        expect(valWithErrors(['hello', 'world'])).toEqual([
            {path: '/0', expected: 'array<string>'},
            {path: '/1', expected: 'array<string>'},
        ]);
    });

    it('encode to json', () => {
        const toJson = buildJsonEncodeJITFn(rt);
        const typeValue = [['hello', 'world'], ['a', 'b'], []];
        expect(toJson(typeValue)).toEqual(typeValue);
    });

    it('decode from json', () => {
        const fromJson = buildJsonDecodeJITFn(rt);
        const typeValue = [['hello', 'world'], ['a', 'b'], []];
        const json = JSON.parse(JSON.stringify(typeValue));
        expect(fromJson(json)).toEqual(typeValue);
    });

    it('json stringify', () => {
        const jsonStringify = buildJsonStringifyJITFn(rt);
        const fromJson = buildJsonDecodeJITFn(rt);
        const typeValue = [['hello', 'world'], ['a', 'b'], []];
        const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
        expect(roundTrip).toEqual(typeValue);

        const typeValue2 = [];
        const roundTrip2 = fromJson(JSON.parse(jsonStringify(typeValue2)));
        expect(roundTrip2).toEqual(typeValue2);
    });

    it('mock', () => {
        const validate = buildIsTypeJITFn(rt);
        expect(rt.mock() instanceof Array).toBe(true);
        expect(validate(rt.mock())).toBe(true);
    });
});
