/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {runType} from '../../createRunType';
import {JitFunctions} from '../../constants.functions';

// Deepkit already implements all logic for NonNull

describe('NonNull typescript utility type, exclude atomic elements from an union', () => {
    type PersonProp = 'name' | 'age' | 'createdAt' | undefined | null;
    const rt = runType<PersonProp>();
    const rtNonNull = runType<NonNullable<PersonProp>>();

    const nullable: PersonProp = null;
    const nonNullable: NonNullable<PersonProp> = 'name';

    it('validate', () => {
        const isType = rt.createJitFunction(JitFunctions.isType);
        const isTypeNonNull = rtNonNull.createJitFunction(JitFunctions.isType);

        expect(isType(nullable)).toEqual(true);
        expect(isTypeNonNull(nonNullable)).toEqual(true);

        expect(isTypeNonNull(nullable)).toEqual(false);
        expect(isType(nonNullable)).toEqual(true);
    });

    it('validate errors', () => {
        const typeErrors = rt.createJitFunction(JitFunctions.typeErrors);
        const typeErrorsNonNull = rtNonNull.createJitFunction(JitFunctions.typeErrors);

        expect(typeErrors(nullable)).toEqual([]);
        expect(typeErrorsNonNull(nonNullable)).toEqual([]);

        expect(typeErrors(nonNullable)).toEqual([]);
        expect(typeErrorsNonNull(nullable)).toEqual([{path: [], expected: 'union'}]);
    });

    it('json encode/decode', () => {
        const encode = rt.createJitFunction(JitFunctions.prepareForJson);
        const encodeNonNull = rtNonNull.createJitFunction(JitFunctions.prepareForJson);
        const decode = rt.createJitFunction(JitFunctions.restoreFromJson);
        const decodeNonNull = rtNonNull.createJitFunction(JitFunctions.restoreFromJson);

        expect(decode(JSON.parse(JSON.stringify(encode(nullable))))).toEqual(nullable);
        expect(decodeNonNull(JSON.parse(JSON.stringify(encodeNonNull(nonNullable))))).toEqual(nonNullable);
    });

    it('json stringify', () => {
        const stringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const stringifyNonNull = rtNonNull.createJitFunction(JitFunctions.jsonStringify);
        const decode = rt.createJitFunction(JitFunctions.restoreFromJson);
        const decodeNonNull = rtNonNull.createJitFunction(JitFunctions.restoreFromJson);

        expect(decode(JSON.parse(stringify(nullable)))).toEqual(nullable);
        expect(decodeNonNull(JSON.parse(stringifyNonNull(nonNullable)))).toEqual(nonNullable);
    });

    it('mock', async () => {
        const mocked = await rt.mock();
        const mockedNonNull = await rtNonNull.mock();
        const isType = rt.createJitFunction(JitFunctions.isType);
        const isTypeNonNull = rtNonNull.createJitFunction(JitFunctions.isType);

        expect(['name', 'age', 'createdAt', null, undefined].includes(mocked)).toBe(true);
        expect(['name', 'age', 'createdAt'].includes(mockedNonNull)).toBe(true);
        expect(isType(mocked)).toBe(true);
        expect(isTypeNonNull(mockedNonNull)).toBe(true);
    });
});
