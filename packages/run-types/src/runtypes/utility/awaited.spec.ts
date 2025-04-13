/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JitFunctions} from '../../constants';
import {runType} from '../../runType';

describe('Awaited typescript utility type', () => {
    type MyPromise = Promise<{a: string; b: number; c: Date}>; // note how record does not check the type of keys
    type MyType = Awaited<MyPromise>;
    const rt = runType<MyType>();

    const myType: MyType = {a: 'hello', b: 1, c: new Date()};

    it('validate', () => {
        const isType = rt.createJitFunction(JitFunctions.isType);
        expect(isType(myType)).toEqual(true);
    });

    it('validate errors', () => {
        const invalidParams = {a: 'world', b: 2, c: 'not a date'};
        const typeErrors = rt.createJitFunction(JitFunctions.typeErrors);
        expect(typeErrors(invalidParams)).toEqual([{path: ['c'], expected: 'date'}]);
    });

    it('json encode/decode', () => {
        const encode = rt.createJitFunction(JitFunctions.toJsonVal);
        const decode = rt.createJitFunction(JitFunctions.fromJsonVal);
        const encoded = encode({...myType});
        const decoded = decode(JSON.parse(JSON.stringify(encoded)));
        expect(decoded).toEqual(myType);
    });

    it('json stringify', () => {
        const stringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const decode = rt.createJitFunction(JitFunctions.fromJsonVal);
        const jsonString = stringify({...myType});
        const parsed = JSON.parse(jsonString);
        const decoded = decode(parsed);
        expect(decoded).toEqual(myType);
    });

    it('mock', () => {
        const mocked = rt.mock();
        const isType = rt.createJitFunction(JitFunctions.isType);
        expect(isType(mocked)).toEqual(true);
        expect(typeof mocked).toBe('object');
        expect(typeof mocked.a).toBe('string');
        expect(typeof mocked.b).toBe('number');
        expect(mocked.c instanceof Date).toBe(true);
    });
});
