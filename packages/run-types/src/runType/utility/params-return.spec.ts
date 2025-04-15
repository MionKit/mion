/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JitFunctions} from '../../constants';
import {runType} from '../../lib/runType';

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
        const isType = rt.createJitFunction(JitFunctions.isType);
        const isTypeReturn = rtReturn.createJitFunction(JitFunctions.isType);

        expect(isType(params)).toEqual(true);
        expect(isTypeReturn(returnVal)).toEqual(true);

        expect(isTypeReturn(params)).toEqual(false);
        expect(isType(returnVal)).toEqual(false);
    });

    it('validate errors', () => {
        const typeErrors = rt.createJitFunction(JitFunctions.typeErrors);
        const typeErrorsReturn = rtReturn.createJitFunction(JitFunctions.typeErrors);

        expect(typeErrors(params)).toEqual([]);
        expect(typeErrorsReturn(returnVal)).toEqual([]);

        expect(typeErrors(['2', true])).toEqual([{path: [0], expected: 'number'}]);
        expect(typeErrorsReturn(3)).toEqual([{path: [], expected: 'date'}]);
    });

    it('json encode/decode', () => {
        const encode = rt.createJitFunction(JitFunctions.toJsonVal);
        const encodeReturn = rtReturn.createJitFunction(JitFunctions.toJsonVal);
        const decode = rt.createJitFunction(JitFunctions.fromJsonVal);
        const decodeReturn = rtReturn.createJitFunction(JitFunctions.fromJsonVal);

        const params1 = [...params];
        expect(decode(JSON.parse(JSON.stringify(encode(params1))))).toEqual(params);
        expect(decodeReturn(JSON.parse(JSON.stringify(encodeReturn(returnVal))))).toEqual(returnVal);
    });

    it('json stringify', () => {
        const stringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const stringifyReturn = rtReturn.createJitFunction(JitFunctions.jsonStringify);
        const decode = rt.createJitFunction(JitFunctions.fromJsonVal);
        const decodeReturn = rtReturn.createJitFunction(JitFunctions.fromJsonVal);

        const params1 = [...params];
        expect(decode(JSON.parse(stringify(params1)))).toEqual(params);
        expect(decodeReturn(JSON.parse(stringifyReturn(returnVal)))).toEqual(returnVal);
    });

    it('mock', async () => {
        const mocked = await rt.mock();
        const mockedReturn = await rtReturn.mock();
        const isType = rt.createJitFunction(JitFunctions.isType);
        const isTypeReturn = rtReturn.createJitFunction(JitFunctions.isType);

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
        const isType = rt.createJitFunction(JitFunctions.isType);
        expect(isType(params)).toEqual(true);
    });

    it('validate errors', () => {
        const typeErrors = rt.createJitFunction(JitFunctions.typeErrors);
        expect(typeErrors(params)).toEqual([]);
    });

    it('json encode/decode', () => {
        const encode = rt.createJitFunction(JitFunctions.toJsonVal);
        const decode = rt.createJitFunction(JitFunctions.fromJsonVal);

        const params1 = [...params];
        expect(decode(JSON.parse(JSON.stringify(encode(params1))))).toEqual(params);
    });

    it('json stringify', () => {
        const stringify = rt.createJitFunction(JitFunctions.jsonStringify);
        const decode = rt.createJitFunction(JitFunctions.fromJsonVal);

        const params1 = [...params];
        expect(decode(JSON.parse(stringify(params1)))).toEqual(params);
    });

    it('mock', async () => {
        const mocked = await rt.mock();
        const isType = rt.createJitFunction(JitFunctions.isType);

        expect(typeof mocked[0] === 'string').toBe(true);
        expect(typeof mocked[1] === 'number').toBe(true);
        expect(mocked[2] instanceof Date).toBe(true);
        expect(isType(mocked)).toBe(true);
    });
});
