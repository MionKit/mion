/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {reflectFunction, runType} from '../../runType';
import {JitFnIDs} from '../../constants';
import {FunctionRunType} from '../function/function';
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
        expect(rt.getCallSignature()?.getLength()).toBe(2);
    });
    it('validate', () => {
        const validate = rt.createJitFunction(JitFnIDs.isType);
        expect(validate(exampleFunction)).toBe(true);
        expect(validate(() => null)).toBe(false); // params length mismatch
        expect(validate({})).toBe(false);
    });

    it('type errors', () => {
        const getTypeErrors = rt.createJitFunction(JitFnIDs.typeErrors);

        expect(getTypeErrors(exampleFunction)).toEqual([]);
        expect(getTypeErrors(() => null)).toEqual([{expected: 'callSignature', path: []}]);
        expect(getTypeErrors({})).toEqual([{expected: 'callSignature', path: []}]);
    });

    it('throw errors for json encode/decode, jsonStringify and mock', () => {
        expect(() => rt.createJitFunction(JitFnIDs.isType)).not.toThrow();
        expect(() => rt.createJitFunction(JitFnIDs.typeErrors)).not.toThrow();

        expect(() => rt.createJitFunction(JitFnIDs.jsonEncode)).toThrow(
            `Compile function JsonEncode not supported, call compileParams or compileReturn instead.`
        );
        expect(() => rt.createJitFunction(JitFnIDs.jsonDecode)).toThrow(
            `Compile function JsonDecode not supported, call compileParams or compileReturn instead.`
        );

        expect(() => rt.createJitFunction(JitFnIDs.jsonStringify)).toThrow(
            `Compile function JsonStringify not supported, call compileParams or compileReturn instead.`
        );
        expect(() => rt.mock()).toThrow('Function Mock is not allowed, call mockParams or mockReturn instead.');
    });
});

// this is mostly the only difference between call signature and function, that call signature might have extra properties
describe('call signature with extra props', () => {
    it('reflect', () => {
        expect(rtProps.getFamily()).toBe('C');
        expect(rtProps.isCallable()).toBe(true);
        expect(rtProps.getCallSignature()).toBeTruthy();
        expect(rtProps.getCallSignature()?.getLength()).toBe(2);
    });

    it('is type', () => {
        const validate = rtProps.createJitFunction(JitFnIDs.isType);

        const obj: CallSignatureWithProperties = Object.assign((a: number, b: boolean) => 'hello', {
            extraProp1: 'value1',
            extraProp2: 42,
        });

        expect(validate(obj)).toBe(true);

        expect(obj.extraProp1).toBe('value1');
        expect(obj.extraProp2).toBe(42);
    });

    it('type errors', () => {
        const getTypeErrors = rtProps.createJitFunction(JitFnIDs.typeErrors);

        const obj = (a: number, b: boolean) => 'hello';

        expect(getTypeErrors(obj)).toEqual([
            {expected: 'string', path: ['extraProp1']},
            {expected: 'number', path: ['extraProp2']},
        ]);
    });
});

describe('call signature parameters', () => {
    it('should validate correct parameters', () => {
        const validate = rt.getCallSignature()!.createJitParamsFunction(JitFnIDs.isType);
        expect(validate([1, true])).toBe(true);
    });

    it('should return errors for invalid parameters', () => {
        const getTypeErrors = rt.getCallSignature()!.createJitParamsFunction(JitFnIDs.typeErrors);
        expect(getTypeErrors([1, 'invalid'])).toEqual([{expected: 'boolean', path: [1]}]);
    });

    it('should handle missing parameters', () => {
        const validate = rt.getCallSignature()!.createJitParamsFunction(JitFnIDs.isType);
        expect(validate([1])).toBe(false);
    });

    it('should handle excess parameters', () => {
        const getTypeErrors = rt.getCallSignature()!.createJitParamsFunction(JitFnIDs.typeErrors);
        expect(getTypeErrors([1, true, 'extra'])).toEqual([{expected: 'fnParams', path: []}]);
    });

    it('should encode and decode parameters to JSON', () => {
        const toJson = rt.getCallSignature()!.createJitParamsFunction(JitFnIDs.jsonEncode);
        const fromJson = rt.getCallSignature()!.createJitParamsFunction(JitFnIDs.jsonDecode);
        const params = [1, true];
        expect(fromJson(JSON.parse(JSON.stringify(toJson(params))))).toEqual(params);
    });

    it('should mock parameters correctly', () => {
        const mocked = rt.getCallSignature()!.mockParams();
        expect(Array.isArray(mocked)).toBe(true);
        expect(mocked.length).toBe(2);
        const validate = rt.getCallSignature()!.createJitParamsFunction(JitFnIDs.isType);
        expect(validate(mocked)).toBe(true);
    });
});

describe('call signature return', () => {
    it('validate call signature return', () => {
        const validateReturn = rt.getCallSignature()!.createJitReturnFunction(JitFnIDs.isType);
        expect(validateReturn('result')).toBe(true);
        expect(validateReturn(123)).toBe(false);
    });

    it('validate call signature return + errors', () => {
        const typeErrorsReturn = rt.getCallSignature()!.createJitReturnFunction(JitFnIDs.typeErrors);
        expect(typeErrorsReturn('result')).toEqual([]);
        expect(typeErrorsReturn(123)).toEqual([{expected: 'string', path: []}]);
    });

    it('encode/decode call signature return to json', () => {
        const toJson = rt.getCallSignature()!.createJitReturnFunction(JitFnIDs.jsonEncode);
        const fromJson = rt.getCallSignature()!.createJitReturnFunction(JitFnIDs.jsonDecode);
        const returnValue = 'result';

        expect(fromJson(JSON.parse(JSON.stringify(toJson(returnValue))))).toEqual(returnValue);
    });

    it('json stringify call signature return', () => {
        const jsonStringify = rt.getCallSignature()!.createJitReturnFunction(JitFnIDs.jsonStringify);
        const fromJson = rt.getCallSignature()!.createJitReturnFunction(JitFnIDs.jsonDecode);
        const returnValue = 'result';

        const roundTrip = fromJson(JSON.parse(jsonStringify(returnValue)));
        expect(roundTrip).toEqual(returnValue);
    });

    it('mock call signature return', () => {
        const mocked = rt.getCallSignature()!.mockReturn();
        expect(typeof mocked).toBe('string');
        const validateReturn = rt.getCallSignature()!.createJitReturnFunction(JitFnIDs.isType);
        expect(validateReturn(rt.getCallSignature()!.mockReturn())).toBe(true);
    });
});
