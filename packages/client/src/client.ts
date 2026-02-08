/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {DEFAULT_PREFILL_OPTIONS} from './constants';
import {
    CallWithLinkedFnsResult,
    ClientOptions,
    HSubRequest,
    InitOptions,
    RSubRequest,
    SubRequest,
    RequestErrors,
    ClientRoutes,
    ClientLinkedFns,
    Result,
    WorkflowResult,
} from './types';
import type {RemoteApi} from '@mionkit/router';
import {registerErrorDeserializers} from '@mionkit/core';
import {getRouterItemId} from '@mionkit/core';
import {MionClientRequest} from './request';
import type {RunTypeError} from '@mionkit/core';
import {HandlersRegistry} from './handlersRegistry';
import {MionSubRequest, findSubRequestError} from './subRequest';

export function initClient<RM extends RemoteApi>(
    options: InitOptions
): {client: MionClient; routes: ClientRoutes<RM>; linkedFns: ClientLinkedFns<RM>} {
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
        linkedFns: rootProxy.proxy as ClientLinkedFns<RM>,
    };
}

export class MionClient {
    /** Shared registry for persistent linkedFn error handlers */
    readonly handlersRegistry = new HandlersRegistry();

    /** In-memory cache for prefilled linkedFn subrequests (keyed by baseURL:linkedFnId) */
    readonly prefilledLinkedFnsCache = new Map<string, SubRequest<any>>();

    constructor(private clientOptions: ClientOptions) {}

    /** Executes a route call and returns a Result 4-tuple */
    executeCall<RR extends RSubRequest<any>>(routeSubRequest: RR): Promise<Result<any, any>> {
        return this.executeRequest(routeSubRequest, undefined, undefined);
    }

    /** Executes a route call with linkedFns and returns a typed result object */
    executeCallWithLinkedFns<H extends Record<string, HSubRequest<any>>>(
        routeSubRequest: RSubRequest<any>,
        linkedFnsRecord: H
    ): Promise<CallWithLinkedFnsResult<any, any, H>> {
        return this.executeRequest(routeSubRequest, undefined, linkedFnsRecord);
    }

    /** Executes a workflow call with multiple routes and optional linkedFns */
    executeCallWithWorkflow<Routes extends RSubRequest<any>[], H extends Record<string, HSubRequest<any>>>(
        workflowSubRequests: Routes,
        linkedFnsRecord: H
    ): Promise<WorkflowResult<Routes, H>> {
        return this.executeRequest(undefined, workflowSubRequests, linkedFnsRecord);
    }

    private executeRequest<Routes extends RSubRequest<any>[], H extends Record<string, HSubRequest<any>>>(
        routeSubRequest: RSubRequest<any> | undefined,
        workflowSubRequests: Routes | undefined,
        linkedFnsRecord: H | undefined
    ): Promise<any> {
        return new Promise((resolve, reject) => {
            let request: MionClientRequest<any, any>;
            const linkedFnSubRequests = linkedFnsRecord ? Object.values(linkedFnsRecord) : [];
            try {
                request = new MionClientRequest(
                    this.clientOptions,
                    this.prefilledLinkedFnsCache,
                    routeSubRequest,
                    linkedFnSubRequests,
                    workflowSubRequests
                );
            } catch (error) {
                reject(error);
                return;
            }

            request
                .call()
                .then(() => {
                    const routeIds = this.getRouteIds(routeSubRequest, workflowSubRequests);
                    const allLinkedFns = this.getAllLinkedFnsFromRequest(request, routeIds);
                    this.processLinkedFnsResponses(allLinkedFns, undefined);
                    const result = this.buildResult(
                        routeSubRequest,
                        workflowSubRequests,
                        linkedFnsRecord || allLinkedFns,
                        undefined
                    );
                    resolve(result);
                })
                .catch((errors: RequestErrors) => {
                    const routeIds = this.getRouteIds(routeSubRequest, workflowSubRequests);
                    const allLinkedFns = this.getAllLinkedFnsFromRequest(request, routeIds);
                    this.processLinkedFnsResponses(allLinkedFns, errors);
                    const result = this.buildResult(
                        routeSubRequest,
                        workflowSubRequests,
                        linkedFnsRecord || allLinkedFns,
                        errors
                    );
                    resolve(result);
                });
        });
    }

