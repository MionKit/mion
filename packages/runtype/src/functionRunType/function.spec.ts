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

type FunctionType = (a: number, b: string, c: boolean) => void;

const rt = runType<FunctionType>();

it('validate function', () => {
    const validate = buildIsTypeJITFn(rt).fn;
    expect(validate((a: number, b: string, c: boolean) => {})).toBe(true);
    expect(
        validate((a: number, b: string, c: boolean) => {
            return;
        })
    ).toBe(true);
    expect(
        validate((a: number, b: string, c: boolean) => {
            console.log(a, b, c);
        })
    ).toBe(true);
    expect(
        validate((a: number, b: string, c: boolean) => {
            throw new Error();
        })
    ).toBe(true);
    expect(validate((a: number, b: string) => {})).toBe(false);
    expect(validate((a: number, b: string, c: boolean, d: string) => {})).toBe(false);
    expect(validate((a: number, b: string, c: number) => {})).toBe(false);
    expect(validate((a: number, b: number, c: boolean) => {})).toBe(false);
    expect(validate((a: string, b: string, c: boolean) => {})).toBe(false);
});

it('validate function + errors', () => {
    const valWithErrors = buildTypeErrorsJITFn(rt).fn;
    expect(valWithErrors((a: number, b: string, c: boolean) => {})).toEqual([]);
    expect(
        valWithErrors((a: number, b: string, c: boolean) => {
            return;
        })
    ).toEqual([]);
    expect(
        valWithErrors((a: number, b: string, c: boolean) => {
            console.log(a, b, c);
        })
    ).toEqual([]);
    expect(
        valWithErrors((a: number, b: string, c: boolean) => {
            throw new Error();
        })
    ).toEqual([]);
    expect(valWithErrors((a: number, b: string) => {})).toEqual([{path: '/2', expected: 'boolean'}]);
    expect(valWithErrors((a: number, b: string, c: boolean, d: string) => {})).toEqual([{path: '/3', expected: 'undefined'}]);
    expect(valWithErrors((a: number, b: string, c: number) => {})).toEqual([
        {path: '/2', expected: 'boolean'},
        {path: '/3', expected: 'undefined'},
    ]);
    expect(valWithErrors((a: number, b: number, c: boolean) => {})).toEqual([
        {path: '/1', expected: 'string'},
        {path: '/2', expected: 'boolean'},
        {path: '/3', expected: 'undefined'},
    ]);
    expect(valWithErrors((a: string, b: string, c: boolean) => {})).toEqual([{path: '/0', expected: 'number'}]);
});

it('encode/decode to json', () => {
    const toJson = buildJsonEncodeJITFn(rt).fn;
    const fromJson = buildJsonDecodeJITFn(rt).fn;
    const typeValue = (a: number, b: string, c: boolean) => {};
    expect(rt.isJsonDecodeRequired).toBe(true);
    expect(rt.isJsonEncodeRequired).toBe(true);
    expect(fromJson(toJson(typeValue))).toEqual(typeValue);
});

it('json stringify', () => {
    const jsonStringify = buildJsonStringifyJITFn(rt).fn;
    const fromJson = buildJsonDecodeJITFn(rt).fn;
    const typeValue = (a: number, b: string, c: boolean) => {};
    const roundTrip = fromJson(JSON.parse(jsonStringify(typeValue)));
    expect(roundTrip).toEqual(typeValue);
});

it('mock', () => {
    const mocked = rt.mock();
    expect(typeof mocked).toBe('function');
    const validate = buildIsTypeJITFn(rt).fn;
    expect(validate(rt.mock())).toBe(true);
});
