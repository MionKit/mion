/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {runType} from '../../runType';
import {JitFnIDs} from '../../constants';

// Deepkit already implements all logic for Extract

describe('Extract typescript utility type, extract atomic elements from an union', () => {
    type PersonProp = 'name' | 'age' | 'createdAt';
    const rt = runType<PersonProp>();
    const rtExtract = runType<Extract<PersonProp, 'name' | 'createdAt'>>();

    const personProp: PersonProp = 'age';
    const excludeAge: Extract<PersonProp, 'name' | 'createdAt'> = 'name';

    it('validate', () => {
        const isType = rt.createJitFunction(JitFnIDs.isType);
        const isTypeExtract = rtExtract.createJitFunction(JitFnIDs.isType);

        expect(isType(personProp)).toEqual(true);
        expect(isTypeExtract(excludeAge)).toEqual(true);

        expect(isTypeExtract(personProp)).toEqual(false);
        expect(isType(excludeAge)).toEqual(true);
    });

    it('validate errors', () => {
        const typeErrors = rt.createJitFunction(JitFnIDs.typeErrors);
        const typeErrorsExtract = rtExtract.createJitFunction(JitFnIDs.typeErrors);

        expect(typeErrors(personProp)).toEqual([]);
        expect(typeErrorsExtract(excludeAge)).toEqual([]);

        expect(typeErrors(excludeAge)).toEqual([]);
        expect(typeErrorsExtract(personProp)).toEqual([{path: [], expected: 'union'}]);
    });

    it('json encode/decode', () => {
        const encode = rt.createJitFunction(JitFnIDs.jsonEncode);
        const encodeExtract = rtExtract.createJitFunction(JitFnIDs.jsonEncode);
        const decode = rt.createJitFunction(JitFnIDs.jsonDecode);
        const decodeExtract = rtExtract.createJitFunction(JitFnIDs.jsonDecode);

        expect(decode(JSON.parse(JSON.stringify(encode(personProp))))).toEqual(personProp);
        expect(decodeExtract(JSON.parse(JSON.stringify(encodeExtract(excludeAge))))).toEqual(excludeAge);
    });

    it('json stringify', () => {
        const stringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const stringifyExtract = rtExtract.createJitFunction(JitFnIDs.jsonStringify);
        const decode = rt.createJitFunction(JitFnIDs.jsonDecode);
        const decodeExtract = rtExtract.createJitFunction(JitFnIDs.jsonDecode);

        expect(decode(JSON.parse(stringify(personProp)))).toEqual(personProp);
        expect(decodeExtract(JSON.parse(stringifyExtract(excludeAge)))).toEqual(excludeAge);
    });

    it('mock', () => {
        const mocked = rt.mock();
        const mockedExtract = rtExtract.mock();
        const isType = rt.createJitFunction(JitFnIDs.isType);
        const isTypeExtract = rtExtract.createJitFunction(JitFnIDs.isType);

        expect(['name', 'age', 'createdAt'].includes(mocked)).toBe(true);
        expect(['name', 'createdAt'].includes(mockedExtract)).toBe(true);
        expect(isType(mocked)).toBe(true);
        expect(isTypeExtract(mockedExtract)).toBe(true);
    });
});

describe('Extract typescript utility type, extract items from objects union', () => {
    type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
    type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
    const rt = runType<Shape>();
    const rtExtract = runType<Extract<Shape, ToExtract>>();

    const shape: Shape = {kind: 'circle', radius: 3};
    const excludeShape: Extract<Shape, ToExtract> = {
        kind: 'square',
        x: 5,
    };

    it('validate', () => {
        const isType = rt.createJitFunction(JitFnIDs.isType);
        const isTypeExtract = rtExtract.createJitFunction(JitFnIDs.isType);

        expect(isType(shape)).toEqual(true);
        expect(isTypeExtract(excludeShape)).toEqual(true);

        expect(isTypeExtract(shape)).toEqual(false);
        expect(isType(excludeShape)).toEqual(true);
    });

    it('validate errors', () => {
        const typeErrors = rt.createJitFunction(JitFnIDs.typeErrors);
        const typeErrorsExtract = rtExtract.createJitFunction(JitFnIDs.typeErrors);

        expect(typeErrors(shape)).toEqual([]);
        expect(typeErrorsExtract(excludeShape)).toEqual([]);

        expect(typeErrors(excludeShape)).toEqual([]);
        expect(typeErrorsExtract(shape)).toEqual([{path: [], expected: 'union'}]);
    });

    it('json encode/decode', () => {
        const encode = rt.createJitFunction(JitFnIDs.jsonEncode);
        const encodeExtract = rtExtract.createJitFunction(JitFnIDs.jsonEncode);
        const decode = rt.createJitFunction(JitFnIDs.jsonDecode);
        const decodeExtract = rtExtract.createJitFunction(JitFnIDs.jsonDecode);

        expect(decode(JSON.parse(JSON.stringify(encode(shape))))).toEqual(shape);
        expect(decodeExtract(JSON.parse(JSON.stringify(encodeExtract(excludeShape))))).toEqual(excludeShape);
    });

    it('json stringify', () => {
        const stringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const stringifyExtract = rtExtract.createJitFunction(JitFnIDs.jsonStringify);
        const decode = rt.createJitFunction(JitFnIDs.jsonDecode);
        const decodeExtract = rtExtract.createJitFunction(JitFnIDs.jsonDecode);

        expect(decode(JSON.parse(stringify(shape)))).toEqual(shape);
        expect(decodeExtract(JSON.parse(stringifyExtract(excludeShape)))).toEqual(excludeShape);
    });

    it('mock', () => {
        const mocked = rt.mock();
        const mockedExtract = rtExtract.mock();
        const isType = rt.createJitFunction(JitFnIDs.isType);
        const isTypeExtract = rtExtract.createJitFunction(JitFnIDs.isType);

        expect(isType(mocked)).toBe(true);
        expect(isTypeExtract(mockedExtract)).toBe(true);
        expect(mockedExtract.kind).not.toEqual('circle');
        expect(mockedExtract.radius).toEqual(undefined);
    });
});
