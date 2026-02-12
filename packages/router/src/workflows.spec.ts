/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {registerRoutes, resetRouter, initRouter} from './router.ts';
import {dispatchRoute} from './dispatch.ts';
import {MionHeaders} from './types/context.ts';
import {Routes} from './types/general.ts';
import {RpcError} from '@mionkit/core';
import {linkedFn, route} from './lib/handlers.ts';
import {headersFromRecord} from './lib/headers.ts';
import {clearWorkflowCache, getWorkflowCacheSize, getCachedWorkflow} from './workflows.ts';
import {WORKFLOW_KEY, WORKFLOW_PATH} from './constants.ts';

// Workflows allow calling multiple routes in a single request, with shared context between them
// a new execution chain is created for each workflow request, merging the execution chains of all routes in the workflow

type RawRequest = {
    headers: MionHeaders;
    body: string;
};

describe('Workflow routes', () => {
    const getDefaultRequest = (body: Record<string, any[]>): RawRequest => ({
        headers: headersFromRecord({}),
        body: JSON.stringify(body),
    });

    beforeEach(() => resetRouter());

    describe('route name validation', () => {
        it('should reject route names containing commas', async () => {
            await initRouter();
            const routesWithComma = {
                'route,with,commas': route((ctx): string => 'test'),
            } satisfies Routes;

            await expect(registerRoutes(routesWithComma)).rejects.toThrow('Route names cannot contain commas');
        });

        it('should reject route names using reserved workflow route name', async () => {
            await initRouter();
            const routesWithWorkflowName = {
                [WORKFLOW_KEY]: route((ctx): string => 'test'),
            } satisfies Routes;

            await expect(registerRoutes(routesWithWorkflowName)).rejects.toThrow(
                `'${WORKFLOW_KEY}' is a reserved mion route name`
            );
        });
    });

    describe('workflow execution', () => {
        const route1 = route((ctx): string => 'result1');
        const routeX2 = route((ctx, value: number): number => value * 2);
        const routeSum = route((ctx, a: number, b: number): number => a + b);

        const sharedLinkedFn = linkedFn((ctx): void => {
            ctx.shared.linkedFnCalled = (ctx.shared.linkedFnCalled || 0) + 1;
        });

        const routes = {
            route1,
            routeX2,
            routeSum,
        } satisfies Routes;

        const routesWithLinkedFn = {
            sharedLinkedFn,
            route1,
            routeX2,
        } satisfies Routes;

        it('should execute single route in workflow', async () => {
            await initRouter();
            await registerRoutes(routes);

            const request = getDefaultRequest({route1: []});
            const workflowPath = WORKFLOW_PATH;
            const urlQuery = '/route1';

            const response = await dispatchRoute(
                workflowPath,
                request.body,
                request.headers,
                headersFromRecord({}),
                request,
                undefined,
                undefined,
                urlQuery
            );

            expect(response.hasErrors).toBe(false);
            expect(response.body.route1).toBe('result1');
        });

        it('should execute multiple routes in workflow', async () => {
            await initRouter();
            await registerRoutes(routes);

            const request = getDefaultRequest({
                route1: [],
                routeX2: [5],
                routeSum: [10, 20],
            });
            const workflowPath = WORKFLOW_PATH;
            const urlQuery = '/route1,/routeX2,/routeSum';

            const response = await dispatchRoute(
                workflowPath,
                request.body,
                request.headers,
                headersFromRecord({}),
                request,
                undefined,
                undefined,
                urlQuery
            );

            expect(response.hasErrors).toBe(false);
            expect(response.body.route1).toBe('result1');
            expect(response.body.routeX2).toBe(10);
            expect(response.body.routeSum).toBe(30);
        });

        it('should deduplicate shared linkedFns', async () => {
            clearWorkflowCache();
            await initRouter({contextDataFactory: () => ({linkedFnCalled: 0})});
            await registerRoutes(routesWithLinkedFn);

            const request = getDefaultRequest({
                route1: [],
                routeX2: [5],
            });
            const workflowPath = WORKFLOW_PATH;
            const urlQuery = '/route1,/routeX2';

            const response = await dispatchRoute(
                workflowPath,
                request.body,
                request.headers,
                headersFromRecord({}),
                request,
                undefined,
                undefined,
                urlQuery
            );

            expect(response.hasErrors).toBe(false);
            expect(response.body.route1).toBe('result1');
            expect(response.body.routeX2).toBe(10);

            // Verify the cached workflow has deduplicated linkedFns
            const cachedWorkflow = getCachedWorkflow(urlQuery);
            expect(cachedWorkflow).toBeDefined();
            // routeIndex is the actual route index from the first route's chain
            expect(cachedWorkflow!.routeIndex).toBeGreaterThanOrEqual(0);

            // The sharedLinkedFn should only appear once in the merged methods
            const linkedFnCount = cachedWorkflow!.methods.filter((m) => m.id === 'sharedLinkedFn').length;
            expect(linkedFnCount).toBe(1);

            // Both route handlers should be present
            const route1Handler = cachedWorkflow!.methods.find((m) => m.id === 'route1');
            const routeX2Handler = cachedWorkflow!.methods.find((m) => m.id === 'routeX2');
            expect(route1Handler).toBeDefined();
            expect(routeX2Handler).toBeDefined();

            // Verify the chain includes deserialization and serialization
            const deserializer = cachedWorkflow!.methods.find((m) => m.id === 'mionDeserializeRequest');
            const serializer = cachedWorkflow!.methods.find((m) => m.id === 'mionSerializeResponse');
            expect(deserializer).toBeDefined();
            expect(serializer).toBeDefined();
        });

        it('should throw error for non-existent route in workflow', async () => {
            await initRouter();
            await registerRoutes(routes);

            const request = getDefaultRequest({});
            const workflowPath = WORKFLOW_PATH;
            const urlQuery = '/nonExistent';

            // Errors during workflow chain building are thrown as exceptions
            // since they happen during context creation
            await expect(
                dispatchRoute(
                    workflowPath,
                    request.body,
                    request.headers,
                    headersFromRecord({}),
                    request,
                    undefined,
                    undefined,
                    urlQuery
                )
            ).rejects.toThrow('Route not found in workflow: /nonExistent');
        });

        it('should throw error for workflow path without query string', async () => {
            await initRouter();
            await registerRoutes(routes);

            const request = getDefaultRequest({});
            const workflowPath = WORKFLOW_PATH;

            // When no urlQuery is provided, the workflow should throw an error
            await expect(
                dispatchRoute(
                    workflowPath,
                    request.body,
                    request.headers,
                    headersFromRecord({}),
                    request,
                    undefined,
                    undefined,
                    undefined // no urlQuery
                )
            ).rejects.toThrow('Workflow request requires a query string with route paths.');
        });

        it('should handle URL-encoded route paths', async () => {
            await initRouter();
            await registerRoutes(routes);

            const request = getDefaultRequest({route1: []});
            const workflowPath = WORKFLOW_PATH;
            // URL-encoded path
            const urlQuery = '%2Froute1';

            const response = await dispatchRoute(
                workflowPath,
                request.body,
                request.headers,
                headersFromRecord({}),
                request,
                undefined,
                undefined,
                urlQuery
            );

            expect(response.hasErrors).toBe(false);
            expect(response.body.route1).toBe('result1');
        });

        it('should apply pathTransform to workflow route paths', async () => {
            await initRouter({
                pathTransform: (req, path) => path.replace('/v1', ''),
            });
            await registerRoutes(routes);

            const request = getDefaultRequest({route1: []});
            const workflowPath = WORKFLOW_PATH;
            // Path with /v1 prefix that should be transformed
            const urlQuery = '/v1/route1';

            const response = await dispatchRoute(
                workflowPath,
                request.body,
                request.headers,
                headersFromRecord({}),
                request,
                undefined,
                undefined,
                urlQuery
            );

            expect(response.hasErrors).toBe(false);
            expect(response.body.route1).toBe('result1');
        });

        it('should stop execution on first route error', async () => {
            const errorRoute = route((ctx): string => {
                throw new RpcError({
                    publicMessage: 'Test error',
                    type: 'test-error',
                });
            });

            const routesWithError = {
                errorRoute,
                route1,
            } satisfies Routes;

            await initRouter();
            await registerRoutes(routesWithError);

            const request = getDefaultRequest({
                errorRoute: [],
                route1: [],
            });
            const workflowPath = WORKFLOW_PATH;
            const urlQuery = '/errorRoute,/route1';

            const response = await dispatchRoute(
                workflowPath,
                request.body,
                request.headers,
                headersFromRecord({}),
                request,
                undefined,
                undefined,
                urlQuery
            );

            expect(response.hasErrors).toBe(true);
            // route1 should not have been executed due to error in errorRoute
            // (unless it has runOnError: true)
            expect(response.body.route1).toBeUndefined();
        });
    });

    // Note: Workflow routes are no longer registered as a separate route.
    // The workflow execution chain is built dynamically in getExecutionChain()
    // when the path matches the workflow route path.

    describe('workflow cache', () => {
        const route1 = route((ctx): string => 'result1');
        const routeX2 = route((ctx, value: number): number => value * 2);

        const routes = {
            route1,
            routeX2,
        } satisfies Routes;

        beforeEach(() => {
            clearWorkflowCache();
        });

        it('should cache merged execution chains', async () => {
            await initRouter();
            await registerRoutes(routes);

            expect(getWorkflowCacheSize()).toBe(0);

            const request = getDefaultRequest({route1: []});
            const workflowPath = WORKFLOW_PATH;
            const urlQuery = '/route1';

            // First request - should add to cache
            await dispatchRoute(
                workflowPath,
                request.body,
                request.headers,
                headersFromRecord({}),
                request,
                undefined,
                undefined,
                urlQuery
            );

            expect(getWorkflowCacheSize()).toBe(1);

            // Second request with same query - should use cache
            await dispatchRoute(
                workflowPath,
                request.body,
                request.headers,
                headersFromRecord({}),
                request,
                undefined,
                undefined,
                urlQuery
            );

            // Cache size should still be 1 (reused)
            expect(getWorkflowCacheSize()).toBe(1);
        });

        it('should cache different query strings separately', async () => {
            await initRouter();
            await registerRoutes(routes);

            const workflowPath = WORKFLOW_PATH;

            // First query
            const request1 = getDefaultRequest({route1: []});
            const response1 = await dispatchRoute(
                workflowPath,
                request1.body,
                request1.headers,
                headersFromRecord({}),
                request1,
                undefined,
                undefined,
                '/route1'
            );

            expect(response1.hasErrors).toBe(false);
            expect(getWorkflowCacheSize()).toBe(1);

            // Second query (different)
            const request2 = getDefaultRequest({routeX2: [5]});
            const response2 = await dispatchRoute(
                workflowPath,
                request2.body,
                request2.headers,
                headersFromRecord({}),
                request2,
                undefined,
                undefined,
                '/routeX2'
            );

            expect(response2.hasErrors).toBe(false);
            expect(getWorkflowCacheSize()).toBe(2);
        });

        it('should evict oldest entries when cache is full (FILO)', async () => {
            // Initialize with small cache size
            await initRouter({maxWorkflowsCacheSize: 2});
            await registerRoutes(routes);

            const workflowPath = WORKFLOW_PATH;

            // Add first entry
            const request1 = getDefaultRequest({route1: []});
            await dispatchRoute(
                workflowPath,
                request1.body,
                request1.headers,
                headersFromRecord({}),
                request1,
                undefined,
                undefined,
                '/route1'
            );
            expect(getWorkflowCacheSize()).toBe(1);

            // Add second entry
            const request2 = getDefaultRequest({routeX2: [5]});
            await dispatchRoute(
                workflowPath,
                request2.body,
                request2.headers,
                headersFromRecord({}),
                request2,
                undefined,
                undefined,
                '/routeX2'
            );
            expect(getWorkflowCacheSize()).toBe(2);

            // Add third entry - should evict first
            const request3 = getDefaultRequest({route1: [], routeX2: [5]});
            await dispatchRoute(
                workflowPath,
                request3.body,
                request3.headers,
                headersFromRecord({}),
                request3,
                undefined,
                undefined,
                '/route1,/routeX2'
            );
            expect(getWorkflowCacheSize()).toBe(2);
        });

        it('should not cache when maxWorkflowsCacheSize is 0', async () => {
            await initRouter({maxWorkflowsCacheSize: 0});
            await registerRoutes(routes);

            const request = getDefaultRequest({route1: []});
            const workflowPath = WORKFLOW_PATH;
            const urlQuery = '/route1';

            await dispatchRoute(
                workflowPath,
                request.body,
                request.headers,
                headersFromRecord({}),
                request,
                undefined,
                undefined,
                urlQuery
            );

            expect(getWorkflowCacheSize()).toBe(0);
        });

        it('should clear cache with clearWorkflowCache', async () => {
            await initRouter();
            await registerRoutes(routes);

            const request = getDefaultRequest({route1: []});
            const workflowPath = WORKFLOW_PATH;

            await dispatchRoute(
                workflowPath,
                request.body,
                request.headers,
                headersFromRecord({}),
                request,
                undefined,
                undefined,
                '/route1'
            );

            expect(getWorkflowCacheSize()).toBe(1);

            clearWorkflowCache();

            expect(getWorkflowCacheSize()).toBe(0);
        });
    });

    describe('scoped linkedFns in workflows', () => {
        const route1 = route((ctx): string => 'result1');
        const route2 = route((ctx): string => 'result2');
        const route3 = route((ctx): string => 'result3');

        const scopedLinkedFn = linkedFn((ctx): void => {
            ctx.shared.scopedLinkedFnCalled = (ctx.shared.scopedLinkedFnCalled || 0) + 1;
        });

        const routes = {
            route1,
            other: {
                scopedLinkedFn,
                route2,
            },
            route3,
        } satisfies Routes;

        beforeEach(() => {
            clearWorkflowCache();
        });

        it('should include scoped linkedFn when route from that scope is called', async () => {
            await initRouter({contextDataFactory: () => ({scopedLinkedFnCalled: 0})});
            await registerRoutes(routes);

            const request = getDefaultRequest({
                route1: [],
                'other/route2': [],
                route3: [],
            });
            const workflowPath = WORKFLOW_PATH;
            const urlQuery = '/route1,/other/route2,/route3';

            const response = await dispatchRoute(
                workflowPath,
                request.body,
                request.headers,
                headersFromRecord({}),
                request,
                undefined,
                undefined,
                urlQuery
            );

            expect(response.hasErrors).toBe(false);
            expect(response.body.route1).toBe('result1');
            expect(response.body['other/route2']).toBe('result2');
            expect(response.body.route3).toBe('result3');

            // Verify the cached workflow has the scoped linkedFn
            const cachedWorkflow = getCachedWorkflow(urlQuery);
            expect(cachedWorkflow).toBeDefined();

            // The scopedLinkedFn should appear in the merged methods (with path prefix)
            const scopedLinkedFnMethod = cachedWorkflow!.methods.find((m) => m.id === 'other/scopedLinkedFn');
            expect(scopedLinkedFnMethod).toBeDefined();

            // Verify execution order: route1, other/scopedLinkedFn, other/route2, route3
            const methodIds = cachedWorkflow!.methods
                .filter((m) => ['route1', 'other/scopedLinkedFn', 'other/route2', 'route3'].includes(m.id))
                .map((m) => m.id);
            expect(methodIds).toEqual(['route1', 'other/scopedLinkedFn', 'other/route2', 'route3']);
        });

        it('should maintain correct order when scoped route is called first', async () => {
            await initRouter({contextDataFactory: () => ({scopedLinkedFnCalled: 0})});
            await registerRoutes(routes);

            const request = getDefaultRequest({
                'other/route2': [],
                route1: [],
                route3: [],
            });
            const workflowPath = WORKFLOW_PATH;
            const urlQuery = '/other/route2,/route1,/route3';

            const response = await dispatchRoute(
                workflowPath,
                request.body,
                request.headers,
                headersFromRecord({}),
                request,
                undefined,
                undefined,
                urlQuery
            );

            expect(response.hasErrors).toBe(false);
            expect(response.body['other/route2']).toBe('result2');
            expect(response.body.route1).toBe('result1');
            expect(response.body.route3).toBe('result3');

            // Verify the cached workflow has the scoped linkedFn
            const cachedWorkflow = getCachedWorkflow(urlQuery);
            expect(cachedWorkflow).toBeDefined();

            // Verify execution order: other/scopedLinkedFn, other/route2, route1, route3
            const methodIds = cachedWorkflow!.methods
                .filter((m) => ['route1', 'other/scopedLinkedFn', 'other/route2', 'route3'].includes(m.id))
                .map((m) => m.id);
            expect(methodIds).toEqual(['other/scopedLinkedFn', 'other/route2', 'route1', 'route3']);
        });

        it('should not include scoped linkedFn when no routes from that scope are called', async () => {
            await initRouter({contextDataFactory: () => ({scopedLinkedFnCalled: 0})});
            await registerRoutes(routes);

            const request = getDefaultRequest({
                route1: [],
                route3: [],
            });
            const workflowPath = WORKFLOW_PATH;
            const urlQuery = '/route1,/route3';

            const response = await dispatchRoute(
                workflowPath,
                request.body,
                request.headers,
                headersFromRecord({}),
                request,
                undefined,
                undefined,
                urlQuery
            );

            expect(response.hasErrors).toBe(false);
            expect(response.body.route1).toBe('result1');
            expect(response.body.route3).toBe('result3');

            // Verify the cached workflow does NOT have the scoped linkedFn
            const cachedWorkflow = getCachedWorkflow(urlQuery);
            expect(cachedWorkflow).toBeDefined();

            // The scopedLinkedFn should NOT appear in the merged methods (with path prefix)
            const scopedLinkedFnMethod = cachedWorkflow!.methods.find((m) => m.id === 'other/scopedLinkedFn');
            expect(scopedLinkedFnMethod).toBeUndefined();
        });
    });
});
