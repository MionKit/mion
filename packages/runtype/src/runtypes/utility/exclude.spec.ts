/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {runType} from '../../runType';
import {JitFnIDs} from '../../constants';

// Deepkit already implements all logic for Exclude

describe('Exclude typescript utility type, exclude atomic elements from an union', () => {
    type PersonProp = 'name' | 'age' | 'createdAt';
    const rt = runType<PersonProp>();
    const rtExclude = runType<Exclude<PersonProp, 'age'>>();

    const personProp: PersonProp = 'age';
    const excludeAge: Exclude<PersonProp, 'age'> = 'name';

    it('validate', () => {
        const isType = rt.createJitFunction(JitFnIDs.isType);
        const isTypeExclude = rtExclude.createJitFunction(JitFnIDs.isType);

        expect(isType(personProp)).toEqual(true);
        expect(isTypeExclude(excludeAge)).toEqual(true);

        expect(isTypeExclude(personProp)).toEqual(false);
        expect(isType(excludeAge)).toEqual(true);
    });

    it('validate errors', () => {
        const typeErrors = rt.createJitFunction(JitFnIDs.typeErrors);
        const typeErrorsExclude = rtExclude.createJitFunction(JitFnIDs.typeErrors);

        expect(typeErrors(personProp)).toEqual([]);
        expect(typeErrorsExclude(excludeAge)).toEqual([]);

        expect(typeErrors(excludeAge)).toEqual([]);
        expect(typeErrorsExclude(personProp)).toEqual([{path: [], expected: 'union'}]);
    });

    it('json encode/decode', () => {
        const encode = rt.createJitFunction(JitFnIDs.toJsonVal);
        const encodeExclude = rtExclude.createJitFunction(JitFnIDs.toJsonVal);
        const decode = rt.createJitFunction(JitFnIDs.fromJsonVal);
        const decodeExclude = rtExclude.createJitFunction(JitFnIDs.fromJsonVal);

        expect(decode(JSON.parse(JSON.stringify(encode(personProp))))).toEqual(personProp);
        expect(decodeExclude(JSON.parse(JSON.stringify(encodeExclude(excludeAge))))).toEqual(excludeAge);
    });

    it('json stringify', () => {
        const stringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const stringifyExclude = rtExclude.createJitFunction(JitFnIDs.jsonStringify);
        const decode = rt.createJitFunction(JitFnIDs.fromJsonVal);
        const decodeExclude = rtExclude.createJitFunction(JitFnIDs.fromJsonVal);

        expect(decode(JSON.parse(stringify(personProp)))).toEqual(personProp);
        expect(decodeExclude(JSON.parse(stringifyExclude(excludeAge)))).toEqual(excludeAge);
    });

    it('mock', () => {
        const mocked = rt.mock();
        const mockedExclude = rtExclude.mock();
        const isType = rt.createJitFunction(JitFnIDs.isType);
        const isTypeExclude = rtExclude.createJitFunction(JitFnIDs.isType);

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
        const isType = rt.createJitFunction(JitFnIDs.isType);
        const isTypeExclude = rtExclude.createJitFunction(JitFnIDs.isType);

        expect(isType(shape)).toEqual(true);
        expect(isTypeExclude(excludeShape)).toEqual(true);

        expect(isTypeExclude(shape)).toEqual(false);
        expect(isType(excludeShape)).toEqual(true);
    });

    it('validate errors', () => {
        const typeErrors = rt.createJitFunction(JitFnIDs.typeErrors);
        const typeErrorsExclude = rtExclude.createJitFunction(JitFnIDs.typeErrors);

        expect(typeErrors(shape)).toEqual([]);
        expect(typeErrorsExclude(excludeShape)).toEqual([]);

        expect(typeErrors(excludeShape)).toEqual([]);
        expect(typeErrorsExclude(shape)).toEqual([{path: [], expected: 'union'}]);
    });

    it('json encode/decode', () => {
        const encode = rt.createJitFunction(JitFnIDs.toJsonVal);
        const encodeExclude = rtExclude.createJitFunction(JitFnIDs.toJsonVal);
        const decode = rt.createJitFunction(JitFnIDs.fromJsonVal);
        const decodeExclude = rtExclude.createJitFunction(JitFnIDs.fromJsonVal);

        expect(decode(JSON.parse(JSON.stringify(encode(shape))))).toEqual(shape);
        expect(decodeExclude(JSON.parse(JSON.stringify(encodeExclude(excludeShape))))).toEqual(excludeShape);
    });

    it('json stringify', () => {
        const stringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const stringifyExclude = rtExclude.createJitFunction(JitFnIDs.jsonStringify);
        const decode = rt.createJitFunction(JitFnIDs.fromJsonVal);
        const decodeExclude = rtExclude.createJitFunction(JitFnIDs.fromJsonVal);

        expect(decode(JSON.parse(stringify(shape)))).toEqual(shape);
        expect(decodeExclude(JSON.parse(stringifyExclude(excludeShape)))).toEqual(excludeShape);
    });

    it('mock', () => {
        const mocked = rt.mock();
        const mockedExclude = rtExclude.mock();
        const isType = rt.createJitFunction(JitFnIDs.isType);
        const isTypeExclude = rtExclude.createJitFunction(JitFnIDs.isType);

        expect(isType(mocked)).toBe(true);
        expect(isTypeExclude(mockedExclude)).toBe(true);
        expect(mockedExclude.kind).not.toEqual('circle');
        expect(mockedExclude.radius).toEqual(undefined);
    });
});
