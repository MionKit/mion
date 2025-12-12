/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {runType} from '../../createRunType';
import {RpcError} from '@mionkit/core';
import {BaseRunType} from '../../lib/baseRunTypes';
import {JitFunctions} from '../../constants.functions';

describe('Generic Type IDs', () => {
    it('should generate different getTypeID for RpcError with different literal type arguments', () => {
        const rt1 = runType<RpcError<'my-error'>>();
        const rt2 = runType<RpcError<'my-other-error'>>();

        const typeId1 = rt1.getTypeID();
        const typeId2 = rt2.getTypeID();

        // Different literal type arguments should produce different type IDs
        expect(typeId1).not.toEqual(typeId2);
        expect(typeof typeId1).toBe('string');
        expect(typeof typeId2).toBe('string');
    });

    it('should generate same getGenericTypeID for RpcError with different literal type arguments', () => {
        const rt1 = runType<RpcError<'my-error'>>() as BaseRunType;
        const rt2 = runType<RpcError<'my-other-error'>>() as BaseRunType;

        const genericTypeId1 = rt1.getGenericTypeID();
        const genericTypeId2 = rt2.getGenericTypeID();

        // Same generic structure with different literal type arguments should produce same generic type ID
        expect(genericTypeId1).toEqual(genericTypeId2);
        expect(typeof genericTypeId1).toBe('string');
    });

    it('should generate different getGenericTypeID for RpcError with different generic structure', () => {
        const rt1 = runType<RpcError<'my-error'>>() as BaseRunType;
        const rt2 = runType<RpcError<'my-error', {code: number}>>() as BaseRunType;

        const genericTypeId1 = rt1.getGenericTypeID();
        const genericTypeId2 = rt2.getGenericTypeID();

        // Different generic structure should produce different generic type IDs
        expect(genericTypeId1).not.toEqual(genericTypeId2);
    });

    it('should generate same getGenericTypeID for types with different literal values in nested structures', () => {
        type MyType1 = {error: RpcError<'error-1'>; value: string};
        type MyType2 = {error: RpcError<'error-2'>; value: string};

        const rt1 = runType<MyType1>() as BaseRunType;
        const rt2 = runType<MyType2>() as BaseRunType;

        const genericTypeId1 = rt1.getGenericTypeID();
        const genericTypeId2 = rt2.getGenericTypeID();

        // Same structure with different nested literal type arguments should produce same generic type ID
        expect(genericTypeId1).toEqual(genericTypeId2);
    });

    it('should generate different getTypeID but same getGenericTypeID for simple literal types', () => {
        const rt1 = runType<'hello'>() as BaseRunType;
        const rt2 = runType<'world'>() as BaseRunType;

        const typeId1 = rt1.getTypeID();
        const typeId2 = rt2.getTypeID();
        const genericTypeId1 = rt1.getGenericTypeID();
        const genericTypeId2 = rt2.getGenericTypeID();

        // Different literals should have different type IDs
        expect(typeId1).not.toEqual(typeId2);
        // But same generic type ID (both are string literals)
        expect(genericTypeId1).toEqual(genericTypeId2);
    });

    it('should generate different getTypeID but same getGenericTypeID for number literals', () => {
        const rt1 = runType<42>() as BaseRunType;
        const rt2 = runType<100>() as BaseRunType;

        const typeId1 = rt1.getTypeID();
        const typeId2 = rt2.getTypeID();
        const genericTypeId1 = rt1.getGenericTypeID();
        const genericTypeId2 = rt2.getGenericTypeID();

        // Different number literals should have different type IDs
        expect(typeId1).not.toEqual(typeId2);
        // But same generic type ID (both are number literals)
        expect(genericTypeId1).toEqual(genericTypeId2);
    });

    it('should generate same getGenericTypeID for arrays with different literal element types', () => {
        const rt1 = runType<Array<'a' | 'b'>>() as BaseRunType;
        const rt2 = runType<Array<'c' | 'd'>>() as BaseRunType;

        const genericTypeId1 = rt1.getGenericTypeID();
        const genericTypeId2 = rt2.getGenericTypeID();

        // Arrays with different literal union types should have same generic type ID
        expect(genericTypeId1).toEqual(genericTypeId2);
    });

    it('should generate different getGenericTypeID for different non-literal generic structures', () => {
        const rt1 = runType<{a: string; b: number}>() as BaseRunType;
        const rt2 = runType<{a: string; b: string}>() as BaseRunType;

        const genericTypeId1 = rt1.getGenericTypeID();
        const genericTypeId2 = rt2.getGenericTypeID();

        // Different property types should produce different generic type IDs
        expect(genericTypeId1).not.toEqual(genericTypeId2);
    });

    it('should handle complex nested generic types correctly', () => {
        type Complex1 = {
            errors: Array<RpcError<'error-1'>>;
            status: 'success' | 'failure';
        };
        type Complex2 = {
            errors: Array<RpcError<'error-2'>>;
            status: 'ok' | 'error';
        };

        const rt1 = runType<Complex1>() as BaseRunType;
        const rt2 = runType<Complex2>() as BaseRunType;

        const typeId1 = rt1.getTypeID();
        const typeId2 = rt2.getTypeID();
        const genericTypeId1 = rt1.getGenericTypeID();
        const genericTypeId2 = rt2.getGenericTypeID();

        // Different literal values should produce different type IDs
        expect(typeId1).not.toEqual(typeId2);
        // But same generic structure should produce same generic type ID
        expect(genericTypeId1).toEqual(genericTypeId2);
    });
});

