/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {registerRoutes, resetRouter, initRouter} from '../router';
import {dispatchRoute} from '../dispatch';
import {route, headersHook, hook} from './handlers';
import {headersFromRecord} from './headers';
import {MionHeaders} from '../types/context';
import {HeadersList} from '../types/HeadersList';
import {PublicRpcError, RpcError} from '@mionkit/core';
import {JitFunctions, runType} from '@mionkit/run-types';

type RawRequest = {
    headers: MionHeaders;
    body: string;
};

describe('Request and Response Headers', () => {
    const getDefaultRequest = (path: string, params?: any, rawHeaders: Record<string, string> = {}): RawRequest => ({
        headers: headersFromRecord(rawHeaders),
        body: JSON.stringify({[path]: params}),
    });

    beforeEach(() => resetRouter());

    describe('can compile jit functions for headers', () => {
        const MyHeaders = runType<HeadersList<['Authorization', 'X-User-Id'?]>>();

        it('should compile isType function for headers', () => {
            const isType = MyHeaders.createJitFunction(JitFunctions.isType, {noIsArrayCheck: true});

            expect(isType(['Bearer 1234'])).toEqual(true);
            expect(isType(['Bearer 1234', 'user-1234'])).toEqual(true);
            expect(isType([undefined, 'user-1234'])).toEqual(false);
            expect(isType(3)).toEqual(false);
        });

        it('should compile typeErrors function for headers', () => {
            const typeErrors = MyHeaders.createJitFunction(JitFunctions.typeErrors, {noIsArrayCheck: true});

            expect(typeErrors(['Bearer 1234'])).toEqual([]);
            expect(typeErrors(['Bearer 1234', 'user-1234'])).toEqual([]);
            expect(typeErrors([undefined, 'user-1234'])).toEqual([{path: [0], expected: 'string'}]);
            // as we using noIsArrayCheck, it will not check if it is an array, and will fail when checking v[0]
            expect(typeErrors(3)).toEqual([{path: [0], expected: 'string'}]);
        });
    });

    describe('Reading headers in headersHook', () => {
        it('should extract and pass single header value to headersHook', async () => {
            const shared = {auth: {token: null as any}};
            const getSharedData = (): typeof shared => shared;

            initRouter({contextDataFactory: getSharedData});
            registerRoutes({
                auth: headersHook((ctx, [token]: HeadersList<['Authorization']>): void => {
                    ctx.shared.auth.token = token;
                }),
                getUser: route((ctx): string => `Token: ${ctx.shared.auth.token}`),
            });

            const request = getDefaultRequest('getUser', [], {Authorization: 'bearer-token-123'});

            const response = await dispatchRoute('/getUser', request.body, request.headers, headersFromRecord({}), request, {});

            expect(response.hasErrors).toBeFalsy();
            expect(response.body.getUser).toEqual('Token: bearer-token-123');
        });

        it('should handle case-insensitive header names', async () => {
            const shared = {auth: {token: null as any}};
            const getSharedData = (): typeof shared => shared;

            initRouter({contextDataFactory: getSharedData});
            registerRoutes({
                auth: headersHook((ctx, [token]: HeadersList<['Authorization']>): void => {
                    ctx.shared.auth.token = token;
                }),
                getUser: route((ctx): string => `Token: ${ctx.shared.auth.token}`),
            });

            // Use mixed case header name
            const request = getDefaultRequest('getUser', [], {AuThoriZatioN: 'mixed-case-token'});

            const response = await dispatchRoute('/getUser', request.body, request.headers, headersFromRecord({}), request, {});

            expect(response.hasErrors).toBeFalsy();
            expect(response.body.getUser).toEqual('Token: mixed-case-token');
        });

        it('should return validation error when required header is missing', async () => {
            const shared = {auth: {token: null as any}};
            const getSharedData = (): typeof shared => shared;

            initRouter({contextDataFactory: getSharedData});
            registerRoutes({
                auth: headersHook((ctx, [token]: HeadersList<['Authorization']>): void => {
                    ctx.shared.auth.token = token;
                }),
                getUser: route((ctx): string => 'user'),
            });

            // No Authorization header provided
            const request = getDefaultRequest('getUser', []);

            const response = await dispatchRoute('/getUser', request.body, request.headers, headersFromRecord({}), request, {});

            expect(response.hasErrors).toBeTruthy();
            const error = response.body.auth;
            const expected = new RpcError({
                statusCode: 400,
                type: 'headers-validation-error',
                publicMessage: `Invalid headers in 'auth', validation failed.`,
                errorData: expect.anything(),
            });
            expect(error).toEqual(expected);
        });

        it('should error on empty header values', async () => {
            const shared = {auth: {token: null as any}};
            const getSharedData = (): typeof shared => shared;

            initRouter({contextDataFactory: getSharedData});
            registerRoutes({
                auth: headersHook((ctx, [token]: HeadersList<['Authorization']>): void => {
                    ctx.shared.auth.token = token;
                }),
                getUser: route((ctx): string => `Token: ${ctx.shared.auth.token || 'empty'}`),
            });

            // Empty Authorization header
            const request = getDefaultRequest('getUser', [], {Authorization: ''});

            const response = await dispatchRoute('/getUser', request.body, request.headers, headersFromRecord({}), request, {});

            // Empty string should fail validation
            expect(response.hasErrors).toBeTruthy();
        });

        it('should not error on empty header values when optional', async () => {
            const shared = {auth: {token: null as any}};
            const getSharedData = (): typeof shared => shared;

            initRouter({contextDataFactory: getSharedData});
            registerRoutes({
                auth: headersHook((ctx, [token]: HeadersList<['Authorization'?]>): void => {
                    ctx.shared.auth.token = token;
                }),
                getUser: route((ctx): string => `Token: ${ctx.shared.auth.token || 'empty'}`),
            });

            // Empty Authorization header
            const request = getDefaultRequest('getUser', [], {});

            const response = await dispatchRoute('/getUser', request.body, request.headers, headersFromRecord({}), request, {});

            expect(response.hasErrors).toBeFalsy();
            expect(response.body.getUser).toEqual('Token: empty');
        });
    });

    describe('Setting headers from hook return values', () => {
        it('should set single header from hook return value', async () => {
            const shared = {data: 'test'};
            const getSharedData = (): typeof shared => shared;

            initRouter({contextDataFactory: getSharedData});
            registerRoutes({
                setHeaderHook: hook((ctx): HeadersList<['x-custom']> => {
                    return ['custom-value'];
                }),
                testRoute: route((): string => 'ok'),
            });

            const request = getDefaultRequest('testRoute', []);

            const response = await dispatchRoute('/testRoute', request.body, request.headers, headersFromRecord({}), request, {});

            expect(response.hasErrors).toBeFalsy();
            expect(response.headers.get('x-custom')).toEqual('custom-value');
        });

        it('should set multiple headers from hook return value', async () => {
            const shared = {data: 'test'};
            const getSharedData = (): typeof shared => shared;

            initRouter({contextDataFactory: getSharedData});
            registerRoutes({
                setHeadersHook: hook((ctx): HeadersList<['x-custom', 'x-token', 'x-version']> => {
                    return ['custom-value', 'token-value', 'v1.0'];
                }),
                testRoute: route((): string => 'ok'),
            });

            const request = getDefaultRequest('testRoute', []);

            const response = await dispatchRoute('/testRoute', request.body, request.headers, headersFromRecord({}), request, {});

            expect(response.hasErrors).toBeFalsy();
            expect(response.headers.get('x-custom')).toEqual('custom-value');
            expect(response.headers.get('x-token')).toEqual('token-value');
            expect(response.headers.get('x-version')).toEqual('v1.0');
        });

        it('should handle case-insensitive header names in response', async () => {
            const shared = {data: 'test'};
            const getSharedData = (): typeof shared => shared;

            initRouter({contextDataFactory: getSharedData});
            registerRoutes({
                setHeaderHook: hook((ctx): HeadersList<['X-Custom']> => {
                    return ['custom-value'];
                }),
                testRoute: route((): string => 'ok'),
            });

            const request = getDefaultRequest('testRoute', []);

            const response = await dispatchRoute('/testRoute', request.body, request.headers, headersFromRecord({}), request, {});

            expect(response.hasErrors).toBeFalsy();
            // Headers should be stored in lowercase
            expect(response.headers.get('x-custom')).toEqual('custom-value');
            expect(response.headers.get('X-CUSTOM')).toEqual('custom-value');
        });

        it('should skip undefined header values', async () => {
            const shared = {data: 'test'};
            const getSharedData = (): typeof shared => shared;

            initRouter({contextDataFactory: getSharedData});
            registerRoutes({
                setHeadersHook: hook((ctx): HeadersList<['x-custom', 'x-token'?]> => {
                    return ['custom-value'];
                }),
                testRoute: route((): string => 'ok'),
            });

            const request = getDefaultRequest('testRoute', []);

            const response = await dispatchRoute('/testRoute', request.body, request.headers, headersFromRecord({}), request, {});

            expect(response.hasErrors).toBeFalsy();
            expect(response.headers.get('x-custom')).toEqual('custom-value');
            expect(response.headers.get('x-token')).toBeUndefined();
        });
    });

    describe('Setting headers from route return values', () => {
        it('should set single header from route return value', async () => {
            const shared = {data: 'test'};
            const getSharedData = (): typeof shared => shared;

            initRouter({contextDataFactory: getSharedData});
            registerRoutes({
                getUser: route((ctx): HeadersList<['x-user-id']> => {
                    return ['user-123'];
                }),
            });

            const request = getDefaultRequest('getUser', []);

            const response = await dispatchRoute('/getUser', request.body, request.headers, headersFromRecord({}), request, {});

            expect(response.hasErrors).toBeFalsy();
            expect(response.headers.get('x-user-id')).toEqual('user-123');
        });

        it('should set multiple headers from route return value', async () => {
            const shared = {data: 'test'};
            const getSharedData = (): typeof shared => shared;

            initRouter({contextDataFactory: getSharedData});
            registerRoutes({
                getUser: route((ctx): HeadersList<['x-user-id', 'x-user-role', 'x-timestamp']> => {
                    return ['user-123', 'admin', '1234567890'];
                }),
            });

            const request = getDefaultRequest('getUser', []);

            const response = await dispatchRoute('/getUser', request.body, request.headers, headersFromRecord({}), request, {});

            expect(response.hasErrors).toBeFalsy();
            expect(response.headers.get('x-user-id')).toEqual('user-123');
            expect(response.headers.get('x-user-role')).toEqual('admin');
            expect(response.headers.get('x-timestamp')).toEqual('1234567890');
        });

        it('should handler return headers when headers type is n and union', async () => {
            const shared = {data: 'test'};
            const getSharedData = (): typeof shared => shared;

            initRouter({contextDataFactory: getSharedData});
            registerRoutes({
                getUser: route((ctx): HeadersList<['x-user-id']> | RpcError<'x-some-error'> => {
                    return ['user-123'];
                }),
            });

            const request = getDefaultRequest('getUser', []);

            const response = await dispatchRoute('/getUser', request.body, request.headers, headersFromRecord({}), request, {});

            expect(response.hasErrors).toBeFalsy();
            expect(response.headers.get('x-user-id')).toEqual('user-123');
        });
    });

    describe('Multiple headers', () => {
        it('should read and set multiple headers simultaneously', async () => {
            const shared = {auth: {token: null as any, userId: null as any}};
            const getSharedData = (): typeof shared => shared;

            initRouter({contextDataFactory: getSharedData});
            registerRoutes({
                auth: headersHook(
                    (ctx, [token, userId]: HeadersList<['Authorization', 'X-User-Id']>): HeadersList<['x-auth-status']> => {
                        ctx.shared.auth.token = token;
                        ctx.shared.auth.userId = userId;
                        return ['authenticated'];
                    }
                ),
                getUser: route((ctx): string => `User ${ctx.shared.auth.userId} with token ${ctx.shared.auth.token}`),
            });

            const request = getDefaultRequest('getUser', [], {
                Authorization: 'bearer-token-123',
                'X-User-Id': 'user-456',
            });

            const response = await dispatchRoute('/getUser', request.body, request.headers, headersFromRecord({}), request, {});

            expect(response.hasErrors).toBeFalsy();
            expect(response.body.getUser).toEqual('User user-456 with token bearer-token-123');
            expect(response.headers.get('x-auth-status')).toEqual('authenticated');
        });

        it('should handle multiple headers with different cases', async () => {
            const shared = {auth: {token: null as any, userId: null as any}};
            const getSharedData = (): typeof shared => shared;

            initRouter({contextDataFactory: getSharedData});
            registerRoutes({
                auth: headersHook((ctx, [token, userId]: HeadersList<['Authorization', 'X-User-Id']>): void => {
                    ctx.shared.auth.token = token;
                    ctx.shared.auth.userId = userId;
                }),
                getUser: route((ctx): string => `User ${ctx.shared.auth.userId}`),
            });

            // Use different case variations
            const request = getDefaultRequest('getUser', [], {
                authorization: 'bearer-token-123',
                'x-user-id': 'user-456',
            });

            const response = await dispatchRoute('/getUser', request.body, request.headers, headersFromRecord({}), request, {});

            expect(response.hasErrors).toBeFalsy();
            expect(response.body.getUser).toEqual('User user-456');
        });

        it('should fail validation when one of multiple required headers is missing', async () => {
            const shared = {auth: {token: null as any, userId: null as any}};
            const getSharedData = (): typeof shared => shared;

            initRouter({contextDataFactory: getSharedData});
            registerRoutes({
                auth: headersHook((ctx, [token, userId]: HeadersList<['Authorization', 'X-User-Id']>): void => {
                    ctx.shared.auth.token = token;
                    ctx.shared.auth.userId = userId;
                }),
                getUser: route((ctx): string => 'user'),
            });

            // Only provide Authorization header, missing X-User-Id
            const request = getDefaultRequest('getUser', [], {
                Authorization: 'bearer-token-123',
            });

            const response = await dispatchRoute('/getUser', request.body, request.headers, headersFromRecord({}), request, {});

            expect(response.hasErrors).toBeTruthy();
            const error = response.body.auth;
            const expected = new RpcError({
                statusCode: 400,
                type: 'headers-validation-error',
                publicMessage: `Invalid headers in 'auth', validation failed.`,
                errorData: expect.anything(),
            });
            expect(error).toEqual(expected);
        });
    });

    describe('Edge cases', () => {
        it('should handle headers with special characters', async () => {
            const shared = {auth: {token: null as any}};
            const getSharedData = (): typeof shared => shared;

            initRouter({contextDataFactory: getSharedData});
            registerRoutes({
                auth: headersHook((ctx, [token]: HeadersList<['Authorization']>): void => {
                    ctx.shared.auth.token = token;
                }),
                getUser: route((ctx): string => `Token: ${ctx.shared.auth.token}`),
            });

            const request = getDefaultRequest('getUser', [], {
                Authorization:
                    'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
            });

            const response = await dispatchRoute('/getUser', request.body, request.headers, headersFromRecord({}), request, {});

            expect(response.hasErrors).toBeFalsy();
            expect(response.body.getUser).toContain('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
        });

        it('should handle headers with whitespace', async () => {
            const shared = {auth: {token: null as any}};
            const getSharedData = (): typeof shared => shared;

            initRouter({contextDataFactory: getSharedData});
            registerRoutes({
                auth: headersHook((ctx, [token]: HeadersList<['Authorization']>): void => {
                    ctx.shared.auth.token = token;
                }),
                getUser: route((ctx): string => `Token: ${ctx.shared.auth.token}`),
            });

            const request = getDefaultRequest('getUser', [], {
                Authorization: '  bearer-token-with-spaces  ',
            });

            const response = await dispatchRoute('/getUser', request.body, request.headers, headersFromRecord({}), request, {});

            expect(response.hasErrors).toBeFalsy();
            expect(response.body.getUser).toEqual('Token:   bearer-token-with-spaces  ');
        });

        it('should handle long header values', async () => {
            const shared = {auth: {token: null as any}};
            const getSharedData = (): typeof shared => shared;

            initRouter({contextDataFactory: getSharedData});
            registerRoutes({
                auth: headersHook((ctx, [token]: HeadersList<['Authorization']>): void => {
                    ctx.shared.auth.token = token;
                }),
                getUser: route((ctx): string => `Token length: ${ctx.shared.auth.token.length}`),
            });

            const longToken = 'x'.repeat(1000);
            const request = getDefaultRequest('getUser', [], {
                Authorization: longToken,
            });

            const response = await dispatchRoute('/getUser', request.body, request.headers, headersFromRecord({}), request, {});

            expect(response.hasErrors).toBeFalsy();
            expect(response.body.getUser).toEqual('Token length: 1000');
        });

        it('should preserve header order when setting multiple headers', async () => {
            const shared = {data: 'test'};
            const getSharedData = (): typeof shared => shared;

            initRouter({contextDataFactory: getSharedData});
            registerRoutes({
                setHeadersHook: hook((ctx): HeadersList<['x-first', 'x-second', 'x-third']> => {
                    return ['first-value', 'second-value', 'third-value'];
                }),
                testRoute: route((): string => 'ok'),
            });

            const request = getDefaultRequest('testRoute', []);

            const response = await dispatchRoute('/testRoute', request.body, request.headers, headersFromRecord({}), request, {});

            expect(response.hasErrors).toBeFalsy();
            expect(response.headers.get('x-first')).toEqual('first-value');
            expect(response.headers.get('x-second')).toEqual('second-value');
            expect(response.headers.get('x-third')).toEqual('third-value');
        });

        it('should handle overwriting headers set by multiple hooks', async () => {
            const shared = {data: 'test'};
            const getSharedData = (): typeof shared => shared;

            initRouter({contextDataFactory: getSharedData});
            registerRoutes({
                firstHook: hook((ctx): HeadersList<['x-custom']> => {
                    return ['first-value'];
                }),
                secondHook: hook((ctx): HeadersList<['x-custom']> => {
                    return ['second-value'];
                }),
                testRoute: route((): string => 'ok'),
            });

            const request = getDefaultRequest('testRoute', []);

            const response = await dispatchRoute('/testRoute', request.body, request.headers, headersFromRecord({}), request, {});

            expect(response.hasErrors).toBeFalsy();
            // The last hook to set the header should win
            expect(response.headers.get('x-custom')).toEqual('second-value');
        });

        it('should handle unicode characters in header values', async () => {
            const shared = {auth: {token: null as any}};
            const getSharedData = (): typeof shared => shared;

            initRouter({contextDataFactory: getSharedData});
            registerRoutes({
                auth: headersHook((ctx, [token]: HeadersList<['Authorization']>): void => {
                    ctx.shared.auth.token = token;
                }),
                getUser: route((ctx): string => `Token: ${ctx.shared.auth.token}`),
            });

            const request = getDefaultRequest('getUser', [], {
                Authorization: 'Bearer 🔐-token-🎯',
            });

            const response = await dispatchRoute('/getUser', request.body, request.headers, headersFromRecord({}), request, {});

            expect(response.hasErrors).toBeFalsy();
            expect(response.body.getUser).toEqual('Token: Bearer 🔐-token-🎯');
        });
    });
});
