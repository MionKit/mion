/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {runType} from '../../createRunType';
import {JitFunctions} from '../../constants.functions';

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
        const isType = rt.createJitFunction(JitFunctions.isType);
        const isTypePick = rtPick.createJitFunction(JitFunctions.isType);

        expect(isType(person)).toEqual(true);
        expect(isTypePick(pickedPerson)).toEqual(true);

        expect(isTypePick(person)).toEqual(true);
        expect(isType(pickedPerson)).toEqual(false);
    });

    it('validate errors', () => {
        const typeErrors = rt.createJitFunction(JitFunctions.typeErrors);
        const typeErrorsPick = rtPick.createJitFunction(JitFunctions.typeErrors);

        expect(typeErrors(person)).toEqual([]);
        expect(typeErrorsPick(pickedPerson)).toEqual([]);

        expect(typeErrors(pickedPerson)).toEqual([{path: ['age'], expected: 'number'}]);
        expect(typeErrorsPick(person)).toEqual([]);
    });

    it('json encode/decode', () => {
        const encode = rt.createJitFunction(JitFunctions.prepareForJson);
        const encodePick = rtPick.createJitFunction(JitFunctions.prepareForJson);
        const decode = rt.createJitFunction(JitFunctions.restoreFromJson);
        const decodePick = rtPick.createJitFunction(JitFunctions.restoreFromJson);

        expect(decode(JSON.parse(JSON.stringify(encode(person))))).toEqual(person);
        expect(decodePick(JSON.parse(JSON.stringify(encodePick(pickedPerson))))).toEqual(pickedPerson);

        // remove extra properties from Pick type

        const hasUnknownKeys = rtPick.createJitFunction(JitFunctions.hasUnknownKeys);
        const unknownKeysToUndefined = rtPick.createJitFunction(JitFunctions.unknownKeysToUndefined);
        const stripUnknownKeys = rtPick.createJitFunction(JitFunctions.stripUnknownKeys);

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
        const stringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const stringifyPick = rtPick.createJitFunction(JitFunctions.jsonStringify);
        const decode = rt.createJitFunction(JitFunctions.restoreFromJson);
        const decodePick = rtPick.createJitFunction(JitFunctions.restoreFromJson);

        expect(decode(JSON.parse(stringify(person)))).toEqual(person);
        // json stringify directly removes unknown keys
        expect(decodePick(JSON.parse(stringifyPick(person)))).toEqual(pickedPerson);
    });

    it('mock', async () => {
        const mocked = await rt.mock();
        const mockedPick = await rtPick.mock();
        const isType = rt.createJitFunction(JitFunctions.isType);
        const isTypePick = rtPick.createJitFunction(JitFunctions.isType);

        expect(Object.keys(mocked)).toEqual(['name', 'age', 'createdAt']);
        expect(Object.keys(mockedPick)).toEqual(['name', 'createdAt']);
        expect(isType(mocked)).toBe(true);
        expect(isTypePick(mockedPick)).toBe(true);
    });
});
