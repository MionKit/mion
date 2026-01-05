/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// RpcError is a class shared across most packages so we need to ensure jit functions work correctly
// we test here as core does not have access to run-types

import {RpcError} from '@mionkit/core';
import {JitFunctions} from '../../constants.functions';
import {runType} from '../../createRunType';

it('can validate RpcError class', () => {
    const rt = runType<RpcError<'test-error'>>();
    const validate = rt.createJitFunction(JitFunctions.isType);
    const error = new RpcError({
        message: 'error',
        publicMessage: 'error',
        type: 'test-error',
    });
    expect(validate(error)).toBe(true);
});

it('can validate RpcError class + errors', () => {
    const rt = runType<RpcError<'test-error'>>();
    const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);
    const error = new RpcError({
        message: 'error',
        publicMessage: 'error',
        type: 'test-error',
    });
    expect(valWithErrors(error)).toEqual([]);
});

it('should ensure JSON.stringify excludes message and name from RpcError', () => {
    const error = new RpcError({
        message: 'private error message',
        publicMessage: 'public error message',
        type: 'test-error',
        id: 'error-123',
        errorData: {field: 'value'},
    });

    // Parse to compare structure
    const errorJson = JSON.parse(JSON.stringify(error));

    // Should NOT include 'message' or 'name' in JSON.stringify output
    expect(errorJson).not.toHaveProperty('message');
    expect(errorJson).not.toHaveProperty('name');

    // Should have the expected structure (excluding stack, message, and name)
    expect(errorJson).toEqual({
        'mion@isΣrrθr': true,
        type: 'test-error',
        publicMessage: 'public error message',
        id: 'error-123',
        errorData: {field: 'value'},
    });
});

it('can mock RpcError class', async () => {
    const rt = runType<RpcError<'test-error'>>();
    const mock = await rt.mock();
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(mock instanceof RpcError).toBeTruthy();
    expect(validate(mock)).toBe(true);
});

it('check hasUnknownKeys', () => {
    const rt = runType<RpcError<'test-error'>>();
    const hasUnknownKeys = rt.createJitFunction(JitFunctions.hasUnknownKeys);
    const error = {
        'mion@isΣrrθr': true,
        type: 'test-error',
        publicMessage: 'error',
    };
    expect(hasUnknownKeys(error)).toBe(false);
    (error as any).extra = 'extra';
    expect(hasUnknownKeys(error)).toBe(true);
});

it('check unknownKeyErrors', () => {
    const rt = runType<RpcError<'test-error'>>();
    const unknownKeyErrors = rt.createJitFunction(JitFunctions.unknownKeyErrors);
    const error = {
        'mion@isΣrrθr': true,
        type: 'test-error',
        publicMessage: 'error',
    };
    expect(unknownKeyErrors(error)).toEqual([]);
    (error as any).extra = 'extra';
    expect(unknownKeyErrors(error)).toEqual([{path: ['extra'], expected: 'never'}]);
});

it('check stripUnknownKeys', () => {
    const rt = runType<RpcError<'test-error'>>();
    const stripUnknownKeys = rt.createJitFunction(JitFunctions.stripUnknownKeys);
    const error = {
        'mion@isΣrrθr': true,
        type: 'test-error',
        publicMessage: 'error',
    };
    (error as any).extra = 'extra';
    stripUnknownKeys(error);
    expect(error).toEqual({
        'mion@isΣrrθr': true,
        type: 'test-error',
        publicMessage: 'error',
    });
});

it('check unknownKeysToUndefined', () => {
    const rt = runType<RpcError<'test-error'>>();
    const unknownKeysToUndefined = rt.createJitFunction(JitFunctions.unknownKeysToUndefined);
    const error = {
        'mion@isΣrrθr': true,
        type: 'test-error',
        publicMessage: 'error',
    };
    (error as any).extra = 'extra';
    unknownKeysToUndefined(error);
    expect(error).toEqual({
        'mion@isΣrrθr': true,
        type: 'test-error',
        publicMessage: 'error',
        extra: undefined,
    });
});
