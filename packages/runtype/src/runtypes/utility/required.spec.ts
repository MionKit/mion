/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JitFnIDs} from '../../constants';
import {runType} from '../../runType';

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
        const isType = rt.createJitFunction(JitFnIDs.isType);
        const isTypeMaybe = rtRequired.createJitFunction(JitFnIDs.isType);
        expect(isType(person)).toEqual(true);
        expect(isTypeMaybe(maybePerson)).toEqual(true);

        expect(isType(maybePerson)).toEqual(false);
        expect(isTypeMaybe(person)).toEqual(true);
    });

    it('validate errors', () => {
        const typeErrors = rt.createJitFunction(JitFnIDs.typeErrors);
        const typeErrorsMaybe = rtRequired.createJitFunction(JitFnIDs.typeErrors);

        expect(typeErrors(person)).toEqual([]);
        expect(typeErrorsMaybe(maybePerson)).toEqual([]);

        expect(typeErrors(maybePerson)).toEqual([
            {path: ['name'], expected: 'string'},
            {path: ['age'], expected: 'number'},
        ]);
        expect(typeErrorsMaybe(person)).toEqual([]);
    });

    it('json encode/decode', () => {
        const encode = rt.createJitFunction(JitFnIDs.toJsonVal);
        const encodeMaybe = rtRequired.createJitFunction(JitFnIDs.toJsonVal);
        const decode = rt.createJitFunction(JitFnIDs.fromJsonVal);
        const decodeMaybe = rtRequired.createJitFunction(JitFnIDs.fromJsonVal);

        expect(decode(JSON.parse(JSON.stringify(encode(person))))).toEqual({name: 'John', age: 30, createdAt});
        expect(decodeMaybe(JSON.parse(JSON.stringify(encodeMaybe(maybePerson))))).toEqual({createdAt});
    });

    it('json stringify', () => {
        const stringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const stringifyMaybe = rtRequired.createJitFunction(JitFnIDs.jsonStringify);
        const decode = rt.createJitFunction(JitFnIDs.fromJsonVal);
        const decodeMaybe = rtRequired.createJitFunction(JitFnIDs.fromJsonVal);

        expect(decode(JSON.parse(stringify(person)))).toEqual({name: 'John', age: 30, createdAt});
        expect(decodeMaybe(JSON.parse(stringifyMaybe(maybePerson)))).toEqual({createdAt});
    });

    it('mock', () => {
        const mocked = rt.mock();
        const mockedMaybe = rtRequired.mock();
        const isType = rt.createJitFunction(JitFnIDs.isType);
        const isTypeMaybe = rtRequired.createJitFunction(JitFnIDs.isType);

        expect(Object.keys(mocked)).toEqual(['name', 'age', 'createdAt']);
        expect(Object.keys(mockedMaybe).length <= 3).toBe(true);
        expect(isType(mocked)).toBe(true);
        expect(isTypeMaybe(mockedMaybe)).toBe(true);
    });
});
