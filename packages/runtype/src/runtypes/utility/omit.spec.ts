/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {runType} from '../../runType';
import {JitFnIDs} from '../../constants';

// Deepkit already implements all logic for Omit

describe('Omit typescript utility type only pick selected properties', () => {
    interface Person {
        name: string;
        age: number;
        createdAt: Date;
    }
    const rt = runType<Person>();
    const rtOmit = runType<Omit<Person, 'age'>>();

    const createdAt = new Date();

    const person: Person = {name: 'John', age: 30, createdAt};
    const omitPerson: Omit<Person, 'age'> = {name: 'John', createdAt};

    it('validate', () => {
        const isType = rt.createJitFunction(JitFnIDs.isType);
        const isTypeOmit = rtOmit.createJitFunction(JitFnIDs.isType);

        expect(isType(person)).toEqual(true);
        expect(isTypeOmit(omitPerson)).toEqual(true);

        expect(isTypeOmit(person)).toEqual(true);
        expect(isType(omitPerson)).toEqual(false);
    });

    it('validate errors', () => {
        const typeErrors = rt.createJitFunction(JitFnIDs.typeErrors);
        const typeErrorsOmit = rtOmit.createJitFunction(JitFnIDs.typeErrors);

        expect(typeErrors(person)).toEqual([]);
        expect(typeErrorsOmit(omitPerson)).toEqual([]);

        expect(typeErrors(omitPerson)).toEqual([{path: ['age'], expected: 'number'}]);
        expect(typeErrorsOmit(person)).toEqual([]);
    });

    it('json encode/decode', () => {
        const encode = rt.createJitFunction(JitFnIDs.jsonEncode);
        const encodeOmit = rtOmit.createJitFunction(JitFnIDs.jsonEncode);
        const decode = rt.createJitFunction(JitFnIDs.jsonDecode);
        const decodeOmit = rtOmit.createJitFunction(JitFnIDs.jsonDecode);

        expect(decode(JSON.parse(JSON.stringify(encode(person))))).toEqual(person);
        expect(decodeOmit(JSON.parse(JSON.stringify(encodeOmit(omitPerson))))).toEqual(omitPerson);

        // remove extra properties from Omit type

        const hasUnknownKeys = rtOmit.createJitFunction(JitFnIDs.hasUnknownKeys);
        const unknownKeysToUndefined = rtOmit.createJitFunction(JitFnIDs.unknownKeysToUndefined);
        const stripUnknownKeys = rtOmit.createJitFunction(JitFnIDs.stripUnknownKeys);

        const fromJsonSafeThrow = (val) => {
            if (hasUnknownKeys(val)) throw new Error('Unknown properties in JSON');
            return decodeOmit(val);
        };
        const fromJsonSafeUndefined = (val) => {
            unknownKeysToUndefined(val);
            return decodeOmit(val);
        };
        const fromJsonSafeStrip = (val) => {
            stripUnknownKeys(val);
            return decodeOmit(val);
        };

        const person1 = JSON.parse(JSON.stringify(encodeOmit(person)));
        const person2 = JSON.parse(JSON.stringify(encodeOmit(person)));
        const person3 = JSON.parse(JSON.stringify(encodeOmit(person)));

        expect(() => fromJsonSafeThrow(person1)).toThrow('Unknown properties in JSON');
        expect(fromJsonSafeUndefined(person2)).toEqual({name: 'John', createdAt, age: undefined});
        expect(fromJsonSafeStrip(person3)).toEqual({name: 'John', createdAt});
    });

    it('json stringify', () => {
        const stringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const stringifyOmit = rtOmit.createJitFunction(JitFnIDs.jsonStringify);
        const decode = rt.createJitFunction(JitFnIDs.jsonDecode);
        const decodeOmit = rtOmit.createJitFunction(JitFnIDs.jsonDecode);

        expect(decode(JSON.parse(stringify(person)))).toEqual(person);
        // json stringify directly removes unknown keys
        expect(decodeOmit(JSON.parse(stringifyOmit(person)))).toEqual(omitPerson);
    });

    it('mock', () => {
        const mocked = rt.mock();
        const mockedOmit = rtOmit.mock();
        const isType = rt.createJitFunction(JitFnIDs.isType);
        const isTypeOmit = rtOmit.createJitFunction(JitFnIDs.isType);

        expect(Object.keys(mocked)).toEqual(['name', 'age', 'createdAt']);
        expect(Object.keys(mockedOmit)).toEqual(['name', 'createdAt']);
        expect(isType(mocked)).toBe(true);
        expect(isTypeOmit(mockedOmit)).toBe(true);
    });
});