describe('Generic JIT Functions', () => {
    it('should compile isType function for RpcError with literal type argument', () => {
        const rt = runType<RpcError<'my-error'>>();
        const isType = rt.createJitFunction(JitFunctions.isType);

        const validError = new RpcError({
            statusCode: 400,
            message: 'error',
            publicMessage: 'error',
            type: 'my-error',
        });

        const invalidError = new RpcError({
            statusCode: 400,
            message: 'error',
            publicMessage: 'error',
            type: 'different-error',
        });

        expect(isType(validError)).toBe(true);
        expect(isType(invalidError)).toBe(false);
        expect(isType({foo: 'bar'})).toBe(false);
    });

    it('should compile typeErrors function for RpcError with literal type argument', () => {
        const rt = runType<RpcError<'validation-error'>>();
        const typeErrors = rt.createJitFunction(JitFunctions.typeErrors);

        const validError = new RpcError({
            statusCode: 422,
            message: 'validation failed',
            publicMessage: 'validation failed',
            type: 'validation-error',
        });

        const invalidError = new RpcError({
            statusCode: 400,
            message: 'error',
            publicMessage: 'error',
            type: 'wrong-type',
        });

        expect(typeErrors(validError)).toEqual([]);
        expect(typeErrors(invalidError).length).toBeGreaterThan(0);
        expect(typeErrors({foo: 'bar'}).length).toBeGreaterThan(0);
    });

    it('should compile prepareForJson function for RpcError with literal type argument', () => {
        const rt = runType<RpcError<'my-error'>>();
        const prepareForJson = rt.createJitFunction(JitFunctions.prepareForJson);

        const error = new RpcError({
            statusCode: 400,
            message: 'error',
            publicMessage: 'error',
            type: 'my-error',
        });

        const prepared = prepareForJson(error);
        expect(prepared).toBeDefined();
        expect(prepared.type).toBe('my-error');
    });

    it('should compile restoreFromJson function for RpcError with literal type argument', () => {
        const rt = runType<RpcError<'my-error'>>();
        const restoreFromJson = rt.createJitFunction(JitFunctions.restoreFromJson);

        const jsonData = {
            'mion:isΣrrθr': true,
            statusCode: 400,
            message: 'error',
            publicMessage: 'error',
            type: 'my-error',
        };

        const restored = restoreFromJson(jsonData);
        expect(restored).toBeInstanceOf(RpcError);
        expect(restored.type).toBe('my-error');
        expect(restored.statusCode).toBe(400);
    });

    it('should compile jsonStringify function for RpcError with literal type argument', () => {
        const rt = runType<RpcError<'my-error'>>();
        const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);

        const error = new RpcError({
            statusCode: 400,
            message: 'error',
            publicMessage: 'error',
            type: 'my-error',
        });

        const jsonString = jsonStringify(error);
        expect(typeof jsonString).toBe('string');
        expect(jsonString).toContain('my-error');
        expect(jsonString).toContain('400');
    });

    it('should compile JIT functions for nested generic types', () => {
        type MyType = {
            error: RpcError<'nested-error'>;
            value: string;
        };

        const rt = runType<MyType>();
        const isType = rt.createJitFunction(JitFunctions.isType);
        const typeErrors = rt.createJitFunction(JitFunctions.typeErrors);

        const validData = {
            error: new RpcError({
                statusCode: 400,
                message: 'error',
                publicMessage: 'error',
                type: 'nested-error',
            }),
            value: 'test',
        };

        const invalidData = {
            error: new RpcError({
                statusCode: 400,
                message: 'error',
                publicMessage: 'error',
                type: 'wrong-type',
            }),
            value: 'test',
        };

        expect(isType(validData)).toBe(true);
        expect(isType(invalidData)).toBe(false);
        expect(typeErrors(validData)).toEqual([]);
        expect(typeErrors(invalidData).length).toBeGreaterThan(0);
    });

    it('should compile JIT functions for arrays of generic types', () => {
        type ErrorList = Array<RpcError<'list-error'>>;

        const rt = runType<ErrorList>();
        const isType = rt.createJitFunction(JitFunctions.isType);
        const typeErrors = rt.createJitFunction(JitFunctions.typeErrors);

        const validArray = [
            new RpcError({
                statusCode: 400,
                message: 'error 1',
                publicMessage: 'error 1',
                type: 'list-error',
            }),
            new RpcError({
                statusCode: 400,
                message: 'error 2',
                publicMessage: 'error 2',
                type: 'list-error',
            }),
        ];

        const invalidArray = [
            new RpcError({
                statusCode: 400,
                message: 'error',
                publicMessage: 'error',
                type: 'wrong-type',
            }),
        ];

        expect(isType(validArray)).toBe(true);
        expect(isType(invalidArray)).toBe(false);
        expect(typeErrors(validArray)).toEqual([]);
        expect(typeErrors(invalidArray).length).toBeGreaterThan(0);
    });

    it('should handle generic types with multiple literal type arguments', () => {
        type MultiGeneric<A extends string, B extends number> = {
            typeA: A;
            typeB: B;
        };

        const rt = runType<MultiGeneric<'hello', 42>>();
        const isType = rt.createJitFunction(JitFunctions.isType);

        expect(isType({typeA: 'hello', typeB: 42})).toBe(true);
        expect(isType({typeA: 'world', typeB: 42})).toBe(false);
        expect(isType({typeA: 'hello', typeB: 100})).toBe(false);
    });
});
