/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {DEFAULT_PREFILL_OPTIONS} from './constants.ts';
import {
    CallWithMiddleFnsResult,
    ClientOptions,
    MiddlewareSubRequest,
    InitClientOptions,
    RouteSubRequest,
    SubRequest,
    RequestErrors,
    ClientRoutes,
    ClientMiddleFns,
    Result,
    WorkflowResult,
} from './types.ts';
import type {RemoteApi} from '@mionjs/router';
import {registerErrorDeserializers} from '@mionjs/core';
import {getRouterItemId} from '@mionjs/core';
import {MionClientRequest} from './request.ts';
import type {RunTypeError} from '@mionjs/core';
import {HandlersRegistry} from './lib/handlersRegistry.ts';
import {MionSubRequest, findSubRequestError} from './subRequest.ts';

export function initClient<RM extends RemoteApi>(
    options: InitClientOptions
): {client: MionClient; routes: ClientRoutes<RM>; middleFns: ClientMiddleFns<RM>} {
    registerErrorDeserializers();
    const clientOptions = {
        ...DEFAULT_PREFILL_OPTIONS,
        ...options,
    };
    const client = new MionClient(clientOptions);
    const rootProxy = new MethodProxy([], client, clientOptions);
    return {
        client,
        routes: rootProxy.proxy as ClientRoutes<RM>,
        middleFns: rootProxy.proxy as ClientMiddleFns<RM>,
    };
}

export class MionClient {
    /** Shared registry for persistent middleFn error handlers */
    readonly handlersRegistry = new HandlersRegistry();

    /** In-memory cache for prefilled middleFn subrequests (keyed by baseURL:middleFnId) */
    readonly prefilledMiddleFnsCache = new Map<string, SubRequest<any>>();

    /** Tracks in-flight prefill operations to avoid race conditions */
    private pendingPrefills: Promise<void>[] = [];

    constructor(private clientOptions: ClientOptions) {}

    /** Executes a route call and returns a Result 4-tuple */
    executeCall<RR extends RouteSubRequest<any>>(routeSubRequest: RR): Promise<Result<any, any>> {
        return this.executeRequest(routeSubRequest, undefined, undefined);
    }

    /** Executes a route call with middleFns and returns a typed result object */
    executeCallWithMiddleFns<H extends Record<string, MiddlewareSubRequest<any>>>(
        routeSubRequest: RouteSubRequest<any>,
        middleFnsRecord: H
    ): Promise<CallWithMiddleFnsResult<any, any, H>> {
        return this.executeRequest(routeSubRequest, undefined, middleFnsRecord);
    }

    /** Executes a routesFlow call with multiple routes and optional middleFns */
    executeCallWithWorkflow<Routes extends RouteSubRequest<any>[], H extends Record<string, MiddlewareSubRequest<any>>>(
        workflowSubRequests: Routes,
        middleFnsRecord: H
    ): Promise<WorkflowResult<Routes, H>> {
        return this.executeRequest(undefined, workflowSubRequests, middleFnsRecord);
    }

    private async executeRequest<Routes extends RouteSubRequest<any>[], H extends Record<string, MiddlewareSubRequest<any>>>(
        routeSubRequest: RouteSubRequest<any> | undefined,
        workflowSubRequests: Routes | undefined,
        middleFnsRecord: H | undefined
    ): Promise<any> {
        // Wait for any in-flight prefill operations to complete before executing the request
        if (this.pendingPrefills.length > 0) await Promise.allSettled([...this.pendingPrefills]);

        const middleFnSubRequests = middleFnsRecord ? Object.values(middleFnsRecord) : [];
        const request = new MionClientRequest(
            this.clientOptions,
            this.prefilledMiddleFnsCache,
            routeSubRequest,
            middleFnSubRequests,
            workflowSubRequests
        );

        try {
            await request.call();
            const routeIds = this.getRouteIds(routeSubRequest, workflowSubRequests);
            const allMiddleFns = this.getAllMiddleFnsFromRequest(request, routeIds);
            this.processMiddleFnsResponses(allMiddleFns, undefined);
            return this.buildResult(routeSubRequest, workflowSubRequests, middleFnsRecord || allMiddleFns, undefined);
        } catch (errors: any) {
            const routeIds = this.getRouteIds(routeSubRequest, workflowSubRequests);
            const allMiddleFns = this.getAllMiddleFnsFromRequest(request, routeIds);
            this.processMiddleFnsResponses(allMiddleFns, errors);
            return this.buildResult(routeSubRequest, workflowSubRequests, middleFnsRecord || allMiddleFns, errors);
        }
    }

    /** Get route IDs from single route or routesFlow routes */
    private getRouteIds(
        routeSubRequest: RouteSubRequest<any> | undefined,
        workflowSubRequests: RouteSubRequest<any>[] | undefined
    ): Set<string> {
        const routeIds = new Set<string>();
        if (routeSubRequest) routeIds.add(routeSubRequest.id);
        if (workflowSubRequests) workflowSubRequests.forEach((sr) => routeIds.add(sr.id));
        return routeIds;
    }

    /** Get all middleFns from the request's subRequestList, excluding the route(s) */
    private getAllMiddleFnsFromRequest(
        request: MionClientRequest<any, any>,
        excludedIds: Set<string>
    ): MiddlewareSubRequest<any>[] {
        return Object.entries(request.subRequestList)
            .filter(([id]) => !excludedIds.has(id))
            .map(([, subRequest]) => subRequest as MiddlewareSubRequest<any>);
    }

