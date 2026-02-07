/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {registerRoutes, resetRouter, initRouter} from './router';
import {dispatchWorkflow} from './dispatch';
import {extractWorkflowRoutes, buildWorkflowExecutionChain} from './workflow';
import {CallContext, MionHeaders} from './types/context';
import {Routes} from './types/general';
import {HeadersSubset, RpcError, MION_ROUTES, StatusCodes} from '@mionkit/core';
import {headersFn, linkedFn, route} from './lib/handlers';
import {headersFromRecord} from './lib/headers';

type RawRequest = {
    headers: MionHeaders;
    body: string;
};

describe('Workflow', () => {
    type SimpleUser = {
        name: string;
        surname: string;
    };

    const shared = {auth: {me: null as any}};
    const getSharedData = (): typeof shared => shared;

    const getDefaultWorkflowRequest = (routePaths: string[], params: Record<string, any>): RawRequest => ({
        headers: headersFromRecord({}),
        body: JSON.stringify({
            [MION_ROUTES.workflowMiddy]: routePaths,
            ...params,
        }),
    });

    beforeEach(() => resetRouter());

    // ############# extractWorkflowRoutes #############

    describe('extractWorkflowRoutes', () => {
        it('returns null for non-workflow bodies (no mion@workflow property)', () => {
            const result = extractWorkflowRoutes(JSON.stringify({routeA: ['param1']}));
            expect(result).toBeNull();
        });

        it('returns null for empty body', () => {
            const result = extractWorkflowRoutes('');
            expect(result).toBeNull();
        });

        it('returns null for invalid JSON', () => {
            const result = extractWorkflowRoutes('{invalid-json');
            expect(result).toBeNull();
        });

        it('returns null for binary body (Uint8Array)', () => {
            const result = extractWorkflowRoutes(new Uint8Array([1, 2, 3]));
            expect(result).toBeNull();
        });

        it('returns route array for valid workflow body', () => {
            const body = JSON.stringify({
                [MION_ROUTES.workflowMiddy]: ['/routeA', '/routeB'],
                routeA: ['param1'],
                routeB: ['param2'],
            });
            const result = extractWorkflowRoutes(body);
            expect(result).toEqual(['/routeA', '/routeB']);
        });

        it('works with pre-parsed object body', () => {
            const body = {
                [MION_ROUTES.workflowMiddy]: ['/routeA', '/routeB'],
                routeA: ['param1'],
            };
            const result = extractWorkflowRoutes(body);
            expect(result).toEqual(['/routeA', '/routeB']);
        });

        it('throws if mion@workflow is not an array', () => {
            const body = JSON.stringify({[MION_ROUTES.workflowMiddy]: 'not-an-array'});
            expect(() => extractWorkflowRoutes(body)).toThrow(RpcError);
        });

        it('throws if mion@workflow is an empty array', () => {
            const body = JSON.stringify({[MION_ROUTES.workflowMiddy]: []});
            expect(() => extractWorkflowRoutes(body)).toThrow(RpcError);
        });

        it('throws if mion@workflow contains non-string entries', () => {
            const body = JSON.stringify({[MION_ROUTES.workflowMiddy]: ['/routeA', 123]});
            expect(() => extractWorkflowRoutes(body)).toThrow(RpcError);
        });
    });

    // ############# buildWorkflowExecutionChain #############

    describe('buildWorkflowExecutionChain', () => {
        it('throws if a route path is not found', async () => {
            await initRouter({contextDataFactory: getSharedData});
            await registerRoutes({routeA: route((): string => 'a')});

            expect(() => buildWorkflowExecutionChain(['/nonExistent'])).toThrow(RpcError);
        });

        it('correctly merges chains with deduplication', async () => {
            await initRouter({contextDataFactory: getSharedData});
            const auth = linkedFn((ctx: CallContext): void => {});
            const routes = {
                auth,
                routeA: route((): string => 'a'),
                routeB: route((): string => 'b'),
            } satisfies Routes;
            await registerRoutes(routes);

            const chain = buildWorkflowExecutionChain(['/routeA', '/routeB']);

            // auth should appear only once in the merged chain
            const authMethods = chain.methods.filter((m) => m.id === 'auth');
            expect(authMethods.length).toBe(1);

            // Both routes should be present
            const routeAMethods = chain.methods.filter((m) => m.id === 'routeA');
            const routeBMethods = chain.methods.filter((m) => m.id === 'routeB');
            expect(routeAMethods.length).toBe(1);
            expect(routeBMethods.length).toBe(1);
        });

        it('preserves execution order: start → hooks → routeA → hooks → routeB → end', async () => {
            await initRouter({contextDataFactory: getSharedData});
            const logStart = linkedFn((ctx: CallContext): void => {});
            const routes = {
                logStart,
                routeA: route((): string => 'a'),
                validate: linkedFn((ctx: CallContext): void => {}),
                routeB: route((): string => 'b'),
            } satisfies Routes;
            await registerRoutes(routes);

            const chain = buildWorkflowExecutionChain(['/routeA', '/routeB']);
            const ids = chain.methods.map((m) => m.id);

            // First should be deserializer (startLinkedFn), last should be serializer (endLinkedFn)
            expect(ids[0]).toBe('mionDeserializeRequest');
            expect(ids[ids.length - 1]).toBe('mionSerializeResponse');

            // routeA should come before routeB
            const routeAIndex = ids.indexOf('routeA');
            const routeBIndex = ids.indexOf('routeB');
            expect(routeAIndex).toBeLessThan(routeBIndex);
        });
    });

    // ############# dispatchWorkflow (integration tests) #############

    describe('dispatchWorkflow', () => {
        it('executes 2 routes and returns results from both', async () => {
            await initRouter({contextDataFactory: getSharedData});
            await registerRoutes({
                greet: route((ctx, name: string): string => `Hello ${name}`),
                add: route((ctx, a: number, b: number): number => a + b),
            });

            const request = getDefaultWorkflowRequest(['/greet', '/add'], {
                greet: ['World'],
                add: [3, 4],
            });

            const response = await dispatchWorkflow(request.body, request.headers, headersFromRecord({}), request, {});
            expect(response.hasErrors).toBeFalsy();
            expect(response.body['greet']).toBe('Hello World');
            expect(response.body['add']).toBe(7);
        });

        it('executes 3+ routes in order', async () => {
            const executionOrder: string[] = [];
            await initRouter({contextDataFactory: getSharedData});
            await registerRoutes({
                first: route((): string => {
                    executionOrder.push('first');
                    return 'first';
                }),
                second: route((): string => {
                    executionOrder.push('second');
                    return 'second';
                }),
                third: route((): string => {
                    executionOrder.push('third');
                    return 'third';
                }),
            });

            const request = getDefaultWorkflowRequest(['/first', '/second', '/third'], {});

            const response = await dispatchWorkflow(request.body, request.headers, headersFromRecord({}), request, {});
            expect(response.hasErrors).toBeFalsy();
            expect(executionOrder).toEqual(['first', 'second', 'third']);
            expect(response.body['first']).toBe('first');
            expect(response.body['second']).toBe('second');
            expect(response.body['third']).toBe('third');
        });

        it('deduplicates shared hooks (auth runs once, not twice)', async () => {
            let authCallCount = 0;
            await initRouter({contextDataFactory: getSharedData});
            const routes = {
                auth: linkedFn((ctx: CallContext): void => {
                    authCallCount++;
                }),
                routeA: route((): string => 'a'),
                routeB: route((): string => 'b'),
            } satisfies Routes;
            await registerRoutes(routes);

            const request = getDefaultWorkflowRequest(['/routeA', '/routeB'], {});

            const response = await dispatchWorkflow(request.body, request.headers, headersFromRecord({}), request, {});
            expect(response.hasErrors).toBeFalsy();
            expect(authCallCount).toBe(1);
        });

        it('skips subsequent routes when first route fails', async () => {
            let secondCalled = false;
            await initRouter({contextDataFactory: getSharedData});
            await registerRoutes({
                failing: route((): string => {
                    throw new Error('route failed');
                }),
                second: route((): string => {
                    secondCalled = true;
                    return 'second';
                }),
            });

            const request = getDefaultWorkflowRequest(['/failing', '/second'], {});

            const response = await dispatchWorkflow(request.body, request.headers, headersFromRecord({}), request, {});
            expect(response.hasErrors).toBeTruthy();
            expect(secondCalled).toBe(false);
        });

        it('skips all routes when a hook fails', async () => {
            let routeACalled = false;
            let routeBCalled = false;
            await initRouter({contextDataFactory: getSharedData});
            const routes = {
                failingHook: linkedFn((): void => {
                    throw new Error('hook failed');
                }),
                routeA: route((): string => {
                    routeACalled = true;
                    return 'a';
                }),
                routeB: route((): string => {
                    routeBCalled = true;
                    return 'b';
                }),
            } satisfies Routes;
            await registerRoutes(routes);

            const request = getDefaultWorkflowRequest(['/routeA', '/routeB'], {});

            const response = await dispatchWorkflow(request.body, request.headers, headersFromRecord({}), request, {});
            expect(response.hasErrors).toBeTruthy();
            expect(routeACalled).toBe(false);
            expect(routeBCalled).toBe(false);
        });

        it('runOnError hooks still execute after failure', async () => {
            let cleanupCalled = false;
            await initRouter({contextDataFactory: getSharedData});
            const routes = {
                failing: route((): string => {
                    throw new Error('route failed');
                }),
                cleanup: linkedFn(
                    (): void => {
                        cleanupCalled = true;
                    },
                    {runOnError: true}
                ),
                second: route((): string => 'second'),
            } satisfies Routes;
            await registerRoutes(routes);

            const request = getDefaultWorkflowRequest(['/failing', '/second'], {});

            const response = await dispatchWorkflow(request.body, request.headers, headersFromRecord({}), request, {});
            expect(response.hasErrors).toBeTruthy();
            expect(cleanupCalled).toBe(true);
        });

        it('returns error for empty route list', async () => {
            await initRouter({contextDataFactory: getSharedData});
            await registerRoutes({routeA: route((): string => 'a')});

            const request: RawRequest = {
                headers: headersFromRecord({}),
                body: JSON.stringify({[MION_ROUTES.workflowMiddy]: []}),
            };

            await expect(dispatchWorkflow(request.body, request.headers, headersFromRecord({}), request, {})).rejects.toThrow();
        });

        it('returns error for non-existent route in workflow', async () => {
            await initRouter({contextDataFactory: getSharedData});
            await registerRoutes({routeA: route((): string => 'a')});

            const request = getDefaultWorkflowRequest(['/routeA', '/nonExistent'], {
                routeA: [],
            });

            await expect(dispatchWorkflow(request.body, request.headers, headersFromRecord({}), request, {})).rejects.toThrow();
        });

        it('returns error when mion@workflow property is missing', async () => {
            await initRouter({contextDataFactory: getSharedData});
            await registerRoutes({routeA: route((): string => 'a')});

            const request: RawRequest = {
                headers: headersFromRecord({}),
                body: JSON.stringify({routeA: []}),
            };

            await expect(dispatchWorkflow(request.body, request.headers, headersFromRecord({}), request, {})).rejects.toThrow();
        });

        it('response contains results from all successful routes in flat format', async () => {
            await initRouter({contextDataFactory: getSharedData});
            const routes = {
                auth: linkedFn((ctx: CallContext): string => 'authenticated'),
                getUser: route((ctx, id: string): SimpleUser => ({name: 'Leo', surname: 'Tungsten'})),
                getGreeting: route((ctx, name: string): string => `Hello ${name}`),
            } satisfies Routes;
            await registerRoutes(routes);

            const request = getDefaultWorkflowRequest(['/getUser', '/getGreeting'], {
                auth: ['token-123'],
                getUser: ['user-1'],
                getGreeting: ['World'],
            });

            const response = await dispatchWorkflow(request.body, request.headers, headersFromRecord({}), request, {});
            expect(response.hasErrors).toBeFalsy();
            // Flat response format — all results at the same level
            expect(response.body['auth']).toBe('authenticated');
            expect(response.body['getUser']).toEqual({name: 'Leo', surname: 'Tungsten'});
            expect(response.body['getGreeting']).toBe('Hello World');
        });

        it('shares context data between routes in workflow', async () => {
            type SharedData = {userId: string | null};
            const getShared = (): SharedData => ({userId: null});
            await initRouter({contextDataFactory: getShared});
            const routes = {
                setUser: route((ctx: CallContext<SharedData>, id: string): void => {
                    ctx.shared.userId = id;
                }),
                getUser: route((ctx: CallContext<SharedData>): string => {
                    return ctx.shared.userId || 'none';
                }),
            } satisfies Routes;
            await registerRoutes(routes);

            const request = getDefaultWorkflowRequest(['/setUser', '/getUser'], {
                setUser: ['user-42'],
            });

            const response = await dispatchWorkflow(request.body, request.headers, headersFromRecord({}), request, {});
            expect(response.hasErrors).toBeFalsy();
            expect(response.body['getUser']).toBe('user-42');
        });

        it('works with header linkedFns', async () => {
            await initRouter({contextDataFactory: getSharedData});
            const auth = headersFn((ctx, h: HeadersSubset<'Authorization'>): void | RpcError<'not-authorized'> => {
                const token = h.headers.Authorization;
                if (token !== '1234')
                    return new RpcError({
                        publicMessage: 'Not Authorized',
                        type: 'not-authorized',
                    });
            });
            const routes = {
                auth,
                routeA: route((): string => 'a'),
                routeB: route((): string => 'b'),
            } satisfies Routes;
            await registerRoutes(routes);

            const request: RawRequest = {
                headers: headersFromRecord({Authorization: '1234'}),
                body: JSON.stringify({
                    [MION_ROUTES.workflowMiddy]: ['/routeA', '/routeB'],
                }),
            };

            const response = await dispatchWorkflow(request.body, request.headers, headersFromRecord({}), request, {});
            expect(response.hasErrors).toBeFalsy();
            expect(response.body['routeA']).toBe('a');
            expect(response.body['routeB']).toBe('b');
        });
    });
});
