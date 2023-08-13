/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {DEFAULT_PREFILL_OPTIONS} from './constants';
import {
    ClientMethods,
    ClientOptions,
    HookSubRequest,
    InitOptions,
    ReflectionById,
    RemoteMethodsById,
    RouteSubRequest,
    SubRequest,
    SuccessClientResponse,
} from './types';
import type {RemoteMethods, ResolvedPublicResponses} from '@mionkit/router';
import {getRouterItemId, isPublicError} from '@mionkit/core';
import {MionRequest} from './request';
import {ParamsValidationResponse} from '@mionkit/runtype';

export function initMionClient<RM extends RemoteMethods<any>>(
    options: InitOptions
): {client: MionClient; methods: ClientMethods<RM>} {
    const clientOptions = {
        ...DEFAULT_PREFILL_OPTIONS,
        ...options,
    };
    const client = new MionClient(clientOptions);
    const rootProxy = new MethodProxy([], client, clientOptions);
    return {client, methods: rootProxy.proxy as ClientMethods<RM>};
}

// ############# Client   #############
// state is managed inside a class in case multiple clients are required (using multiple apis)
class MionClient {
    private remoteMethodsById: RemoteMethodsById = new Map();
    private reflectionById: ReflectionById = new Map();

    constructor(private clientOptions: ClientOptions) {}

    // todo return strong typed response
    callRoute<RR extends RouteSubRequest<any>, RHList extends HookSubRequest<any>[]>(
        routeSubRequest: RR,
        ...hookSubRequests: RHList
    ): Promise<SuccessClientResponse<RR, RHList>> {
        const request = new MionRequest(
            this.clientOptions,
            this.remoteMethodsById,
            this.reflectionById,
            routeSubRequest,
            hookSubRequests
        );
        return request
            .run()
            .then(
                () => [routeSubRequest.return, ...hookSubRequests.map((hook) => hook.return)] as SuccessClientResponse<RR, RHList>
            )
            .catch((resp: ResolvedPublicResponses) => {
                if (routeSubRequest.error) return Promise.reject(routeSubRequest.error);
                // any other error returned by the server
                return Promise.reject(Object.values(resp).find((r) => isPublicError(r)));
            });
    }

    validate<List extends SubRequest<any>[]>(...subRequest: List): Promise<ParamsValidationResponse[]> {
        const request = new MionRequest(this.clientOptions, this.remoteMethodsById, this.reflectionById);
        return request.validateParams(subRequest);
    }

    persist<List extends HookSubRequest<any>[]>(...subRequest: List): Promise<void> {
        const request = new MionRequest(this.clientOptions, this.remoteMethodsById, this.reflectionById);
        return request.persist(subRequest);
    }
}

// ############# Remote Methods Proxy   #############

class MethodProxy {
    propsProxies = {};
    handler = {
        apply: (target: any, thisArg: any, argArray?: any): RouteSubRequest<any> & HookSubRequest<any> => {
            const subRequest: RouteSubRequest<any> & HookSubRequest<any> = {
                pointer: [...this.parentProps],
                id: getRouterItemId(this.parentProps),
                isResolved: false,
                params: argArray,
                return: undefined, // resolved once request gets resolved
                error: undefined, // resolved once request gets resolved
                persist: () => {
                    this.client.persist(subRequest);
                },
                call: (...hooks: HookSubRequest<any>[]): Promise<any> => {
                    return this.client.callRoute(subRequest, ...hooks).then(() => subRequest.return);
                },
                validate: (): Promise<ParamsValidationResponse> => {
                    return this.client.validate(subRequest).then((responses) => responses[0]);
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
