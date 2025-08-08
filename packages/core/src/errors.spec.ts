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
        const error = new RpcError({statusCode: 400, publicMessage: 'error'});
        expect(typeof error.id).toEqual('string');
        expect((error.id as string).length).toEqual(36);

        setErrorOptions({autoGenerateErrorId: false});
        const error2 = new RpcError({statusCode: 400, publicMessage: 'error'});
        expect(error2.id).toEqual(undefined);
    });

    it('Parse and Stringify errors using JSON', () => {
        const error = new RpcError({
            id: '123WS',
            statusCode: 400,
            publicMessage: 'this is a public message',
            message: 'this is a private message',
            errorData: {data: 'data'},
        });

        const stringifiedError = JSON.stringify(error);
        const parsedError = new RpcError(JSON.parse(stringifiedError));
        expect(parsedError).toEqual(error);

        const errorWithSameMessage = new RpcError({
            id: '123WX',
            statusCode: 400,
            publicMessage: 'this is a message',
            message: 'this is a message',
            errorData: {data: 'data'},
        });

        const stringifiedError2 = JSON.stringify(errorWithSameMessage);
        const parsedError2 = new RpcError(JSON.parse(stringifiedError2));
        expect(parsedError2).toEqual(errorWithSameMessage);
    });
});

describe('TypedError should', () => {
    it('create a basic typed error with core properties', () => {
        const error = new TypedError({
            type: 'validation',
            message: 'Invalid input',
            name: 'ValidationError',
        });

        expect(error.isΣrrθr).toBe(true);
        expect(error.type).toBe('validation');
        expect(error.message).toBe('Invalid input');
        expect(error.name).toBe('ValidationError');
        expect(error instanceof Error).toBe(true);
        expect(error instanceof TypedError).toBe(true);
    });

    it('handle original error stack trace', () => {
        const originalError = new Error('Original error');
        const error = new TypedError({
            type: 'wrapped',
            originalError,
            name: 'WrappedError',
        });

        expect(error.message).toBe('Original error');
        expect(error.stack).toBe(originalError.stack);
    });

    it('use default values when not provided', () => {
        const error = new TypedError({});

        expect(error.isΣrrθr).toBe(true);
        expect(error.type).toBe('unknown');
        expect(error.message).toBe('');
        expect(error.name).toBe('TypedError');
    });

    it('be identified by type guard', () => {
        const error = new TypedError({type: 'test'});
        const plainError = new Error('plain');
        const plainObject = {isΣrrθr: true, type: 'fake', name: 'fake', message: 'fake'};

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
            statusCode: 400,
            type: 'validation',
            message: 'Invalid request',
            publicMessage: 'Bad request',
        });

        expect(error instanceof TypedError).toBe(true);
        expect(error instanceof RpcError).toBe(true);
        expect(error.isΣrrθr).toBe(true);
        expect(error.type).toBe('validation');
        expect(error.message).toBe('Invalid request');
        expect(error.statusCode).toBe(400);
        expect(error.publicMessage).toBe('Bad request');
    });

    it('be identified by both type guards', () => {
        const error = new RpcError({statusCode: 500, publicMessage: 'Server error'});

        expect(isTypedError(error)).toBe(true);
        expect(isRpcError(error)).toBe(true);
    });
});
