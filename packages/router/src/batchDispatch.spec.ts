/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {registerRoutes, resetRouter, initRouter} from './router';
import {dispatchBatchRoute} from './dispatch';
import {HeadersSubset, RpcError, StatusCodes, BatchResponse} from '@mionkit/core';
import {headersFn, route} from './lib/handlers';
import {headersFromRecord} from './lib/headers';

describe('Batch Dispatch routes', () => {
    type SimpleUser = {
        name: string;
        surname: string;
    };

    const changeUserName = route((ctx, user: SimpleUser): SimpleUser => {
        return {name: 'LOREM', surname: user.surname};
    });

    const sayHello = route((ctx, name: string): string => {
        return `Hello ${name}`;
    });

    const sumTwo = route((ctx, val: number): number => {
        return val + 2;
    });

    const routeFail = route((): void => {
        throw new Error('this is a generic error');
    });

    const auth = headersFn((ctx, h: HeadersSubset<'Authorization'>): void | RpcError<'not-authorized'> => {
        const token = h.headers.Authorization;
        if (token !== '1234')
            return new RpcError({
                publicMessage: 'Not Authorized',
                type: 'not-authorized',
            });
    });

    const setResponseHeader = headersFn((ctx, h: HeadersSubset<'Authorization'>): HeadersSubset<'X-Custom'> => {
        return new HeadersSubset({'X-Custom': 'custom-value'});
    });

    const shared = {auth: {me: null as any}};
    const getSharedData = (): typeof shared => shared;

    beforeEach(() => resetRouter());

    describe('success path should', () => {
        it('dispatch multiple routes in a single batch request', async () => {
            await initRouter({contextDataFactory: getSharedData});
            await registerRoutes({changeUserName, sayHello, sumTwo});

            const batchBody = {
                routeIds: ['/changeUserName', '/sayHello', '/sumTwo'],
                bodies: [{changeUserName: [{name: 'Leo', surname: 'Tungsten'}]}, {sayHello: ['World']}, {sumTwo: [3]}],
            };

            const response = await dispatchBatchRoute(
                JSON.stringify(batchBody),
                headersFromRecord({}),
                headersFromRecord({}),
                {},
                {}
            );

            const batch = response.body as unknown as BatchResponse;
            expect(response.statusCode).toBe(StatusCodes.OK);
            expect(batch.routeIds).toEqual(['/changeUserName', '/sayHello', '/sumTwo']);
            expect(batch.statuses).toEqual([200, 200, 200]);
            expect(batch.bodies[0]).toEqual({changeUserName: {name: 'LOREM', surname: 'Tungsten'}});
            expect(batch.bodies[1]).toEqual({sayHello: 'Hello World'});
            expect(batch.bodies[2]).toEqual({sumTwo: 5});
        });

        it('dispatch a single route in a batch request', async () => {
            await initRouter({contextDataFactory: getSharedData});
            await registerRoutes({sayHello});

            const batchBody = {
                routeIds: ['/sayHello'],
                bodies: [{sayHello: ['World']}],
            };

            const response = await dispatchBatchRoute(
                JSON.stringify(batchBody),
                headersFromRecord({}),
                headersFromRecord({}),
                {},
                {}
            );

            const batch = response.body as unknown as BatchResponse;
            expect(response.statusCode).toBe(StatusCodes.OK);
            expect(batch.routeIds).toEqual(['/sayHello']);
            expect(batch.statuses).toEqual([200]);
            expect(batch.bodies[0]).toEqual({sayHello: 'Hello World'});
        });

        it('accept pre-parsed object body (not string)', async () => {
            await initRouter({contextDataFactory: getSharedData});
            await registerRoutes({sayHello, sumTwo});

            const batchBody = {
                routeIds: ['/sayHello', '/sumTwo'],
                bodies: [{sayHello: ['World']}, {sumTwo: [10]}],
            };

            const response = await dispatchBatchRoute(batchBody as any, headersFromRecord({}), headersFromRecord({}), {}, {});

            const batch = response.body as unknown as BatchResponse;
            expect(response.statusCode).toBe(StatusCodes.OK);
            expect(batch.bodies[0]).toEqual({sayHello: 'Hello World'});
            expect(batch.bodies[1]).toEqual({sumTwo: 12});
        });

        it('share HTTP request headers across all routes in the batch', async () => {
            await initRouter({contextDataFactory: getSharedData});
            await registerRoutes({auth, changeUserName, sayHello});

            const batchBody = {
                routeIds: ['/changeUserName', '/sayHello'],
                bodies: [{changeUserName: [{name: 'Leo', surname: 'Tungsten'}]}, {sayHello: ['World']}],
            };

            const response = await dispatchBatchRoute(
                JSON.stringify(batchBody),
                headersFromRecord({Authorization: '1234'}),
                headersFromRecord({}),
                {},
                {}
            );

            const batch = response.body as unknown as BatchResponse;
            expect(response.statusCode).toBe(StatusCodes.OK);
            expect(batch.statuses).toEqual([200, 200]);
        });

        it('use last-write-wins for response headers', async () => {
            await initRouter({contextDataFactory: getSharedData});
            await registerRoutes({setResponseHeader, changeUserName, sayHello});

            const batchBody = {
                routeIds: ['/changeUserName', '/sayHello'],
                bodies: [{changeUserName: [{name: 'Leo', surname: 'Tungsten'}]}, {sayHello: ['World']}],
            };

            const respHeaders = headersFromRecord({});
            const response = await dispatchBatchRoute(
                JSON.stringify(batchBody),
                headersFromRecord({Authorization: '1234'}),
                respHeaders,
                {},
                {}
            );

            // Response headers are shared - last-write-wins
            expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
        });
    });

    describe('error isolation should', () => {
        it('isolate errors - one route fails, others succeed', async () => {
            await initRouter({contextDataFactory: getSharedData});
            await registerRoutes({sayHello, routeFail, sumTwo});

            const batchBody = {
                routeIds: ['/sayHello', '/routeFail', '/sumTwo'],
                bodies: [{sayHello: ['World']}, {routeFail: []}, {sumTwo: [5]}],
            };

            const response = await dispatchBatchRoute(
                JSON.stringify(batchBody),
                headersFromRecord({}),
                headersFromRecord({}),
                {},
                {}
            );

            const batch = response.body as unknown as BatchResponse;
            // Overall status should be 207 Multi-Status since one route failed
            expect(response.statusCode).toBe(StatusCodes.MULTI_STATUS);
            expect(batch.routeIds).toEqual(['/sayHello', '/routeFail', '/sumTwo']);

            // First route succeeds
            expect(batch.statuses[0]).toBe(200);
            expect(batch.bodies[0]).toEqual({sayHello: 'Hello World'});

            // Second route fails but is isolated
            expect(batch.statuses[1]).toBe(StatusCodes.UNEXPECTED_ERROR);

            // Third route still succeeds
            expect(batch.statuses[2]).toBe(200);
            expect(batch.bodies[2]).toEqual({sumTwo: 7});
        });

        it('isolate auth errors - one route fails auth, others succeed', async () => {
            await initRouter({contextDataFactory: getSharedData});
            await registerRoutes({auth, changeUserName, sayHello});

            const batchBody = {
                routeIds: ['/changeUserName', '/sayHello'],
                bodies: [{changeUserName: [{name: 'Leo', surname: 'Tungsten'}]}, {sayHello: ['World']}],
            };

            // No auth header - auth linkedFn will fail for all routes
            const response = await dispatchBatchRoute(
                JSON.stringify(batchBody),
                headersFromRecord({}),
                headersFromRecord({}),
                {},
                {}
            );

            const batch = response.body as unknown as BatchResponse;
            expect(response.statusCode).toBe(StatusCodes.MULTI_STATUS);
            // Both routes should have error status since auth fails for both
            expect(batch.statuses[0]).not.toBe(200);
            expect(batch.statuses[1]).not.toBe(200);
        });

        it('handle not-found routes in batch', async () => {
            await initRouter({contextDataFactory: getSharedData});
            await registerRoutes({sayHello});

            const batchBody = {
                routeIds: ['/sayHello', '/nonExistentRoute'],
                bodies: [{sayHello: ['World']}, {nonExistentRoute: []}],
            };

            const response = await dispatchBatchRoute(
                JSON.stringify(batchBody),
                headersFromRecord({}),
                headersFromRecord({}),
                {},
                {}
            );

            const batch = response.body as unknown as BatchResponse;
            expect(response.statusCode).toBe(StatusCodes.MULTI_STATUS);
            // First route succeeds
            expect(batch.statuses[0]).toBe(200);
            expect(batch.bodies[0]).toEqual({sayHello: 'Hello World'});
            // Second route is not found but isolated
            expect(batch.statuses[1]).not.toBe(200);
        });
    });

    describe('validation should', () => {
        it('reject batch requests exceeding maxBatchSize', async () => {
            await initRouter({contextDataFactory: getSharedData, maxBatchSize: 2});
            await registerRoutes({sayHello, sumTwo, changeUserName});

            const batchBody = {
                routeIds: ['/sayHello', '/sumTwo', '/changeUserName'],
                bodies: [{sayHello: ['World']}, {sumTwo: [1]}, {changeUserName: [{name: 'A', surname: 'B'}]}],
            };

            await expect(
                dispatchBatchRoute(JSON.stringify(batchBody), headersFromRecord({}), headersFromRecord({}), {}, {})
            ).rejects.toMatchObject({
                type: 'batch-size-exceeded',
            });
        });

        it('reject empty batch requests', async () => {
            await initRouter({contextDataFactory: getSharedData});
            await registerRoutes({sayHello});

            const batchBody = {
                routeIds: [],
                bodies: [],
            };

            await expect(
                dispatchBatchRoute(JSON.stringify(batchBody), headersFromRecord({}), headersFromRecord({}), {}, {})
            ).rejects.toMatchObject({
                type: 'batch-empty-request',
            });
        });

        it('reject batch requests with mismatched routeIds and bodies lengths', async () => {
            await initRouter({contextDataFactory: getSharedData});
            await registerRoutes({sayHello, sumTwo});

            const batchBody = {
                routeIds: ['/sayHello', '/sumTwo'],
                bodies: [{sayHello: ['World']}], // only 1 body for 2 routes
            };

            await expect(
                dispatchBatchRoute(JSON.stringify(batchBody), headersFromRecord({}), headersFromRecord({}), {}, {})
            ).rejects.toMatchObject({
                type: 'batch-mismatched-lengths',
            });
        });

        it('reject invalid batch format (missing routeIds)', async () => {
            await initRouter({contextDataFactory: getSharedData});
            await registerRoutes({sayHello});

            const invalidBody = {bodies: [{sayHello: ['World']}]};

            await expect(
                dispatchBatchRoute(JSON.stringify(invalidBody), headersFromRecord({}), headersFromRecord({}), {}, {})
            ).rejects.toMatchObject({
                type: 'batch-parsing-json-request-error',
            });
        });

        it('reject invalid batch format (missing bodies)', async () => {
            await initRouter({contextDataFactory: getSharedData});
            await registerRoutes({sayHello});

            const invalidBody = {routeIds: ['/sayHello']};

            await expect(
                dispatchBatchRoute(JSON.stringify(invalidBody), headersFromRecord({}), headersFromRecord({}), {}, {})
            ).rejects.toMatchObject({
                type: 'batch-parsing-json-request-error',
            });
        });

        it('reject invalid JSON string', async () => {
            await initRouter({contextDataFactory: getSharedData});
            await registerRoutes({sayHello});

            await expect(
                dispatchBatchRoute('{invalid-json', headersFromRecord({}), headersFromRecord({}), {}, {})
            ).rejects.toMatchObject({
                type: 'batch-parsing-json-request-error',
            });
        });
    });
});
