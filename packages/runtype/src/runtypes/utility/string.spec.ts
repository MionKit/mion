/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JitFnIDs} from '../../constants';
import {runType} from '../../runType';

// Intrinsic String Manipulation Types: these are typescript native utility types but require a runtime implementation
// Uppercase<StringType>, Lowercase<StringType>, Capitalize<StringType>, Uncapitalize<StringType>

describe('Uppercase typescript utility type', () => {
    const rt = runType<Uppercase<string>>();

    const upperString: Uppercase<string> = 'HELLO';
    const lowerString: string = 'hello';

    it('validate', () => {
        const isType = rt.createJitFunction(JitFnIDs.isType);
        expect(isType(upperString)).toEqual(true);
        expect(isType(lowerString)).toEqual(false);
    });

    it('validate errors', () => {
        const invalidParams = {a: 'world', b: 2, c: 'not a date'};
        const typeErrors = rt.createJitFunction(JitFnIDs.typeErrors);
        expect(typeErrors(invalidParams)).toEqual([{path: ['c'], expected: 'date'}]);
        expect(typeErrors(lowerString)).toEqual([{path: [], expected: 'string'}]); // TODO: we need extra info in the errors fo type format
    });

    it('json encode/decode', () => {
        const encode = rt.createJitFunction(JitFnIDs.toJsonVal);
        const decode = rt.createJitFunction(JitFnIDs.fromJsonVal);
        const encoded = encode(upperString);
        const decoded = decode(JSON.parse(JSON.stringify(encoded)));
        expect(decoded).toEqual(upperString);
    });

    it('json stringify', () => {
        const stringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const decode = rt.createJitFunction(JitFnIDs.fromJsonVal);
        const jsonString = stringify(upperString);
        const parsed = JSON.parse(jsonString);
        const decoded = decode(parsed);
        expect(decoded).toEqual(upperString);
    });

    it('mock', () => {
        const mocked = rt.mock();
        const isType = rt.createJitFunction(JitFnIDs.isType);
        expect(isType(mocked)).toEqual(true);
        expect(mocked.c instanceof Date).toBe(true);
    });
});
