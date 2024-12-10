/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {runType} from '../../runType';
import {JitFnIDs} from '../../constants';

// Deepkit already implements all logic for NonNull

describe('NonNull typescript utility type, exclude atomic elements from an union', () => {
    type PersonProp = 'name' | 'age' | 'createdAt' | undefined | null;
    const rt = runType<PersonProp>();
    const rtNonNull = runType<NonNullable<PersonProp>>();

    const nullable: PersonProp = null;
    const nonNullable: NonNullable<PersonProp> = 'name';

    it('validate', () => {
        const isType = rt.createJitFunction(JitFnIDs.isType);
        const isTypeNonNull = rtNonNull.createJitFunction(JitFnIDs.isType);

        expect(isType(nullable)).toEqual(true);
        expect(isTypeNonNull(nonNullable)).toEqual(true);

        expect(isTypeNonNull(nullable)).toEqual(false);
        expect(isType(nonNullable)).toEqual(true);
    });

    it('validate errors', () => {
        const typeErrors = rt.createJitFunction(JitFnIDs.typeErrors);
        const typeErrorsNonNull = rtNonNull.createJitFunction(JitFnIDs.typeErrors);

        expect(typeErrors(nullable)).toEqual([]);
        expect(typeErrorsNonNull(nonNullable)).toEqual([]);

        expect(typeErrors(nonNullable)).toEqual([]);
        expect(typeErrorsNonNull(nullable)).toEqual([{path: [], expected: 'union'}]);
    });

    it('json encode/decode', () => {
        const encode = rt.createJitFunction(JitFnIDs.jsonEncode);
        const encodeNonNull = rtNonNull.createJitFunction(JitFnIDs.jsonEncode);
        const decode = rt.createJitFunction(JitFnIDs.jsonDecode);
        const decodeNonNull = rtNonNull.createJitFunction(JitFnIDs.jsonDecode);

        expect(decode(JSON.parse(JSON.stringify(encode(nullable))))).toEqual(nullable);
        expect(decodeNonNull(JSON.parse(JSON.stringify(encodeNonNull(nonNullable))))).toEqual(nonNullable);
    });

    it('json stringify', () => {
        const stringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const stringifyNonNull = rtNonNull.createJitFunction(JitFnIDs.jsonStringify);
        const decode = rt.createJitFunction(JitFnIDs.jsonDecode);
        const decodeNonNull = rtNonNull.createJitFunction(JitFnIDs.jsonDecode);

        expect(decode(JSON.parse(stringify(nullable)))).toEqual(nullable);
        expect(decodeNonNull(JSON.parse(stringifyNonNull(nonNullable)))).toEqual(nonNullable);
    });

    it('mock', () => {
        const mocked = rt.mock();
        const mockedNonNull = rtNonNull.mock();
        const isType = rt.createJitFunction(JitFnIDs.isType);
        const isTypeNonNull = rtNonNull.createJitFunction(JitFnIDs.isType);

        expect(['name', 'age', 'createdAt', null, undefined].includes(mocked)).toBe(true);
        expect(['name', 'age', 'createdAt'].includes(mockedNonNull)).toBe(true);
        expect(isType(mocked)).toBe(true);
        expect(isTypeNonNull(mockedNonNull)).toBe(true);
    });
});
