/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError, TypedError, setErrorOptions, isTypedError, isRpcError} from './errors';

describe('Route errors should', () => {
    it('automatically generate an id when RouteOptions autoGenerateErrorId is set to true', () => {
        setErrorOptions({autoGenerateErrorId: true});
        const error = new RpcError({publicMessage: 'error', type: 'test-error'});
        expect(typeof error.id).toEqual('string');
        expect((error.id as string).length).toEqual(36);

        setErrorOptions({autoGenerateErrorId: false});
        const error2 = new RpcError({publicMessage: 'error', type: 'test-error'});
        expect(error2.id).toEqual(undefined);
    });

    it('Parse and Stringify errors using JSON', () => {
        const error = new RpcError({
            id: '123WS',
            publicMessage: 'this is a public message',
            errorData: {data: 'data'},
            type: 'test-error',
        });

        const stringifiedError = JSON.stringify(error);
        const parsedError = new RpcError(JSON.parse(stringifiedError));
        expect(parsedError).toEqual(error);

        const errorWithSameMessage = new RpcError({
            id: '123WX',
            publicMessage: 'this is a message',
            errorData: {data: 'data'},
            type: 'test-error',
        });

        const stringifiedError2 = JSON.stringify(errorWithSameMessage);
        const parsedError2 = new RpcError(JSON.parse(stringifiedError2));
        expect(parsedError2).toEqual(errorWithSameMessage);
    });
});

describe('TypedError should', () => {
    it('create a basic typed error with core properties', () => {
        const error = new TypedError({
            message: 'Invalid input',
            type: 'validation-error',
        });

        expect(error['mion:isΣrrθr']).toBe(true);
        expect(error.message).toBe('Invalid input');
        expect(error.type).toBe('validation-error');
        expect(error instanceof Error).toBe(true);
        expect(error instanceof TypedError).toBe(true);
    });

    it('handle original error stack trace', () => {
        const originalError = new Error('Original error');
        const error = new TypedError({
            originalError,
            type: 'wrapped-error',
        });

        expect(error.message).toBe('Original error');
        expect(error.stack).toBe(originalError.stack);
    });

    it('use default values when not provided', () => {
        const error = new TypedError({
            type: 'typed-error',
        });

        expect(error['mion:isΣrrθr']).toBe(true);
        expect(error.type).toBe('typed-error');
        expect(error.message).toBe('');
    });

    it('be identified by type guard', () => {
        const error = new TypedError({type: 'fake'});
        const plainError = new Error('plain');
        const plainObject = {'mion:isΣrrθr': true, type: 'fake', message: ''};

        expect(isTypedError(error)).toBe(true);
        expect(isTypedError(plainError)).toBe(false);
        expect(isTypedError(plainObject)).toBe(true); // Should work with duck typing
        expect(isTypedError(null)).toBe(false);
        expect(isTypedError(undefined)).toBe(false);
    });
});

describe('RpcError inheritance should', () => {
    it('extend TypedError correctly', () => {
        const error = new RpcError({
            type: 'validation-error',
            publicMessage: 'Bad request',
            message: 'Invalid request',
        });

        expect(error instanceof TypedError).toBe(true);
        expect(error instanceof RpcError).toBe(true);
        expect(error['mion:isΣrrθr']).toBe(true);
        expect(error.type).toBe('validation-error');
        expect(error.publicMessage).toBe('Bad request');
        expect(error.message).toBe('Invalid request');
    });

    it('be identified by both type guards', () => {
        const error = new RpcError({
            publicMessage: 'Server error',
            type: 'server-error',
        });

        expect(isTypedError(error)).toBe(true);
        expect(isRpcError(error)).toBe(true);
    });
});
