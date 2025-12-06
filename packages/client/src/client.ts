/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {DEFAULT_PREFILL_OPTIONS} from './constants';
import {
    ClientOptions,
    HookSubRequest,
    InitOptions,
    RouteSubRequest,
    SubRequest,
    RequestErrors,
    SuccessClientResponse,
    ClientRoutes,
    ClientHooks,
} from './types';
import type {RemoteApi} from '@mionkit/router';
import {RpcError} from '@mionkit/core';
import {getRouterItemId} from '@mionkit/core';
import {MionRequest} from './request';
import type {RunTypeError} from '@mionkit/core';

export function initClient<RM extends RemoteApi>(
    options: InitOptions
): {client: MionClient; routes: ClientRoutes<RM>; hooks: ClientHooks<RM>} {
    const clientOptions = {
        ...DEFAULT_PREFILL_OPTIONS,
        ...options,
    };
    const client = new MionClient(clientOptions);
    const rootProxy = new MethodProxy([], client, clientOptions);
    return {
        client,
        routes: rootProxy.proxy as ClientRoutes<RM>,
        hooks: rootProxy.proxy as ClientHooks<RM>,
    };
}

// ############# Client   #############
// state is managed inside a class in case multiple clients are required (using multiple apis)
class MionClient {
    constructor(private clientOptions: ClientOptions) {}

    // todo return strong typed response
    call<RR extends RouteSubRequest<any>, RHList extends HookSubRequest<any>[]>(
        routeSubRequest: RR,
        ...hookSubRequests: RHList
    ): Promise<SuccessClientResponse<RR, RHList>> {
        const request = new MionRequest(this.clientOptions, routeSubRequest, hookSubRequests);
        return request
            .call()
            .then(
                () => [routeSubRequest.result, ...hookSubRequests.map((hook) => hook.result)] as SuccessClientResponse<RR, RHList>
            );
    }

    typeErrors<List extends SubRequest<any>[]>(...subRequest: List): Promise<RunTypeError[]> {
        const request = new MionRequest(this.clientOptions);
        return request.validateParams(subRequest);
    }

    prefill<List extends HookSubRequest<any>[]>(...subRequest: List): Promise<void> {
        const request = new MionRequest(this.clientOptions);
        return request.prefill(subRequest);
    }

    removePrefill<List extends HookSubRequest<any>[]>(...subRequest: List): Promise<void> {
        const request = new MionRequest(this.clientOptions);
        return request.removePrefill(subRequest);
    }
}

// ############# Remote Methods Proxy   #############

class MethodProxy {
    propsProxies = {};
    handler = {
        apply: (target: any, thisArg: any, argArray?: any): RouteSubRequest<any> & HookSubRequest<any> => {
            let storedHooks: HookSubRequest<any>[] = [];

            const subRequest: RouteSubRequest<any> & HookSubRequest<any> = {
                pointer: [...this.parentProps],
                id: getRouterItemId(this.parentProps),
                isResolved: false,
                params: argArray,
                result: undefined, // resolved once request gets resolved
                error: undefined, // resolved once request gets resolved
                prefill: (): Promise<void> => {
                    return this.client.prefill(subRequest).catch((errors) => Promise.reject(findError(subRequest, errors)));
                },
                removePrefill: (): Promise<void> => {
                    return this.client.removePrefill(subRequest).catch((errors) => Promise.reject(findError(subRequest, errors)));
                },
                hooks: (...hooks: HookSubRequest<any>[]): RouteSubRequest<any> & HookSubRequest<any> => {
                    storedHooks = hooks;
                    return subRequest;
                },
                call: (): Promise<any> => {
                    return this.client
                        .call(subRequest, ...storedHooks)
                        .then(() => subRequest.result)
                        .catch((errors) => Promise.reject(findError(subRequest, errors)));
                },
                typeErrors: (): Promise<RunTypeError[]> => {
                    return this.client.typeErrors(subRequest).catch((errors) => Promise.reject(findError(subRequest, errors)));
                },
            };
            return subRequest;
        },
        get: (target, prop): typeof Proxy => {
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
        // the target must be a function so the handler can trap calls using apply
        const target = () => null;
        this.proxy = new Proxy(target, this.handler);
    }
}

function findError(req: SubRequest<any>, errors: RequestErrors): RpcError<string> {
    const specificError = errors.get(req.id);
    if (specificError) return specificError;

    const firstError = errors.values().next().value;
    if (firstError) return firstError;

    // Fallback error if no errors found (shouldn't happen)
    return new RpcError({
        statusCode: 500,
        type: 'unknown-error',
        publicMessage: 'An unknown error occurred',
    });
}
