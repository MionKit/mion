/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {registerRoutes, resetRouter, initRouter} from './router';
import {dispatchRoute} from './dispatch';
import {hook, route, headersHook} from './handlers';
import {headersFromRecord} from './headers';
import {HttpHeader, HeadersCollection} from '@mionkit/core';
import {MionHeaders} from './types/context';

type RawRequest = {
    headers: MionHeaders;
    body: string;
};

describe('HTTP Parameters (HttpHeader, HttpCookie, BodyParam)', () => {
    const getDefaultRequest = (path: string, params?, rawHeaders = {}): RawRequest => ({
        headers: headersFromRecord(rawHeaders),
        body: JSON.stringify({[path]: params}),
    });

    beforeEach(() => resetRouter());

    describe('Route validation - preventing HttpHeader/HttpCookie/HeadersList in return types', () => {
        it('should throw error when route returns HttpHeader', () => {
            initRouter();
            const invalidRoute = route((ctx): HttpHeader<'x-token'> => {
                return new HttpHeader('x-token', 'test');
            });

            expect(() => {
                registerRoutes({invalidRoute});
            }).toThrow();
        });

        it('should throw error when route returns HeadersList', () => {
            initRouter();
            const invalidRoute = route((ctx): HeadersCollection<[HttpHeader<'x-token'>]> => {
                return new HeadersCollection([new HttpHeader('x-token', 'test')]);
            });

            expect(() => {
                registerRoutes({invalidRoute});
            }).toThrow();
        });

        it('should throw error when route returns union containing HttpHeader', () => {
            initRouter();
            const invalidRoute = route((ctx): string | HttpHeader<'x-token'> => {
                return 'test';
            });

            expect(() => {
                registerRoutes({invalidRoute});
            }).toThrow();
        });

        it('should throw error when route returns union containing HeadersList', () => {
            initRouter();
            const invalidRoute = route((ctx): string | HeadersCollection<[HttpHeader<'x-token'>]> => {
                return 'test';
            });

            expect(() => {
                registerRoutes({invalidRoute});
            }).toThrow();
        });
    });

    describe('Route validation - preventing HttpHeader/HttpCookie parameters', () => {
        it('should throw error when route has HttpHeader parameter', () => {
            initRouter();
            const invalidRoute = route((ctx, token: HttpHeader<'authorization'>): string => {
                return 'test';
            });

            expect(() => {
                registerRoutes({invalidRoute});
            }).toThrow();
        });
    });

    describe('Hook validation - preventing HttpHeader in regular hooks', () => {
        it('should throw error when regular hook has HttpHeader parameter', () => {
            initRouter();
            const invalidHook = hook((ctx, token: HttpHeader<'authorization'>): void => {});

            expect(() => {
                registerRoutes({invalidHook});
            }).toThrow();
        });
    });

    describe('Hooks should allow HttpHeader/HeadersList in return types', () => {
        it('should allow hook with HttpHeader return type', async () => {
            initRouter();
            const headerHook = hook((ctx): HttpHeader<'x-auth'> => {
                return new HttpHeader('x-auth', 'authenticated');
            });

            const testRoute = route((ctx): string => {
                return 'success';
            });

            registerRoutes({auth: headerHook, testRoute});

            const request = getDefaultRequest('testRoute', []);
            const response = await dispatchRoute('/testRoute', request.body, request.headers, headersFromRecord({}), request);

            expect(response.headers.get('x-auth')).toBe('authenticated');
            expect(response.body.testRoute).toBe('success');
        });

        it('should allow hook with HeadersList return type', async () => {
            initRouter();
            const listHook = hook((ctx): HeadersCollection<[HttpHeader<'x-token'>]> => {
                return new HeadersCollection([new HttpHeader('x-token', '123456')]);
            });

            const testRoute = route((ctx): string => {
                return 'success';
            });

            registerRoutes({listHook, testRoute});

            const request = getDefaultRequest('testRoute', []);
            const response = await dispatchRoute('/testRoute', request.body, request.headers, headersFromRecord({}), request);

            expect(response.headers.get('x-token')).toBe('123456');
            expect(response.body.testRoute).toBe('success');
        });
    });

    describe('Hooks should allow header parameters', () => {
        it('should allow headersHook with header parameter', async () => {
            initRouter();
            const headerHook = headersHook(['authorization'], (ctx, token: string): void => {});

            const testRoute = route((ctx): string => {
                return 'success';
            });

            registerRoutes({auth: headerHook, testRoute});

            const request = getDefaultRequest('testRoute', [], {authorization: 'Bearer token123'});
            const response = await dispatchRoute('/testRoute', request.body, request.headers, headersFromRecord({}), request);

            expect(response.body.testRoute).toBe('success');
        });
    });
});
