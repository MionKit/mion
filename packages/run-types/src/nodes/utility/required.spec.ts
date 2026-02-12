/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JitFunctions} from '../../constants.functions.ts';
import {runType} from '../../createRunType.ts';

// Deepkit already implements all logic for Required

describe('Required typescript utility type makes all properties required', () => {
    interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
    }
    const rtRequired = runType<MaybePerson>();
    const rt = runType<Required<MaybePerson>>();

    const createdAt = new Date();

    const person = {name: 'John', age: 30, createdAt};
    const maybePerson = {createdAt};

    it('validate', () => {
        const isType = rt.createJitFunction(JitFunctions.isType);
        const isTypeMaybe = rtRequired.createJitFunction(JitFunctions.isType);
        expect(isType(person)).toEqual(true);
        expect(isTypeMaybe(maybePerson)).toEqual(true);

        expect(isType(maybePerson)).toEqual(false);
        expect(isTypeMaybe(person)).toEqual(true);
    });

    it('validate errors', () => {
        const typeErrors = rt.createJitFunction(JitFunctions.typeErrors);
        const typeErrorsMaybe = rtRequired.createJitFunction(JitFunctions.typeErrors);

        expect(typeErrors(person)).toEqual([]);
        expect(typeErrorsMaybe(maybePerson)).toEqual([]);

        expect(typeErrors(maybePerson)).toEqual([
            {path: ['name'], expected: 'string'},
            {path: ['age'], expected: 'number'},
        ]);
        expect(typeErrorsMaybe(person)).toEqual([]);
    });

    it('json encode/decode', () => {
        const encode = rt.createJitFunction(JitFunctions.prepareForJson);
        const encodeMaybe = rtRequired.createJitFunction(JitFunctions.prepareForJson);
        const decode = rt.createJitFunction(JitFunctions.restoreFromJson);
        const decodeMaybe = rtRequired.createJitFunction(JitFunctions.restoreFromJson);

        expect(decode(JSON.parse(JSON.stringify(encode(person))))).toEqual({name: 'John', age: 30, createdAt});
        expect(decodeMaybe(JSON.parse(JSON.stringify(encodeMaybe(maybePerson))))).toEqual({createdAt});
    });

    // Test moved to packages/run-types/src/jitCompilers/json/stringifyJson.spec.ts (lines 205-215)

    it('mock', async () => {
        const mocked = await rt.mock();
        const mockedMaybe = await rtRequired.mock();
        const isType = rt.createJitFunction(JitFunctions.isType);
        const isTypeMaybe = rtRequired.createJitFunction(JitFunctions.isType);

        expect(Object.keys(mocked)).toEqual(['name', 'age', 'createdAt']);
        expect(Object.keys(mockedMaybe).length <= 3).toBe(true);
        expect(isType(mocked)).toBe(true);
        expect(isTypeMaybe(mockedMaybe)).toBe(true);
    });
});
