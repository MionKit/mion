/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../createRunType';
import {JitFunctions} from '../../constants.functions';
import {InterfaceRunType} from '../collection/interface';

// deepkit generates a FunctionRunType not a CallSignatureRunType
type CallSignatureType = {
    (a: number, b: boolean): string;
};

type CallSignatureWithProperties = {
    (a: number, b: boolean): string;
    extraProp1: string;
    extraProp2: number;
};

const exampleFunction: CallSignatureType = (a: number, b: boolean): string => {
    return 'hello';
};

const rt = runType<CallSignatureType>() as InterfaceRunType;
const rtProps = runType<CallSignatureWithProperties>() as InterfaceRunType;

describe('call signature', () => {
    it('reflect', () => {
        expect(rt.getFamily()).toBe('C');
        expect(rt.isCallable()).toBe(true);
        expect(rt.getCallSignature()).toBeTruthy();
    });

    it('validate', () => {
        const validate = rt.createJitFunction(JitFunctions.isType);
        expect(validate(exampleFunction)).toBe(true);
        expect(validate(() => null)).toBe(false); // params length mismatch
        expect(validate({})).toBe(false);
    });

    it('type errors', () => {
        const getTypeErrors = rt.createJitFunction(JitFunctions.typeErrors);

        expect(getTypeErrors(exampleFunction)).toEqual([]);
        expect(getTypeErrors(() => null)).toEqual([{expected: 'callSignature', path: []}]);
        expect(getTypeErrors({})).toEqual([{expected: 'callSignature', path: []}]);
    });

    it('throw errors for mock', async () => {
        expect(() => rt.createJitFunction(JitFunctions.isType)).not.toThrow();
        expect(() => rt.createJitFunction(JitFunctions.typeErrors)).not.toThrow();
        await expect(() => rt.mock()).rejects.toThrow('Mock is not allowed, call mockParams or mockReturn instead.');
    });
});

// this is mostly the only difference between call signature and function, that call signature might have extra properties
describe('call signature with extra props', () => {
    it('reflect', () => {
        expect(rtProps.getFamily()).toBe('C');
        expect(rtProps.isCallable()).toBe(true);
        expect(rtProps.getCallSignature()).toBeTruthy();
    });

    it('is type', () => {
        const validate = rtProps.createJitFunction(JitFunctions.isType);

        const obj: CallSignatureWithProperties = Object.assign((a: number, b: boolean) => 'hello', {
            extraProp1: 'value1',
            extraProp2: 42,
        });

        expect(validate(obj)).toBe(true);

        expect(obj.extraProp1).toBe('value1');
        expect(obj.extraProp2).toBe(42);
    });

    it('type errors', () => {
        const getTypeErrors = rtProps.createJitFunction(JitFunctions.typeErrors);

        const obj = (a: number, b: boolean) => 'hello';

        expect(getTypeErrors(obj)).toEqual([
            {expected: 'string', path: ['extraProp1']},
            {expected: 'number', path: ['extraProp2']},
        ]);
    });
});

describe('call signature parameters', () => {
    it('should validate correct parameters', () => {
        const validate = rt.getCallSignature()!.createJitParamsFunction(JitFunctions.isType);
        expect(validate([1, true])).toBe(true);
    });

    it('should return errors for invalid parameters', () => {
        const getTypeErrors = rt.getCallSignature()!.createJitParamsFunction(JitFunctions.typeErrors);
        expect(getTypeErrors([1, 'invalid'])).toEqual([{expected: 'boolean', path: [1]}]);
    });

    it('should handle missing parameters', () => {
        const validate = rt.getCallSignature()!.createJitParamsFunction(JitFunctions.isType);
        expect(validate([1])).toBe(false);
    });

    it('should handle excess parameters', () => {
        const getTypeErrors = rt.getCallSignature()!.createJitParamsFunction(JitFunctions.typeErrors);
        expect(getTypeErrors([1, true, 'extra'])).toEqual([{expected: 'params', path: []}]);
    });

    it('should mock parameters correctly', async () => {
        const mocked = await rt.getCallSignature()!.mockParams();
        expect(Array.isArray(mocked)).toBe(true);
        expect(mocked.length).toBe(2);
        const validate = rt.getCallSignature()!.createJitParamsFunction(JitFunctions.isType);
        expect(validate(mocked)).toBe(true);
    });
});

describe('call signature return', () => {
    it('validate call signature return', () => {
        const validateReturn = rt.getCallSignature()!.createJitReturnFunction(JitFunctions.isType);
        expect(validateReturn('result')).toBe(true);
        expect(validateReturn(123)).toBe(false);
    });

    it('validate call signature return + errors', () => {
        const typeErrorsReturn = rt.getCallSignature()!.createJitReturnFunction(JitFunctions.typeErrors);
        expect(typeErrorsReturn('result')).toEqual([]);
        expect(typeErrorsReturn(123)).toEqual([{expected: 'string', path: []}]);
    });

    it('mock call signature return', async () => {
        const mocked = await rt.getCallSignature()!.mockReturn();
        expect(typeof mocked).toBe('string');
        const validateReturn = rt.getCallSignature()!.createJitReturnFunction(JitFunctions.isType);
        expect(validateReturn(mocked)).toBe(true);
    });
});
