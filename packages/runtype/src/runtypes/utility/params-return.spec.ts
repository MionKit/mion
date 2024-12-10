/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JitFnIDs} from '../../constants';
import {runType} from '../../runType';

// Deepkit already implements all logic for Pick

describe('Parameters & ReturnType typescript utility type', () => {
    type FunctionType = (a: number, b: boolean, c?: string, d?: Date) => Date;
    type FnParams = Parameters<FunctionType>;
    type FnReturn = ReturnType<FunctionType>;

    const rt = runType<FnParams>();
    const rtReturn = runType<FnReturn>();

    const params: FnParams = [1, true, 'hello', new Date()];
    const returnVal: FnReturn = new Date();

    it('validate', () => {
        const isType = rt.createJitFunction(JitFnIDs.isType);
        const isTypeReturn = rtReturn.createJitFunction(JitFnIDs.isType);

        expect(isType(params)).toEqual(true);
        expect(isTypeReturn(returnVal)).toEqual(true);

        expect(isTypeReturn(params)).toEqual(false);
        expect(isType(returnVal)).toEqual(false);
    });

    it('validate errors', () => {
        const typeErrors = rt.createJitFunction(JitFnIDs.typeErrors);
        const typeErrorsReturn = rtReturn.createJitFunction(JitFnIDs.typeErrors);

        expect(typeErrors(params)).toEqual([]);
        expect(typeErrorsReturn(returnVal)).toEqual([]);

        expect(typeErrors(['2', true])).toEqual([{path: [0], expected: 'number'}]);
        expect(typeErrorsReturn(3)).toEqual([{path: [], expected: 'date'}]);
    });

    it('json encode/decode', () => {
        const encode = rt.createJitFunction(JitFnIDs.jsonEncode);
        const encodeReturn = rtReturn.createJitFunction(JitFnIDs.jsonEncode);
        const decode = rt.createJitFunction(JitFnIDs.jsonDecode);
        const decodeReturn = rtReturn.createJitFunction(JitFnIDs.jsonDecode);

        const params1 = [...params];
        expect(decode(JSON.parse(JSON.stringify(encode(params1))))).toEqual(params);
        expect(decodeReturn(JSON.parse(JSON.stringify(encodeReturn(returnVal))))).toEqual(returnVal);
    });

    it('json stringify', () => {
        const stringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const stringifyReturn = rtReturn.createJitFunction(JitFnIDs.jsonStringify);
        const decode = rt.createJitFunction(JitFnIDs.jsonDecode);
        const decodeReturn = rtReturn.createJitFunction(JitFnIDs.jsonDecode);

        const params1 = [...params];
        expect(decode(JSON.parse(stringify(params1)))).toEqual(params);
        expect(decodeReturn(JSON.parse(stringifyReturn(returnVal)))).toEqual(returnVal);
    });

    it('mock', () => {
        const mocked = rt.mock();
        const mockedReturn = rtReturn.mock();
        const isType = rt.createJitFunction(JitFnIDs.isType);
        const isTypeReturn = rtReturn.createJitFunction(JitFnIDs.isType);

        expect(typeof mocked[0] === 'number').toBe(true);
        expect(typeof mocked[1] === 'boolean').toBe(true);
        expect(typeof mocked[2] === 'string' || typeof mocked[2] === 'undefined').toBe(true);
        expect(mocked[3] instanceof Date || typeof mocked[3] === 'undefined').toBe(true);
        expect(mockedReturn instanceof Date).toBe(true);
        expect(isType(mocked)).toBe(true);
        expect(isTypeReturn(mockedReturn)).toBe(true);
    });
});

describe('ConstructorParameter typescript utility type', () => {
    class Person {
        constructor(
            public name: string,
            public age: number,
            public createdAt: Date
        ) {}
    }
    type PersonConstructor = ConstructorParameters<typeof Person>;
    const rt = runType<PersonConstructor>();

    const params: PersonConstructor = ['John', 30, new Date()];

    it('validate', () => {
        const isType = rt.createJitFunction(JitFnIDs.isType);
        expect(isType(params)).toEqual(true);
    });

    it('validate errors', () => {
        const typeErrors = rt.createJitFunction(JitFnIDs.typeErrors);
        expect(typeErrors(params)).toEqual([]);
    });

    it('json encode/decode', () => {
        const encode = rt.createJitFunction(JitFnIDs.jsonEncode);
        const decode = rt.createJitFunction(JitFnIDs.jsonDecode);

        const params1 = [...params];
        expect(decode(JSON.parse(JSON.stringify(encode(params1))))).toEqual(params);
    });

    it('json stringify', () => {
        const stringify = rt.createJitFunction(JitFnIDs.jsonStringify);
        const decode = rt.createJitFunction(JitFnIDs.jsonDecode);

        const params1 = [...params];
        expect(decode(JSON.parse(stringify(params1)))).toEqual(params);
    });

    it('mock', () => {
        const mocked = rt.mock();
        const isType = rt.createJitFunction(JitFnIDs.isType);

        expect(typeof mocked[0] === 'string').toBe(true);
        expect(typeof mocked[1] === 'number').toBe(true);
        expect(mocked[2] instanceof Date).toBe(true);
        expect(isType(mocked)).toBe(true);
    });
});