    /** Process all middleFn responses - call success or error handlers for each middleFn individually */
    private processMiddleFnsResponses(middleFnSubRequests: MiddlewareSubRequest<any>[], errors: RequestErrors | undefined): void {
        for (const middleFn of middleFnSubRequests) {
            const middleFnError = errors?.get(middleFn.id);
            if (middleFnError) {
                this.handlersRegistry.executeHandler(middleFn.id, middleFnError);
            } else if (middleFn.resolvedValue !== undefined) {
                this.handlersRegistry.executeSuccessHandler(middleFn.id, middleFn.resolvedValue);
            }
        }
    }

    /** Build the result 4-tuple from the request results. middleFns can be a named record or an array of subrequests */
    private buildResult<Routes extends RouteSubRequest<any>[], H extends Record<string, MiddlewareSubRequest<any>>>(
        routeSubRequest: RouteSubRequest<any> | undefined,
        workflowSubRequests: Routes | undefined,
        middleFns: H | MiddlewareSubRequest<any>[],
        errors: RequestErrors | undefined
    ): CallWithMiddleFnsResult<any, any, H> | WorkflowResult<Routes, H> | Result<any, any> {
        const middleFnsResults = {} as Record<string, any>;
        const middleFnsErrors = {} as Record<string, any>;
        const processedIds = new Set<string>();

        let routeResultPart: any;
        let routeErrorPart: any;

        if (routeSubRequest) {
            processedIds.add(routeSubRequest.id);
            const routeError =
                errors?.get(routeSubRequest.id) || (errors ? findSubRequestError(routeSubRequest, errors) : undefined);
            routeResultPart = routeError ? undefined : routeSubRequest.resolvedValue;
            routeErrorPart = routeError;
        } else if (workflowSubRequests) {
            const routeResults: (any | undefined)[] = [];
            const routeErrors: (any | undefined)[] = [];
            for (const routeSubRequest of workflowSubRequests) {
                processedIds.add(routeSubRequest.id);
                const routeError = errors?.get(routeSubRequest.id);
                if (routeError) {
                    routeResults.push(undefined);
                    routeErrors.push(routeError);
                } else {
                    routeResults.push(routeSubRequest.resolvedValue);
                    routeErrors.push(undefined);
                }
            }
            const hasAnyResult = routeResults.some((r) => r !== undefined);
            const hasAnyError = routeErrors.some((e) => e !== undefined);
            routeResultPart = hasAnyResult ? routeResults : undefined;
            routeErrorPart = hasAnyError ? routeErrors : undefined;
        }

        // middleFns can be a named record (from callWithMiddleFns/routesFlow) or an array (from executeCall)
        if (Array.isArray(middleFns)) {
            // Array of subrequests - use IDs as keys
            for (const middleFn of middleFns) {
                processedIds.add(middleFn.id);
                const middleFnError = errors?.get(middleFn.id);
                if (middleFnError) {
                    middleFnsErrors[middleFn.id] = middleFnError;
                } else if (middleFn.resolvedValue !== undefined) {
                    middleFnsResults[middleFn.id] = middleFn.resolvedValue;
                }
            }
        } else {
            // Named record - use names as keys
            for (const [name, middleFn] of Object.entries(middleFns)) {
                processedIds.add(middleFn.id);
                const middleFnError = errors?.get(middleFn.id);
                if (middleFnError) {
                    middleFnsErrors[name] = middleFnError;
                } else if (middleFn.resolvedValue !== undefined) {
                    middleFnsResults[name] = middleFn.resolvedValue;
                }
            }
        }

        if (errors) {
            for (const [id, error] of errors) {
                if (!processedIds.has(id)) {
                    middleFnsErrors[id] = error;
                }
            }
        }

        return [routeResultPart, routeErrorPart, middleFnsResults, middleFnsErrors] as any;
    }

    typeErrors<List extends SubRequest<any>[]>(...subRequest: List): Promise<RunTypeError[]> {
        const request = new MionClientRequest(this.clientOptions, this.prefilledMiddleFnsCache);
        return request.validateParams(subRequest);
    }

    prefill<List extends MiddlewareSubRequest<any>[]>(...subRequest: List): Promise<void> {
        const request = new MionClientRequest(this.clientOptions, this.prefilledMiddleFnsCache);
        const promise = request.prefill(subRequest);
        this.pendingPrefills.push(promise);
        promise.finally(() => {
            const index = this.pendingPrefills.indexOf(promise);
            if (index >= 0) this.pendingPrefills.splice(index, 1);
        });
        return promise;
    }

    removePrefill<List extends MiddlewareSubRequest<any>[]>(...subRequest: List): Promise<void> {
        const request = new MionClientRequest(this.clientOptions, this.prefilledMiddleFnsCache);
        return request.removePrefill(subRequest);
    }

    /** Clear all error handlers from the registry */
    destroy(): void {
        this.handlersRegistry.clearAll();
    }
}

class MethodProxy {
    propsProxies: Record<string, MethodProxy> = {};
    handler = {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        apply: (_target: any, _thisArg: any, argArray?: any): RouteSubRequest<any> & MiddlewareSubRequest<any> => {
            const handlerId = getRouterItemId(this.parentProps);
            return new MionSubRequest(this.parentProps, handlerId, argArray, this.client);
        },

        get: (_target: any, prop: string): typeof Proxy => {
            const existing = this.propsProxies[prop];
            if (existing) return existing.proxy;
            const newMethodProxy = new MethodProxy([...this.parentProps, prop], this.client, this.clientOptions);
            this.propsProxies[prop] = newMethodProxy;
            return newMethodProxy.proxy;
        },
    };

    proxy: typeof Proxy;

    constructor(
        public parentProps: string[],
        private client: MionClient,
        private clientOptions: ClientOptions
    ) {
        const target = () => null;
        this.proxy = new Proxy(target, this.handler);
    }
}
