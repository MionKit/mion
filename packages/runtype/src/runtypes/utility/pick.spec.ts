/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {runType} from '../../runType';
import {JitFnIDs} from '../../constants';

// Deepkit already implements all logic for Pick

describe('Pick typescript utility type only pick selected properties', () => {
    interface Person {
        name: string;
        age: number;
        createdAt: Date;
    }
    const rt = runType<Person>();
    const rtPick = runType<Pick<Person, 'name' | 'createdAt'>>();

    const createdAt = new Date();

    const person: Person = {name: 'John', age: 30, createdAt};
    const pickedPerson: Pick<Person, 'name' | 'createdAt'> = {name: 'John', createdAt};

    it('validate', () => {
        const isType = rt.createJitFunction(JitFnIDs.isType);
        const isTypePick = rtPick.createJitFunction(JitFnIDs.isType);

        expect(isType(person)).toEqual(true);
        expect(isTypePick(pickedPerson)).toEqual(true);

        expect(isTypePick(person)).toEqual(true);
        expect(isType(pickedPerson)).toEqual(false);
    });

    it('validate errors', () => {
        const typeErrors = rt.createJitFunction(JitFnIDs.typeErrors);
        const typeErrorsPick = rtPick.createJitFunction(JitFnIDs.typeErrors);

        expect(typeErrors(person)).toEqual([]);
        expect(typeErrorsPick(pickedPerson)).toEqual([]);

        expect(typeErrors(pickedPerson)).toEqual([{path: ['age'], expected: 'number'}]);
        expect(typeErrorsPick(person)).toEqual([]);
    });

    it('json encode/decode', () => {
        const encode = rt.createJitFunction(JitFnIDs.toJsonVal);
        const encodePick = rtPick.createJitFunction(JitFnIDs.toJsonVal);
        const decode = rt.createJitFunction(JitFnIDs.fromJsonVal);
        const decodePick = rtPick.createJitFunction(JitFnIDs.fromJsonVal);

        expect(decode(JSON.parse(JSON.stringify(encode(person))))).toEqual(person);
        expect(decodePick(JSON.parse(JSON.stringify(encodePick(pickedPerson))))).toEqual(pickedPerson);

        // remove extra properties from Pick type

        const hasUnknownKeys = rtPick.createJitFunction(JitFnIDs.hasUnknownKeys);
        const unknownKeysToUndefined = rtPick.createJitFunction(JitFnIDs.unknownKeysToUndefined);
        const stripUnknownKeys = rtPick.createJitFunction(JitFnIDs.stripUnknownKeys);

        const fromJsonSafeThrow = (val) => {
            if (hasUnknownKeys(val)) throw new Error('Unknown properties in JSON');
            return decodePick(val);
        };
        const fromJsonSafeUndefined = (val) => {
            unknownKeysToUndefined(val);
            return decodePick(val);
        };
        const fromJsonSafeStrip = (val) => {
            stripUnknownKeys(val);
            return decodePick(val);
        };

        const person1 = JSON.parse(JSON.stringify(encodePick(person)));
        const person2 = JSON.parse(JSON.stringify(encodePick(person)));
        const person3 = JSON.parse(JSON.stringify(encodePick(person)));

        expect(() => fromJsonSafeThrow(person1)).toThrow('Unknown properties in JSON');
        expect(fromJsonSafeUndefined(person2)).toEqual({name: 'John', createdAt, age: undefined});
        expect(fromJsonSafeStrip(person3)).toEqual({name: 'John', createdAt});
    });

    it('json stringify', () => {
        const stringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const stringifyPick = rtPick.createJitFunction(JitFnIDs.jsonStringify);
        const decode = rt.createJitFunction(JitFnIDs.fromJsonVal);
        const decodePick = rtPick.createJitFunction(JitFnIDs.fromJsonVal);

        expect(decode(JSON.parse(stringify(person)))).toEqual(person);
        // json stringify directly removes unknown keys
        expect(decodePick(JSON.parse(stringifyPick(person)))).toEqual(pickedPerson);
    });

    it('mock', () => {
        const mocked = rt.mock();
        const mockedPick = rtPick.mock();
        const isType = rt.createJitFunction(JitFnIDs.isType);
        const isTypePick = rtPick.createJitFunction(JitFnIDs.isType);

        expect(Object.keys(mocked)).toEqual(['name', 'age', 'createdAt']);
        expect(Object.keys(mockedPick)).toEqual(['name', 'createdAt']);
        expect(isType(mocked)).toBe(true);
        expect(isTypePick(mockedPick)).toBe(true);
    });
});
