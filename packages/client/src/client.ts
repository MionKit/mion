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
    LinkedFnSuccess,
    LinkedFnError,
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
import {registerErrorDeserializers, RpcError} from '@mionkit/core';
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
        return new Promise((resolve) => {
            const request = new MionClientRequest(this.clientOptions, this.prefilledLinkedFnsCache, routeSubRequest, []);

            request
                .call()
                .then(() => {
                    const allLinkedFns = this.getAllLinkedFnsFromRequest(request, routeSubRequest.id);
                    this.processLinkedFnsResponses(allLinkedFns, undefined);
                    const {linkedFnsResults, linkedFnsErrors} = this.buildLinkedFnsResultsFromList(
                        allLinkedFns,
                        undefined,
                        routeSubRequest.id
                    );
                    resolve([routeSubRequest.resolvedValue, undefined, linkedFnsResults, linkedFnsErrors]);
                })
                .catch((errors: RequestErrors) => {
                    const allLinkedFns = this.getAllLinkedFnsFromRequest(request, routeSubRequest.id);
                    this.processLinkedFnsResponses(allLinkedFns, errors);
                    const {linkedFnsResults, linkedFnsErrors} = this.buildLinkedFnsResultsFromList(
                        allLinkedFns,
                        errors,
                        routeSubRequest.id
                    );
                    const routeError = errors.get(routeSubRequest.id) || findSubRequestError(routeSubRequest, errors);
                    resolve([undefined, routeError, linkedFnsResults, linkedFnsErrors]);
                });
        });
    }

    /** Build linkedFns results and errors from a list of linkedFn sub-requests */
    private buildLinkedFnsResultsFromList(
        linkedFnSubRequests: HSubRequest<any>[],
        errors: RequestErrors | undefined,
        routeId?: string
    ): {linkedFnsResults: Record<string, unknown>; linkedFnsErrors: Record<string, RpcError<string, unknown>>} {
        const linkedFnsResults: Record<string, unknown> = {};
        const linkedFnsErrors: Record<string, RpcError<string, unknown>> = {};

        const processedIds = new Set<string>();
        if (routeId) processedIds.add(routeId);

        for (const linkedFn of linkedFnSubRequests) {
            processedIds.add(linkedFn.id);
            const linkedFnError = errors?.get(linkedFn.id);
            if (linkedFnError) {
                linkedFnsErrors[linkedFn.id] = linkedFnError;
            } else if (linkedFn.resolvedValue !== undefined) {
                linkedFnsResults[linkedFn.id] = linkedFn.resolvedValue;
            }
        }

        if (errors) {
            for (const [id, error] of errors) {
                if (!processedIds.has(id)) {
                    linkedFnsErrors[id] = error;
                }
            }
        }

        return {linkedFnsResults, linkedFnsErrors};
    }

    /** Get all linkedFns from the request's subRequestList, excluding the route */
    private getAllLinkedFnsFromRequest(
        request: MionClientRequest<RSubRequest<any>, HSubRequest<any>[]>,
        routeId: string
    ): HSubRequest<any>[] {
        return Object.entries(request.subRequestList)
            .filter(([id]) => id !== routeId)
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

    /** Executes a route call with linkedFns and returns a typed result object */
    executeCallWithLinkedFns<H extends Record<string, HSubRequest<any>>>(
        routeSubRequest: RSubRequest<any>,
        linkedFnsRecord: H,
        linkedFnSubRequests: HSubRequest<any>[]
    ): Promise<CallWithLinkedFnsResult<any, any, H>> {
        return new Promise((resolve) => {
            const request = new MionClientRequest(
                this.clientOptions,
                this.prefilledLinkedFnsCache,
                routeSubRequest,
                linkedFnSubRequests
            );

            request
                .call()
                .then(() => {
                    const allLinkedFns = this.getAllLinkedFnsFromRequest(request, routeSubRequest.id);
                    this.processLinkedFnsResponses(allLinkedFns, undefined);
                    const result = this.buildCallWithLinkedFnsResult(routeSubRequest, linkedFnsRecord, undefined);
                    resolve(result);
                })
                .catch((errors: RequestErrors) => {
                    const allLinkedFns = this.getAllLinkedFnsFromRequest(request, routeSubRequest.id);
                    this.processLinkedFnsResponses(allLinkedFns, errors);
                    const result = this.buildCallWithLinkedFnsResult(routeSubRequest, linkedFnsRecord, errors);
                    resolve(result);
                });
        });
    }

    /** Build the CallWithLinkedFnsResult 4-tuple from the request results */
    private buildCallWithLinkedFnsResult<H extends Record<string, HSubRequest<any>>>(
        routeSubRequest: RSubRequest<any>,
        linkedFnsRecord: H,
        errors: RequestErrors | undefined
    ): CallWithLinkedFnsResult<any, any, H> {
        const routeError = errors?.get(routeSubRequest.id);
        const routeResult = routeError ? undefined : routeSubRequest.resolvedValue;

        const linkedFnsResults = {} as {[K in keyof H]?: LinkedFnSuccess<H[K]>};
        const linkedFnsErrors = {} as {[K in keyof H]?: LinkedFnError<H[K]>};

        const processedIds = new Set<string>([routeSubRequest.id]);

        for (const [name, linkedFn] of Object.entries(linkedFnsRecord)) {
            processedIds.add(linkedFn.id);
            const linkedFnError = errors?.get(linkedFn.id);
            if (linkedFnError) {
                (linkedFnsErrors as Record<string, any>)[name] = linkedFnError;
            } else if (linkedFn.resolvedValue !== undefined) {
                (linkedFnsResults as Record<string, any>)[name] = linkedFn.resolvedValue;
            }
        }

        if (errors) {
            for (const [id, error] of errors) {
                if (!processedIds.has(id)) {
                    (linkedFnsErrors as Record<string, any>)[id] = error;
                }
            }
        }

        return [routeResult, routeError, linkedFnsResults, linkedFnsErrors];
    }

    /** Executes a workflow call with multiple routes and optional linkedFns */
    executeCallWithWorkflow<Routes extends RSubRequest<any>[], H extends Record<string, HSubRequest<any>>>(
        workflowSubRequests: Routes,
        linkedFnsRecord: H,
        linkedFnSubRequests: HSubRequest<any>[]
    ): Promise<WorkflowResult<Routes, H>> {
        return new Promise((resolve, reject) => {
            let request: MionClientRequest<any, any>;
            try {
                request = new MionClientRequest(
                    this.clientOptions,
                    this.prefilledLinkedFnsCache,
                    undefined,
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
                    const workflowRouteIds = new Set(workflowSubRequests.map((sr) => sr.id));
                    const allLinkedFns = this.getAllLinkedFnsFromWorkflowRequest(request, workflowRouteIds);
                    this.processLinkedFnsResponses(allLinkedFns, undefined);
                    const result = this.buildWorkflowResult(workflowSubRequests, linkedFnsRecord, undefined);
                    resolve(result);
                })
                .catch((errors: RequestErrors) => {
                    const workflowRouteIds = new Set(workflowSubRequests.map((sr) => sr.id));
                    const allLinkedFns = this.getAllLinkedFnsFromWorkflowRequest(request, workflowRouteIds);
                    this.processLinkedFnsResponses(allLinkedFns, errors);
                    const result = this.buildWorkflowResult(workflowSubRequests, linkedFnsRecord, errors);
                    resolve(result);
                });
        });
    }

    /** Get all linkedFns from the request's subRequestList, excluding workflow routes */
    private getAllLinkedFnsFromWorkflowRequest(
        request: MionClientRequest<any, any>,
        workflowRouteIds: Set<string>
    ): HSubRequest<any>[] {
        return Object.entries(request.subRequestList)
            .filter(([id]) => !workflowRouteIds.has(id))
            .map(([, subRequest]) => subRequest as HSubRequest<any>);
    }

    /** Build the WorkflowResult 4-tuple from the request results */
    private buildWorkflowResult<Routes extends RSubRequest<any>[], H extends Record<string, HSubRequest<any>>>(
        workflowSubRequests: Routes,
        linkedFnsRecord: H,
        errors: RequestErrors | undefined
    ): WorkflowResult<Routes, H> {
        const routeResults: (any | undefined)[] = [];
        const routeErrors: (any | undefined)[] = [];
        const processedIds = new Set<string>();

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

        const linkedFnsResults = {} as {[K in keyof H]?: LinkedFnSuccess<H[K]>};
        const linkedFnsErrors = {} as {[K in keyof H]?: LinkedFnError<H[K]>};

        for (const [name, linkedFn] of Object.entries(linkedFnsRecord)) {
            processedIds.add(linkedFn.id);
            const linkedFnError = errors?.get(linkedFn.id);
            if (linkedFnError) {
                (linkedFnsErrors as Record<string, any>)[name] = linkedFnError;
            } else if (linkedFn.resolvedValue !== undefined) {
                (linkedFnsResults as Record<string, any>)[name] = linkedFn.resolvedValue;
            }
        }

        if (errors) {
            for (const [id, error] of errors) {
                if (!processedIds.has(id)) {
                    (linkedFnsErrors as Record<string, any>)[id] = error;
                }
            }
        }

        const hasAnyResult = routeResults.some((r) => r !== undefined);
        const hasAnyError = routeErrors.some((e) => e !== undefined);

        return [
            hasAnyResult ? (routeResults as any) : undefined,
            hasAnyError ? (routeErrors as any) : undefined,
            Object.keys(linkedFnsResults).length > 0 ? linkedFnsResults : undefined,
            Object.keys(linkedFnsErrors).length > 0 ? linkedFnsErrors : undefined,
        ];
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
