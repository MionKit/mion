/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {runType} from '../../createRunType';
import {JitFunctions} from '../../constants.functions';
import type {RunTypeOptions} from '../../types';
import {JIT_FUNCTION_IDS} from '@mionkit/core';
import {CollectionRunType} from '../../lib/baseRunTypes';
import {PropertyRunType} from '../member/property';

const reg = /abc/i;
const reg2 = /['"]\/ \\ \//; // regexp with characters that can be problematic in jit code if not correctly scaped
const sym = Symbol('hello');
const rt2 = runType<2>();
const rtA = runType<'a'>();
const rtReg = runType<typeof reg>(); // eslint-disable-line @mionkit/no-typeof-runtype
const rtReg2 = runType<typeof reg2>(); // eslint-disable-line @mionkit/no-typeof-runtype
const rtTrue = runType<true>();
const rtBig = runType<1n>();
const rtSym = runType<typeof sym>(); // eslint-disable-line @mionkit/no-typeof-runtype

it('validate literal', () => {
    const validate2 = rt2.createJitFunction(JitFunctions.isType);
    const validateA = rtA.createJitFunction(JitFunctions.isType);
    const validateReg = rtReg.createJitFunction(JitFunctions.isType);
    const validateReg2 = rtReg2.createJitFunction(JitFunctions.isType);
    const validateTrue = rtTrue.createJitFunction(JitFunctions.isType);
    const validateBig = rtBig.createJitFunction(JitFunctions.isType);
    const validateSym = rtSym.createJitFunction(JitFunctions.isType);

    // success
    expect(validate2(2)).toBe(true);
    expect(validateA('a')).toBe(true);
    expect(validateReg(reg)).toEqual(true);
    expect(validateReg2(reg2)).toEqual(true);
    expect(validateTrue(true)).toBe(true);
    expect(validateBig(1n)).toBe(true);
    expect(validateSym(sym)).toBe(true);

    // fail
    expect(validate2(4)).toBe(false);
    expect(validateA('b')).toBe(false);
    expect(validateReg(/asdf/i)).toBe(false);
    expect(validateTrue(false)).toBe(false);
    expect(validateBig(2n)).toBe(false);
    expect(validateSym(Symbol('nice'))).toBe(false);
});

it('validate literal + errors', () => {
    const valWithErrors2 = rt2.createJitFunction(JitFunctions.typeErrors);
    const valWithErrorsA = rtA.createJitFunction(JitFunctions.typeErrors);
    const valWithErrorsReg = rtReg.createJitFunction(JitFunctions.typeErrors);
    const valWithErrorsReg2 = rtReg2.createJitFunction(JitFunctions.typeErrors);
    const valWithErrorsTrue = rtTrue.createJitFunction(JitFunctions.typeErrors);
    const valWithErrorsBig = rtBig.createJitFunction(JitFunctions.typeErrors);
    const valWithErrorsSym = rtSym.createJitFunction(JitFunctions.typeErrors);

    // success
    expect(valWithErrors2(2)).toEqual([]);
    expect(valWithErrorsA('a')).toEqual([]);
    expect(valWithErrorsReg(/abc/i)).toEqual([]);
    expect(valWithErrorsTrue(true)).toEqual([]);
    expect(valWithErrorsBig(1n)).toEqual([]);
    expect(valWithErrorsSym(sym)).toEqual([]);

    // fail
    expect(valWithErrors2(4)).toEqual([{path: [], expected: 'literal'}]);
    expect(valWithErrorsA('b')).toEqual([{path: [], expected: 'literal'}]);
    expect(valWithErrorsReg(/hello/i)).toEqual([{path: [], expected: 'literal'}]);
    expect(valWithErrorsReg2(/hello/i)).toEqual([{path: [], expected: 'literal'}]);
    expect(valWithErrorsTrue(false)).toEqual([{path: [], expected: 'literal'}]);
    expect(valWithErrorsBig(2n)).toEqual([{path: [], expected: 'literal'}]);
    expect(valWithErrorsSym(Symbol('nice'))).toEqual([{path: [], expected: 'literal'}]);
});

it('mock', async () => {
    const mocked2 = await rt2.mock();
    const mockedA = await rtA.mock();
    const mockedReg = await rtReg.mock();
    const mockedTrue = await rtTrue.mock();
    const mockedBig = await rtBig.mock();
    const mockedSym = await rtSym.mock();

    expect(mocked2).toEqual(2);
    expect(mockedA).toEqual('a');
    expect(mockedReg).toEqual(/abc/i);
    expect(mockedTrue).toEqual(true);
    expect(mockedBig).toEqual(1n);
    expect(mockedSym.toString()).toEqual(sym.toString());
});

it('validate when noLiterals options is used', () => {
    const noLiterals: RunTypeOptions = {noLiterals: true};
    const validate2 = rt2.createJitFunction(JitFunctions.isType, noLiterals);
    const validateA = rtA.createJitFunction(JitFunctions.isType, noLiterals);
    const validateReg = rtReg.createJitFunction(JitFunctions.isType, noLiterals);
    const validateReg2 = rtReg2.createJitFunction(JitFunctions.isType, noLiterals);
    const validateTrue = rtTrue.createJitFunction(JitFunctions.isType, noLiterals);
    const validateBig = rtBig.createJitFunction(JitFunctions.isType, noLiterals);
    const validateSym = rtSym.createJitFunction(JitFunctions.isType, noLiterals);

    // success (allow any value from same type)
    expect(validate2(4)).toBe(true);
    expect(validateA('c')).toBe(true);
    expect(validateReg(/otherReg/)).toEqual(true);
    expect(validateReg2(/otherReg/)).toEqual(true);
    expect(validateTrue(false)).toBe(true);
    expect(validateBig(3n)).toBe(true);
    expect(validateSym(Symbol('world'))).toBe(true);

    // fail (wrong type)
    expect(validate2('4')).toBe(false);
    expect(validateA(1)).toBe(false);
    expect(validateReg('otherReg')).toEqual(false);
    expect(validateReg2('otherReg')).toEqual(false);
    expect(validateTrue(1)).toBe(false);
    expect(validateBig(3)).toBe(false);
    expect(validateSym('world')).toBe(false);
});

it('validate when noLiterals options is used + errors', () => {
    const noLiterals: RunTypeOptions = {noLiterals: true};
    const valWithErrors2 = rt2.createJitFunction(JitFunctions.typeErrors, noLiterals);
    const valWithErrorsA = rtA.createJitFunction(JitFunctions.typeErrors, noLiterals);
    const valWithErrorsReg = rtReg.createJitFunction(JitFunctions.typeErrors, noLiterals);
    const valWithErrorsReg2 = rtReg2.createJitFunction(JitFunctions.typeErrors, noLiterals);
    const valWithErrorsTrue = rtTrue.createJitFunction(JitFunctions.typeErrors, noLiterals);
    const valWithErrorsBig = rtBig.createJitFunction(JitFunctions.typeErrors, noLiterals);
    const valWithErrorsSym = rtSym.createJitFunction(JitFunctions.typeErrors, noLiterals);

    // success
    expect(valWithErrors2(4)).toEqual([]);
    expect(valWithErrorsA('c')).toEqual([]);
    expect(valWithErrorsReg(/otherReg/)).toEqual([]);
    expect(valWithErrorsReg2(/otherReg/)).toEqual([]);
    expect(valWithErrorsTrue(false)).toEqual([]);
    expect(valWithErrorsBig(3n)).toEqual([]);
    expect(valWithErrorsSym(Symbol('world'))).toEqual([]);

    // fail
    expect(valWithErrors2('4')).toEqual([{path: [], expected: 'number'}]);
    expect(valWithErrorsA(1)).toEqual([{path: [], expected: 'string'}]);
    expect(valWithErrorsReg('otherReg')).toEqual([{path: [], expected: 'regexp'}]);
    expect(valWithErrorsReg2('otherReg')).toEqual([{path: [], expected: 'regexp'}]);
    expect(valWithErrorsTrue(1)).toEqual([{path: [], expected: 'boolean'}]);
    expect(valWithErrorsBig(3)).toEqual([{path: [], expected: 'bigint'}]);
    expect(valWithErrorsSym('world')).toEqual([{path: [], expected: 'symbol'}]);
});

it('mock when noLiterals options is used', async () => {
    const noLiterals: RunTypeOptions = {noLiterals: true};
    const mocked2 = await rt2.mock(noLiterals);
    const mockedA = await rtA.mock(noLiterals);
    const mockedReg = await rtReg.mock(noLiterals);
    const mockedTrue = await rtTrue.mock(noLiterals);
    const mockedBig = await rtBig.mock(noLiterals);
    const mockedSym = await rtSym.mock(noLiterals);

    expect(typeof mocked2).toBe('number');
    expect(typeof mockedA).toBe('string');
    expect(mockedReg instanceof RegExp).toBe(true);
    expect(typeof mockedTrue).toBe('boolean');
    expect(typeof mockedBig).toBe('bigint');
    expect(typeof mockedSym).toBe('symbol');
});

describe('Generic Literal Optimization', () => {
    // Test with RpcError-like generic type
    type RpcError<ErrType extends string> = {
        type: ErrType;
        message: string;
    };

    it('should generate different type IDs for validation functions with different literal values', () => {
        const rt1 = runType<RpcError<'my-error'>>() as CollectionRunType<any>;
        const rt2 = runType<RpcError<'my-other-error'>>() as CollectionRunType<any>;

        // Get the type property (which is a literal)
        const literalProp1 = rt1.getChildRunTypes()[0] as PropertyRunType;
        const literalProp2 = rt2.getChildRunTypes()[0] as PropertyRunType;
        const type1 = literalProp1.getMemberType();
        const type2 = literalProp2.getMemberType();

        // Validation functions should have different type IDs
        const isTypeId1 = type1.getTypeID(JIT_FUNCTION_IDS.isType);
        const isTypeId2 = type2.getTypeID(JIT_FUNCTION_IDS.isType);

        expect(isTypeId1).not.toEqual(isTypeId2);
        expect(isTypeId1).toContain('my-error');
        expect(isTypeId2).toContain('my-other-error');
    });

    it('should generate same type IDs for serialization functions with different literal values from generic params', () => {
        const rt1 = runType<RpcError<'my-error'>>() as CollectionRunType<any>;
        const rt2 = runType<RpcError<'my-other-error'>>() as CollectionRunType<any>;

        // Get the type property (which is a literal)
        const literalProp1 = rt1.getChildRunTypes()[0] as PropertyRunType;
        const literalProp2 = rt2.getChildRunTypes()[0] as PropertyRunType;
        const type1 = literalProp1.getMemberType();
        const type2 = literalProp2.getMemberType();

        // Serialization functions should have the same type ID (base type)
        const toBinaryId1 = type1.getTypeID(JIT_FUNCTION_IDS.toBinary);
        const toBinaryId2 = type2.getTypeID(JIT_FUNCTION_IDS.toBinary);

        expect(toBinaryId1).toEqual(toBinaryId2);
        expect(toBinaryId1).not.toContain('my-error');
        expect(toBinaryId1).not.toContain('my-other-error');
    });

    it('should generate same type IDs for jsonStringify with different literal values from generic params', () => {
        const rt1 = runType<RpcError<'my-error'>>() as CollectionRunType<any>;
        const rt2 = runType<RpcError<'my-other-error'>>() as CollectionRunType<any>;

        // Get the type property (which is a literal)
        const literalProp1 = rt1.getChildRunTypes()[0] as PropertyRunType;
        const literalProp2 = rt2.getChildRunTypes()[0] as PropertyRunType;
        const type1 = literalProp1.getMemberType();
        const type2 = literalProp2.getMemberType();

        const jsonId1 = type1.getTypeID(JIT_FUNCTION_IDS.jsonStringify);
        const jsonId2 = type2.getTypeID(JIT_FUNCTION_IDS.jsonStringify);

        expect(jsonId1).toEqual(jsonId2);
    });

    it('should generate different full type IDs for validation but same for serialization', () => {
        const rt1 = runType<RpcError<'my-error'>>() as CollectionRunType<any>;
        const rt2 = runType<RpcError<'my-other-error'>>() as CollectionRunType<any>;

        // Full type IDs for validation should be different
        const isTypeId1 = rt1.getTypeID(JIT_FUNCTION_IDS.isType);
        const isTypeId2 = rt2.getTypeID(JIT_FUNCTION_IDS.isType);
        expect(isTypeId1).not.toEqual(isTypeId2);

        // Full type IDs for serialization should be the same
        const toBinaryId1 = rt1.getTypeID(JIT_FUNCTION_IDS.toBinary);
        const toBinaryId2 = rt2.getTypeID(JIT_FUNCTION_IDS.toBinary);
        expect(toBinaryId1).toEqual(toBinaryId2);
    });

    it('should not affect non-generic literal types', () => {
        type NonGeneric = {
            status: 'active' | 'inactive';
        };

        const rt = runType<NonGeneric>();
        const statusProp = (rt as any).getChildRunTypes()[0].getMemberType();
        const literal1 = (statusProp as any).getChildRunTypes()[0];
        const literal2 = (statusProp as any).getChildRunTypes()[1];

        // Non-generic literals should still have different IDs for serialization
        const toBinaryId1 = literal1.getTypeID(JIT_FUNCTION_IDS.toBinary);
        const toBinaryId2 = literal2.getTypeID(JIT_FUNCTION_IDS.toBinary);

        // These are not from generic params, so they should have different IDs
        expect(toBinaryId1).not.toEqual(toBinaryId2);
    });
});
