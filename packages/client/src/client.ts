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
    HookRequest,
    InitOptions,
    ReflectionById,
    RemoteMethodsById,
    RouteRequest,
    RemoteCallResponse,
} from './types';
import {RemoteMethods} from '@mionkit/router';
import {PublicError, getRouterItemId} from '@mionkit/core';
import {MionRequest} from './request';

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

// ############# STATE   #############
// state is managed inside a class in case multiple clients are required (using multiple apis)
class MionClient {
    private remoteMethodsById: RemoteMethodsById = new Map();
    private reflectionByPath: ReflectionById = new Map();

    constructor(private clientOptions: ClientOptions) {}

    async callRoute<RR extends RouteRequest<any>, RHList extends HookRequest<any>[]>(
        route: RR,
        ...hooks: RHList
    ): Promise<RemoteCallResponse<RR, RHList>> {
        const request = new MionRequest(route, hooks, this.clientOptions, this.remoteMethodsById, this.reflectionByPath);
        return request.runRoute();
    }
}

class MethodProxy {
    propsProxies = {};
    handler = {
        apply: (target: any, thisArg: any, argArray?: any): RouteRequest<any> & HookRequest<any> => {
            const methodRequestProxy = {
                pointer: [...this.parentProps],
                id: getRouterItemId(this.parentProps),
                isResolved: false,
                params: argArray,
                persist: (storage = this.clientOptions.storage) => {
                    // todo persist values to storage
                    console.log('storage', storage);
                },
                call: async (...hooks: HookRequest<any>[]): Promise<any | PublicError> => {
                    return this.client.callRoute(methodRequestProxy, ...hooks).then((resp) => {
                        if (resp.hasErrors) throw resp;
                        return resp.routeResponse;
                    });
                },
            } as RouteRequest<any> & HookRequest<any>;
            return methodRequestProxy;
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

    constructor(public parentProps: string[], private client: MionClient, private clientOptions: ClientOptions) {
        // the target must be a function so the handler can trap calls using apply
        const target = () => null;
        this.proxy = new Proxy(target, this.handler);
    }
}
