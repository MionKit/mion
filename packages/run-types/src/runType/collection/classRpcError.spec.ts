/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// RpcError is a class shared across most packages so we need to ensure jit functions work correctly
// we test here as core does not have access to run-types

import {RpcError} from '@mionkit/core';
import {DataOnly} from '@mionkit/core';
import {JitFunctions} from '../../constants.functions';
import {runType} from '../../lib/runType';

it('can validate RpcError class', () => {
    const rt = runType<RpcError>();
    const validate = rt.createJitFunction(JitFunctions.isType);
    const error = new RpcError({
        statusCode: 400,
        publicMessage: 'error',
        message: 'error',
    });
    expect(validate(error)).toBe(true);
});

it('can validate RpcError class + errors', () => {
    const rt = runType<RpcError>();
    const valWithErrors = rt.createJitFunction(JitFunctions.typeErrors);
    const error = new RpcError({
        statusCode: 400,
        publicMessage: 'error',
        message: 'error',
    });
    expect(valWithErrors(error)).toEqual([]);
});

it('can serialize/deserialize RpcError class', () => {
    const rt = runType<RpcError>();
    const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);
    const fromJsonVal = rt.createJitFunction(JitFunctions.fromJsonVal);
    const error = new RpcError({
        statusCode: 400,
        publicMessage: 'error',
        message: 'error',
    });
    const restored = fromJsonVal(JSON.parse(jsonStringify(error)));
    expect(restored instanceof RpcError).toBeTruthy();
    expect(restored).toEqual(error);
});

it('can mock RpcError class', async () => {
    const rt = runType<RpcError>();
    const mock = await rt.mock();
    const validate = rt.createJitFunction(JitFunctions.isType);
    expect(mock instanceof RpcError).toBeTruthy();
    expect(validate(mock)).toBe(true);
});

it('check hasUnknownKeys', () => {
    const rt = runType<RpcError>();
    const hasUnknownKeys = rt.createJitFunction(JitFunctions.hasUnknownKeys);
    const error = {
        isΣrrθr: true,
        typeOld: 'test',
        statusCode: 400,
        publicMessage: 'error',
        message: 'error',
        type: 'error',
    } satisfies DataOnly<RpcError>;
    expect(hasUnknownKeys(error)).toBe(false);
    (error as any).extra = 'extra';
    expect(hasUnknownKeys(error)).toBe(true);
});

it('check unknownKeyErrors', () => {
    const rt = runType<RpcError>();
    const unknownKeyErrors = rt.createJitFunction(JitFunctions.unknownKeyErrors);
    const error = {
        isΣrrθr: true,
        typeOld: 'test',
        statusCode: 400,
        publicMessage: 'error',
        message: 'error',
        type: 'error',
    } satisfies DataOnly<RpcError>;
    expect(unknownKeyErrors(error)).toEqual([]);
    (error as any).extra = 'extra';
    expect(unknownKeyErrors(error)).toEqual([{path: ['extra'], expected: 'never'}]);
});

it('check stripUnknownKeys', () => {
    const rt = runType<RpcError>();
    const stripUnknownKeys = rt.createJitFunction(JitFunctions.stripUnknownKeys);
    const error = {
        isΣrrθr: true,
        typeOld: 'test',
        statusCode: 400,
        publicMessage: 'error',
        message: 'error',
        type: 'error',
    } satisfies DataOnly<RpcError>;
    (error as any).extra = 'extra';
    stripUnknownKeys(error);
    expect(error).toEqual({
        isΣrrθr: true,
        type: 'test',
        statusCode: 400,
        publicMessage: 'error',
        message: 'error',
        name: 'error',
    });
});

it('check unknownKeysToUndefined', () => {
    const rt = runType<RpcError>();
    const unknownKeysToUndefined = rt.createJitFunction(JitFunctions.unknownKeysToUndefined);
    const error = {
        isΣrrθr: true,
        typeOld: 'test',
        statusCode: 400,
        publicMessage: 'error',
        message: 'error',
        type: 'error',
    } satisfies DataOnly<RpcError>;
    (error as any).extra = 'extra';
    unknownKeysToUndefined(error);
    expect(error).toEqual({
        isΣrrθr: true,
        type: 'test',
        statusCode: 400,
        publicMessage: 'error',
        message: 'error',
        name: 'error',
        extra: undefined,
    });
});
