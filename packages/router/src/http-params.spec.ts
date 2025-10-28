/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {registerRoutes, resetRouter, initRouter} from './router';
import {dispatchRoute} from './dispatch';
import {Routes} from './types/general';
import {hook, route} from './handlers';
import {headersFromRecord} from './headers';
import {HttpHeader, Cookie, BodyParam} from './types/http-params';
import {MionHeaders} from './types/context';

type RawRequest = {
    headers: MionHeaders;
    body: string;
};

describe('HTTP Parameters (HttpHeader, Cookie, BodyParam)', () => {
    const getDefaultRequest = (path: string, params?): RawRequest => ({
        headers: headersFromRecord({}),
        body: JSON.stringify({[path]: params}),
    });

    beforeEach(() => resetRouter());

    describe('HttpHeader parameter type', () => {
        it('should create HttpHeader instances with name and value', () => {
            const header = new HttpHeader('authorization', 'Bearer token123');
            expect(header.name).toBe('authorization');
            expect(header.value).toBe('Bearer token123');
            expect(header.options).toBeUndefined();
        });

        it('should create HttpHeader instances with options', () => {
            const header = new HttpHeader('x-custom', 'value', {maxAge: 3600});
            expect(header.name).toBe('x-custom');
            expect(header.value).toBe('value');
            expect(header.options?.maxAge).toBe(3600);
        });

        it('should support generic type parameters', () => {
            const header = new HttpHeader<'authorization', string>('authorization', 'token');
            expect(header.name).toBe('authorization');
            expect(header.value).toBe('token');
        });
    });

    describe('Cookie parameter type', () => {
        it('should create Cookie instances with name and value', () => {
            const cookie = new Cookie('session', 'abc123');
            expect(cookie.name).toBe('session');
            expect(cookie.value).toBe('abc123');
            expect(cookie.options).toBeUndefined();
        });

        it('should create Cookie instances with options', () => {
            const cookie = new Cookie('session', 'abc123', {httpOnly: true, secure: true});
            expect(cookie.name).toBe('session');
            expect(cookie.value).toBe('abc123');
            expect(cookie.options?.httpOnly).toBe(true);
            expect(cookie.options?.secure).toBe(true);
        });

        it('should support generic type parameter', () => {
            const cookie = new Cookie<'session'>('session', 'value');
            expect(cookie.name).toBe('session');
            expect(cookie.value).toBe('value');
        });
    });

    describe('BodyParam parameter type', () => {
        it('should create BodyParam instances with value', () => {
            const param = new BodyParam({name: 'John', age: 30});
            expect(param.value).toEqual({name: 'John', age: 30});
        });

        it('should support generic type parameter', () => {
            type User = {name: string; age: number};
            const param = new BodyParam<User>({name: 'Jane', age: 25});
            expect(param.value.name).toBe('Jane');
            expect(param.value.age).toBe(25);
        });
    });

    describe('Return value processing', () => {
        it('should handle HttpHeader return values', async () => {
            initRouter();
            const testRoute = route((ctx): HttpHeader<'x-token'> => {
                return new HttpHeader('x-token', 'test-token-123');
            });

            registerRoutes({testRoute});

            const request = getDefaultRequest('testRoute', []);
            const response = await dispatchRoute('/testRoute', request.body, request.headers, headersFromRecord({}), request, {});

            expect(response.headers.get('x-token')).toBe('test-token-123');
        });

        it('should handle Cookie return values', async () => {
            initRouter();
            const testRoute = route((ctx): Cookie<'session'> => {
                return new Cookie('session', 'session-value-456');
            });

            registerRoutes({testRoute});

            const request = getDefaultRequest('testRoute', []);
            const response = await dispatchRoute('/testRoute', request.body, request.headers, headersFromRecord({}), request, {});

            // Cookie should be set via set-cookie header
            const setCookieHeader = response.headers.get('set-cookie');
            expect(setCookieHeader).toBeDefined();
        });

        it('should handle array of HttpHeader and Cookie return values', async () => {
            initRouter();
            const testRoute = route((ctx): (HttpHeader | Cookie)[] => {
                return [new HttpHeader('x-token', 'token-123'), new Cookie('session', 'session-456')];
            });

            registerRoutes({testRoute});

            const request = getDefaultRequest('testRoute', []);
            const response = await dispatchRoute('/testRoute', request.body, request.headers, headersFromRecord({}), request, {});

            expect(response.headers.get('x-token')).toBe('token-123');
        });

        it('should handle mixed return values with HttpHeader/Cookie and regular data', async () => {
            initRouter();
            const testRoute = route((ctx): string | HttpHeader => {
                return new HttpHeader('x-custom', 'custom-value');
            });

            registerRoutes({testRoute});

            const request = getDefaultRequest('testRoute', []);
            const response = await dispatchRoute('/testRoute', request.body, request.headers, headersFromRecord({}), request, {});

            expect(response.headers.get('x-custom')).toBe('custom-value');
        });
    });

    describe('Hook with new parameter types', () => {
        it('should work with hook returning HttpHeader', async () => {
            initRouter();
            const authHook = hook((ctx): HttpHeader<'x-auth'> => {
                return new HttpHeader('x-auth', 'authenticated');
            });

            const testRoute = route((ctx): string => {
                return 'success';
            });

            registerRoutes({auth: authHook, testRoute});

            const request = getDefaultRequest('testRoute', []);
            const response = await dispatchRoute('/testRoute', request.body, request.headers, headersFromRecord({}), request, {});

            expect(response.headers.get('x-auth')).toBe('authenticated');
            expect(response.body.testRoute).toBe('success');
        });
    });
});
