/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {runType} from '../../lib/createRunType';
import {JitFunctions} from '../../constants.functions';

// Deepkit already implements all logic for Exclude

describe('Exclude typescript utility type, exclude atomic elements from an union', () => {
    type PersonProp = 'name' | 'age' | 'createdAt';
    const rt = runType<PersonProp>();
    const rtExclude = runType<Exclude<PersonProp, 'age'>>();

    const personProp: PersonProp = 'age';
    const excludeAge: Exclude<PersonProp, 'age'> = 'name';

    it('validate', () => {
        const isType = rt.createJitFunction(JitFunctions.isType);
        const isTypeExclude = rtExclude.createJitFunction(JitFunctions.isType);

        expect(isType(personProp)).toEqual(true);
        expect(isTypeExclude(excludeAge)).toEqual(true);

        expect(isTypeExclude(personProp)).toEqual(false);
        expect(isType(excludeAge)).toEqual(true);
    });

    it('validate errors', () => {
        const typeErrors = rt.createJitFunction(JitFunctions.typeErrors);
        const typeErrorsExclude = rtExclude.createJitFunction(JitFunctions.typeErrors);

        expect(typeErrors(personProp)).toEqual([]);
        expect(typeErrorsExclude(excludeAge)).toEqual([]);

        expect(typeErrors(excludeAge)).toEqual([]);
        expect(typeErrorsExclude(personProp)).toEqual([{path: [], expected: 'union'}]);
    });

    it('json encode/decode', () => {
        const encode = rt.createJitFunction(JitFunctions.toJsonVal);
        const encodeExclude = rtExclude.createJitFunction(JitFunctions.toJsonVal);
        const decode = rt.createJitFunction(JitFunctions.fromJsonVal);
        const decodeExclude = rtExclude.createJitFunction(JitFunctions.fromJsonVal);

        expect(decode(JSON.parse(JSON.stringify(encode(personProp))))).toEqual(personProp);
        expect(decodeExclude(JSON.parse(JSON.stringify(encodeExclude(excludeAge))))).toEqual(excludeAge);
    });

    it('json stringify', () => {
        const stringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const stringifyExclude = rtExclude.createJitFunction(JitFunctions.jsonStringify);
        const decode = rt.createJitFunction(JitFunctions.fromJsonVal);
        const decodeExclude = rtExclude.createJitFunction(JitFunctions.fromJsonVal);

        expect(decode(JSON.parse(stringify(personProp)))).toEqual(personProp);
        expect(decodeExclude(JSON.parse(stringifyExclude(excludeAge)))).toEqual(excludeAge);
    });

    it('mock', async () => {
        const mocked = await rt.mock();
        const mockedExclude = await rtExclude.mock();
        const isType = rt.createJitFunction(JitFunctions.isType);
        const isTypeExclude = rtExclude.createJitFunction(JitFunctions.isType);

        expect(['name', 'age', 'createdAt'].includes(mocked)).toBe(true);
        expect(['name', 'createdAt'].includes(mockedExclude)).toBe(true);
        expect(isType(mocked)).toBe(true);
        expect(isTypeExclude(mockedExclude)).toBe(true);
    });
});

describe('Exclude typescript utility type, exclude items from objects union', () => {
    type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
    const rt = runType<Shape>();
    const rtExclude = runType<Exclude<Shape, {kind: 'circle'}>>();

    const shape: Shape = {kind: 'circle', radius: 3};
    const excludeShape: Exclude<Shape, {kind: 'circle'}> = {kind: 'square', x: 5};

    it('validate', () => {
        const isType = rt.createJitFunction(JitFunctions.isType);
        const isTypeExclude = rtExclude.createJitFunction(JitFunctions.isType);

        expect(isType(shape)).toEqual(true);
        expect(isTypeExclude(excludeShape)).toEqual(true);

        expect(isTypeExclude(shape)).toEqual(false);
        expect(isType(excludeShape)).toEqual(true);
    });

    it('validate errors', () => {
        const typeErrors = rt.createJitFunction(JitFunctions.typeErrors);
        const typeErrorsExclude = rtExclude.createJitFunction(JitFunctions.typeErrors);

        expect(typeErrors(shape)).toEqual([]);
        expect(typeErrorsExclude(excludeShape)).toEqual([]);

        expect(typeErrors(excludeShape)).toEqual([]);
        expect(typeErrorsExclude(shape)).toEqual([{path: [], expected: 'union'}]);
    });

    it('json encode/decode', () => {
        const encode = rt.createJitFunction(JitFunctions.toJsonVal);
        const encodeExclude = rtExclude.createJitFunction(JitFunctions.toJsonVal);
        const decode = rt.createJitFunction(JitFunctions.fromJsonVal);
        const decodeExclude = rtExclude.createJitFunction(JitFunctions.fromJsonVal);

        expect(decode(JSON.parse(JSON.stringify(encode(shape))))).toEqual(shape);
        expect(decodeExclude(JSON.parse(JSON.stringify(encodeExclude(excludeShape))))).toEqual(excludeShape);
    });

    it('json stringify', () => {
        const stringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const stringifyExclude = rtExclude.createJitFunction(JitFunctions.jsonStringify);
        const decode = rt.createJitFunction(JitFunctions.fromJsonVal);
        const decodeExclude = rtExclude.createJitFunction(JitFunctions.fromJsonVal);

        expect(decode(JSON.parse(stringify(shape)))).toEqual(shape);
        expect(decodeExclude(JSON.parse(stringifyExclude(excludeShape)))).toEqual(excludeShape);
    });

    it('mock', async () => {
        const mocked = await rt.mock();
        const mockedExclude = await rtExclude.mock();
        const isType = rt.createJitFunction(JitFunctions.isType);
        const isTypeExclude = rtExclude.createJitFunction(JitFunctions.isType);

        expect(isType(mocked)).toBe(true);
        expect(isTypeExclude(mockedExclude)).toBe(true);
        expect(mockedExclude.kind).not.toEqual('circle');
        expect(mockedExclude.radius).toEqual(undefined);
    });
});
