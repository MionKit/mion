/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JitFunctions} from '../../constants';
import {runType} from '../../lib/runType';

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
        const isType = rt.createJitFunction(JitFunctions.isType);
        const isTypePartial = rtPartial.createJitFunction(JitFunctions.isType);
        expect(isType(person)).toEqual(true);
        expect(isTypePartial(partialPerson)).toEqual(true);

        expect(isType(partialPerson)).toEqual(false);
        expect(isTypePartial(person)).toEqual(true);
    });

    it('validate errors', () => {
        const typeErrors = rt.createJitFunction(JitFunctions.typeErrors);
        const typeErrorsPartial = rtPartial.createJitFunction(JitFunctions.typeErrors);

        expect(typeErrors(person)).toEqual([]);
        expect(typeErrorsPartial(partialPerson)).toEqual([]);

        expect(typeErrors(partialPerson)).toEqual([
            {path: ['name'], expected: 'string'},
            {path: ['age'], expected: 'number'},
        ]);
        expect(typeErrorsPartial(person)).toEqual([]);
    });

    it('json encode/decode', () => {
        const encode = rt.createJitFunction(JitFunctions.toJsonVal);
        const encodePartial = rtPartial.createJitFunction(JitFunctions.toJsonVal);
        const decode = rt.createJitFunction(JitFunctions.fromJsonVal);
        const decodePartial = rtPartial.createJitFunction(JitFunctions.fromJsonVal);

        expect(decode(JSON.parse(JSON.stringify(encode(person))))).toEqual({name: 'John', age: 30, createdAt});
        expect(decodePartial(JSON.parse(JSON.stringify(encodePartial(partialPerson))))).toEqual({createdAt});
    });

    it('json stringify', () => {
        const stringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const stringifyPartial = rtPartial.createJitFunction(JitFunctions.jsonStringify);
        const decode = rt.createJitFunction(JitFunctions.fromJsonVal);
        const decodePartial = rtPartial.createJitFunction(JitFunctions.fromJsonVal);

        expect(decode(JSON.parse(stringify(person)))).toEqual({name: 'John', age: 30, createdAt});
        expect(decodePartial(JSON.parse(stringifyPartial(partialPerson)))).toEqual({createdAt});
    });

    it('mock', async () => {
        const mocked = await rt.mock();
        const mockedPartial = await rtPartial.mock();
        const isType = rt.createJitFunction(JitFunctions.isType);
        const isTypePartial = rtPartial.createJitFunction(JitFunctions.isType);

        expect(Object.keys(mocked)).toEqual(['name', 'age', 'createdAt']);
        expect(Object.keys(mockedPartial).length <= 3).toBe(true);
        expect(isType(mocked)).toBe(true);
        expect(isTypePartial(mockedPartial)).toBe(true);
    });
});
