/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JitFnIDs} from '../../constants';
import {runType} from '../../runType';

describe('Record  typescript utility type', () => {
    type MyType = Record<string, {a: string; b: number; c: Date}>; // note how record does not check the type of keys
    const rt = runType<MyType>();

    const params: MyType = {
        '1': {a: 'hello', b: 1, c: new Date()},
        '2': {a: 'world', b: 2, c: new Date()},
        3: {a: 'world', b: 2, c: new Date()}, // Note how the key is a number but TS does not complain
    };

    it('validate', () => {
        const isType = rt.createJitFunction(JitFnIDs.isType);
        expect(isType(params)).toEqual(true);
    });

    it('validate errors', () => {
        const invalidParams = {
            '1': {a: 'hello', b: 'not a number', c: new Date()},
            '2': {a: 'world', b: 2, c: 'not a date'},
        };
        const typeErrors = rt.createJitFunction(JitFnIDs.typeErrors);
        expect(typeErrors(invalidParams)).toEqual([
            {path: ['1', 'b'], expected: 'number'},
            {path: ['2', 'c'], expected: 'date'},
        ]);
    });

    it('json encode/decode', () => {
        const encode = rt.createJitFunction(JitFnIDs.jsonEncode);
        const decode = rt.createJitFunction(JitFnIDs.jsonDecode);
        const encoded = encode(params);
        const decoded = decode(JSON.parse(JSON.stringify(encoded)));
        expect(decoded).toEqual(params);
    });

    it('json stringify', () => {
        const stringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const decode = rt.createJitFunction(JitFnIDs.jsonDecode);
        const jsonString = stringify(params);
        const parsed = JSON.parse(jsonString);
        const decoded = decode(parsed);
        expect(decoded).toEqual(params);
    });

    it('mock', () => {
        const mocked = rt.mock();
        const isType = rt.createJitFunction(JitFnIDs.isType);
        expect(isType(mocked)).toEqual(true);
        expect(typeof mocked).toBe('object');
        for (const key in mocked) {
            expect(typeof mocked[key].a).toBe('string');
            expect(typeof mocked[key].b).toBe('number');
            expect(mocked[key].c instanceof Date).toBe(true);
        }
    });
});
