/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JitFnIDs} from '../../constants';
import {runType} from '../../runType';

// Deepkit already implements all logic for Partial

describe('Partial typescript utility type makes all properties optional', () => {
    interface Person {
        name: string;
        age: number;
        createdAt: Date;
    }
    const rt = runType<Person>();
    const rtPartial = runType<Partial<Person>>();

    const createdAt = new Date();

    const person = {name: 'John', age: 30, createdAt};
    const partialPerson = {createdAt};

    it('validate', () => {
        const isType = rt.createJitFunction(JitFnIDs.isType);
        const isTypePartial = rtPartial.createJitFunction(JitFnIDs.isType);
        expect(isType(person)).toEqual(true);
        expect(isTypePartial(partialPerson)).toEqual(true);

        expect(isType(partialPerson)).toEqual(false);
        expect(isTypePartial(person)).toEqual(true);
    });

    it('validate errors', () => {
        const typeErrors = rt.createJitFunction(JitFnIDs.typeErrors);
        const typeErrorsPartial = rtPartial.createJitFunction(JitFnIDs.typeErrors);

        expect(typeErrors(person)).toEqual([]);
        expect(typeErrorsPartial(partialPerson)).toEqual([]);

        expect(typeErrors(partialPerson)).toEqual([
            {path: ['name'], expected: 'string'},
            {path: ['age'], expected: 'number'},
        ]);
        expect(typeErrorsPartial(person)).toEqual([]);
    });

    it('json encode/decode', () => {
        const encode = rt.createJitFunction(JitFnIDs.toJsonVal);
        const encodePartial = rtPartial.createJitFunction(JitFnIDs.toJsonVal);
        const decode = rt.createJitFunction(JitFnIDs.fromJsonVal);
        const decodePartial = rtPartial.createJitFunction(JitFnIDs.fromJsonVal);

        expect(decode(JSON.parse(JSON.stringify(encode(person))))).toEqual({name: 'John', age: 30, createdAt});
        expect(decodePartial(JSON.parse(JSON.stringify(encodePartial(partialPerson))))).toEqual({createdAt});
    });

    it('json stringify', () => {
        const stringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const stringifyPartial = rtPartial.createJitFunction(JitFnIDs.jsonStringify);
        const decode = rt.createJitFunction(JitFnIDs.fromJsonVal);
        const decodePartial = rtPartial.createJitFunction(JitFnIDs.fromJsonVal);

        expect(decode(JSON.parse(stringify(person)))).toEqual({name: 'John', age: 30, createdAt});
        expect(decodePartial(JSON.parse(stringifyPartial(partialPerson)))).toEqual({createdAt});
    });

    it('mock', () => {
        const mocked = rt.mock();
        const mockedPartial = rtPartial.mock();
        const isType = rt.createJitFunction(JitFnIDs.isType);
        const isTypePartial = rtPartial.createJitFunction(JitFnIDs.isType);

        expect(Object.keys(mocked)).toEqual(['name', 'age', 'createdAt']);
        expect(Object.keys(mockedPartial).length <= 3).toBe(true);
        expect(isType(mocked)).toBe(true);
        expect(isTypePartial(mockedPartial)).toBe(true);
    });
});