    /** Get route IDs from single route or workflow routes */
    private getRouteIds(
        routeSubRequest: RSubRequest<any> | undefined,
        workflowSubRequests: RSubRequest<any>[] | undefined
    ): Set<string> {
        const routeIds = new Set<string>();
        if (routeSubRequest) routeIds.add(routeSubRequest.id);
        if (workflowSubRequests) workflowSubRequests.forEach((sr) => routeIds.add(sr.id));
        return routeIds;
    }

    /** Get all linkedFns from the request's subRequestList, excluding the route(s) */
    private getAllLinkedFnsFromRequest(request: MionClientRequest<any, any>, excludedIds: Set<string>): HSubRequest<any>[] {
        return Object.entries(request.subRequestList)
            .filter(([id]) => !excludedIds.has(id))
            .map(([, subRequest]) => subRequest as HSubRequest<any>);
    }

    /** Process all linkedFn responses - call success or error handlers for each linkedFn individually */
    private processLinkedFnsResponses(linkedFnSubRequests: HSubRequest<any>[], errors: RequestErrors | undefined): void {
        for (const linkedFn of linkedFnSubRequests) {
            const linkedFnError = errors?.get(linkedFn.id);
            if (linkedFnError) {
                this.handlersRegistry.executeHandler(linkedFn.id, linkedFnError);
            } else if (linkedFn.resolvedValue !== undefined) {
                this.handlersRegistry.executeSuccessHandler(linkedFn.id, linkedFn.resolvedValue);
            }
        }
    }

    /** Build the result 4-tuple from the request results. linkedFns can be a named record or an array of subrequests */
    private buildResult<Routes extends RSubRequest<any>[], H extends Record<string, HSubRequest<any>>>(
        routeSubRequest: RSubRequest<any> | undefined,
        workflowSubRequests: Routes | undefined,
        linkedFns: H | HSubRequest<any>[],
        errors: RequestErrors | undefined
    ): CallWithLinkedFnsResult<any, any, H> | WorkflowResult<Routes, H> | Result<any, any> {
        const linkedFnsResults = {} as Record<string, any>;
        const linkedFnsErrors = {} as Record<string, any>;
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

        // linkedFns can be a named record (from callWithLinkedFns/workflow) or an array (from executeCall)
        if (Array.isArray(linkedFns)) {
            // Array of subrequests - use IDs as keys
            for (const linkedFn of linkedFns) {
                processedIds.add(linkedFn.id);
                const linkedFnError = errors?.get(linkedFn.id);
                if (linkedFnError) {
                    linkedFnsErrors[linkedFn.id] = linkedFnError;
                } else if (linkedFn.resolvedValue !== undefined) {
                    linkedFnsResults[linkedFn.id] = linkedFn.resolvedValue;
                }
            }
        } else {
            // Named record - use names as keys
            for (const [name, linkedFn] of Object.entries(linkedFns)) {
                processedIds.add(linkedFn.id);
                const linkedFnError = errors?.get(linkedFn.id);
                if (linkedFnError) {
                    linkedFnsErrors[name] = linkedFnError;
                } else if (linkedFn.resolvedValue !== undefined) {
                    linkedFnsResults[name] = linkedFn.resolvedValue;
                }
            }
        }

        if (errors) {
            for (const [id, error] of errors) {
                if (!processedIds.has(id)) {
                    linkedFnsErrors[id] = error;
                }
            }
        }

        return [routeResultPart, routeErrorPart, linkedFnsResults, linkedFnsErrors] as any;
    }

    typeErrors<List extends SubRequest<any>[]>(...subRequest: List): Promise<RunTypeError[]> {
        const request = new MionClientRequest(this.clientOptions, this.prefilledLinkedFnsCache);
        return request.validateParams(subRequest);
    }

    prefill<List extends HSubRequest<any>[]>(...subRequest: List): Promise<void> {
        const request = new MionClientRequest(this.clientOptions, this.prefilledLinkedFnsCache);
        return request.prefill(subRequest);
    }

    removePrefill<List extends HSubRequest<any>[]>(...subRequest: List): Promise<void> {
        const request = new MionClientRequest(this.clientOptions, this.prefilledLinkedFnsCache);
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
        apply: (_target: any, _thisArg: any, argArray?: any): RSubRequest<any> & HSubRequest<any> => {
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
