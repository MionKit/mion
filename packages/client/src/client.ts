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
    MetadataById,
    RouteSubRequest,
    SubRequest,
    RequestErrors,
    SuccessClientResponse,
} from './types';
import type {RemoteApi} from '@mionkit/router';
import {PublicError, getRouterItemId} from '@mionkit/core';
import {MionRequest} from './request';
import {ParamsValidationResponse} from '@mionkit/runtype';

export function initClient<RM extends RemoteApi<any>>(options: InitOptions): {client: MionClient; methods: ClientMethods<RM>} {
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
    private metadataById: MetadataById = new Map();
    private reflectionById: ReflectionById = new Map();

    constructor(private clientOptions: ClientOptions) {}

    // todo return strong typed response
    call<RR extends RouteSubRequest<any>, RHList extends HookSubRequest<any>[]>(
        routeSubRequest: RR,
        ...hookSubRequests: RHList
    ): Promise<SuccessClientResponse<RR, RHList>> {
        const request = new MionRequest(
            this.clientOptions,
            this.metadataById,
            this.reflectionById,
            routeSubRequest,
            hookSubRequests
        );
        return request
            .call()
            .then(
                () => [routeSubRequest.return, ...hookSubRequests.map((hook) => hook.return)] as SuccessClientResponse<RR, RHList>
            );
    }

    validate<List extends SubRequest<any>[]>(...subRequest: List): Promise<ParamsValidationResponse[]> {
        const request = new MionRequest(this.clientOptions, this.metadataById, this.reflectionById);
        return request.validateParams(subRequest);
    }

    prefill<List extends HookSubRequest<any>[]>(...subRequest: List): Promise<void> {
        const request = new MionRequest(this.clientOptions, this.metadataById, this.reflectionById);
        return request.prefill(subRequest);
    }

    removePrefill<List extends HookSubRequest<any>[]>(...subRequest: List): Promise<void> {
        const request = new MionRequest(this.clientOptions, this.metadataById, this.reflectionById);
        return request.removePrefill(subRequest);
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
                prefill: (): Promise<void> => {
                    return this.client.prefill(subRequest).catch((errors) => Promise.reject(findError(subRequest, errors)));
                },
                removePrefill: (): Promise<void> => {
                    return this.client.removePrefill(subRequest).catch((errors) => Promise.reject(findError(subRequest, errors)));
                },
                call: (...hooks: HookSubRequest<any>[]): Promise<any> => {
                    return this.client
                        .call(subRequest, ...hooks)
                        .then(() => subRequest.return)
                        .catch((errors) => Promise.reject(findError(subRequest, errors)));
                },
                validate: (): Promise<ParamsValidationResponse> => {
                    return this.client
                        .validate(subRequest)
                        .then((responses) => responses[0])
                        .catch((errors) => Promise.reject(findError(subRequest, errors)));
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

function findError(req: SubRequest<any>, errors: RequestErrors): PublicError {
    return errors.get(req.id) || errors.values().next().value;
}
