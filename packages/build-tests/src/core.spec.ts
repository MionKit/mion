/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * Core package build verification tests.
 * These tests verify that @mionkit/core works correctly when imported from built files.
 */

import {RpcError, isRpcError, HeadersSubset, TypedError, isTypedError, isAnyError} from '@mionkit/core';

describe('@mionkit/core Build Tests', () => {
    describe('RpcError', () => {
        it('should create RpcError with type', () => {
            const error = new RpcError({
                publicMessage: 'Test error',
                type: 'test-error',
            });

            expect(error).toBeInstanceOf(RpcError);
            expect(error.publicMessage).toBe('Test error');
            expect(error.type).toBe('test-error');
        });

        it('should create RpcError with status code', () => {
            const error = new RpcError({
                publicMessage: 'Not found',
                type: 'not-found',
                statusCode: 404,
            });

            expect(error.statusCode).toBe(404);
        });

        it('should create RpcError with error data', () => {
            const error = new RpcError({
                publicMessage: 'Validation failed',
                type: 'validation-error',
                errorData: {field: 'email', reason: 'invalid format'},
            });

            expect(error.publicMessage).toBe('Validation failed');
            expect(error.errorData).toEqual({field: 'email', reason: 'invalid format'});
        });

        it('should create RpcError with message', () => {
            const error = new RpcError({
                publicMessage: 'Public message',
                message: 'Internal message for logging',
                type: 'internal-error',
            });

            expect(error.publicMessage).toBe('Public message');
            expect(error.message).toBe('Internal message for logging');
        });

        it('should extend TypedError', () => {
            const error = new RpcError({
                publicMessage: 'Test',
                type: 'test',
            });

            expect(error).toBeInstanceOf(TypedError);
        });
    });

    describe('TypedError', () => {
        it('should create TypedError with type', () => {
            const error = new TypedError({
                message: 'Test error',
                type: 'test-type',
            });

            expect(error).toBeInstanceOf(TypedError);
            expect(error.type).toBe('test-type');
            expect(error.message).toBe('Test error');
        });

        it('should have mion error marker', () => {
            const error = new TypedError({
                message: 'Test',
                type: 'test',
            });

            expect(error['mion@isΣrrθr']).toBe(true);
        });
    });

    describe('isRpcError', () => {
        it('should return true for RpcError instances', () => {
            const error = new RpcError({
                publicMessage: 'Test',
                type: 'test',
            });

            expect(isRpcError(error)).toBe(true);
        });

        it('should return true for TypedError instances (TypedError is a subset of RpcError structure)', () => {
            // Note: isRpcError checks for RpcError-like structure, not instanceof
            // TypedError has the same base structure as RpcError (mion@isΣrrθr, type, message)
            // so it passes the structural check
            const error = new TypedError({
                message: 'Test',
                type: 'test',
            });

            expect(isRpcError(error)).toBe(true);
        });

        it('should return false for regular Error instances', () => {
            const error = new Error('Regular error');
            expect(isRpcError(error)).toBe(false);
        });

        it('should return false for null/undefined', () => {
            expect(isRpcError(null)).toBe(false);
            expect(isRpcError(undefined)).toBe(false);
        });

        it('should return false for plain objects', () => {
            const obj = {publicMessage: 'Test', type: 'test'};
            expect(isRpcError(obj)).toBe(false);
        });
    });

    describe('isTypedError', () => {
        it('should return true for TypedError instances', () => {
            const error = new TypedError({
                message: 'Test',
                type: 'test',
            });

            expect(isTypedError(error)).toBe(true);
        });

        it('should return true for RpcError instances', () => {
            const error = new RpcError({
                publicMessage: 'Test',
                type: 'test',
            });

            expect(isTypedError(error)).toBe(true);
        });

        it('should return false for regular Error instances', () => {
            const error = new Error('Regular error');
            expect(isTypedError(error)).toBe(false);
        });
    });

    describe('isAnyError', () => {
        it('should return true for TypedError', () => {
            const error = new TypedError({message: 'Test', type: 'test'});
            expect(isAnyError(error)).toBe(true);
        });

        it('should return true for RpcError', () => {
            const error = new RpcError({publicMessage: 'Test', type: 'test'});
            expect(isAnyError(error)).toBe(true);
        });

        it('should return true for regular Error', () => {
            const error = new Error('Test');
            expect(isAnyError(error)).toBe(true);
        });

        it('should return false for null/undefined', () => {
            expect(isAnyError(null)).toBe(false);
            expect(isAnyError(undefined)).toBe(false);
        });
    });

    describe('HeadersSubset', () => {
        it('should create HeadersSubset with headers', () => {
            const headers = new HeadersSubset({
                Authorization: 'Bearer token123',
            });

            expect(headers).toBeInstanceOf(HeadersSubset);
            expect(headers.headers.Authorization).toBe('Bearer token123');
        });

        it('should handle multiple headers', () => {
            const headers = new HeadersSubset({
                Authorization: 'Bearer token',
                'Content-Type': 'application/json',
            });

            expect(headers.headers.Authorization).toBe('Bearer token');
            expect(headers.headers['Content-Type']).toBe('application/json');
        });

        it('should store headers in headers property', () => {
            const headers = new HeadersSubset({
                'X-Custom-Header': 'custom-value',
            });

            expect(headers.headers['X-Custom-Header']).toBe('custom-value');
        });
    });

    describe('Module exports', () => {
        it('should export RpcError class', () => {
            expect(RpcError).toBeDefined();
            expect(typeof RpcError).toBe('function');
        });

        it('should export TypedError class', () => {
            expect(TypedError).toBeDefined();
            expect(typeof TypedError).toBe('function');
        });

        it('should export isRpcError function', () => {
            expect(isRpcError).toBeDefined();
            expect(typeof isRpcError).toBe('function');
        });

        it('should export isTypedError function', () => {
            expect(isTypedError).toBeDefined();
            expect(typeof isTypedError).toBe('function');
        });

        it('should export isAnyError function', () => {
            expect(isAnyError).toBeDefined();
            expect(typeof isAnyError).toBe('function');
        });

        it('should export HeadersSubset class', () => {
            expect(HeadersSubset).toBeDefined();
            expect(typeof HeadersSubset).toBe('function');
        });
    });
});
