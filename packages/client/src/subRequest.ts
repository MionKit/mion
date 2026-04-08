/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionjs/core';
import type {RunTypeError} from '@mionjs/core';
import type {CallSetup, MiddlewareSubRequest, RequestErrors, RouteSubRequest, SubRequest} from './types.ts';
import type {MapFromServerFnRef} from '@mionjs/core';
import type {MionClient} from './client.ts';
import {TypedEvent} from './lib/typedEvent.ts';
import {isMapFromRef} from './routesFlow.ts';

/** Implementation of both RouteSubRequest and MiddleFnSubRequest interfaces */
export class MionSubRequest<S = any, E extends RpcError<string, any> = any>
    implements RouteSubRequest<any>, MiddlewareSubRequest<any>
{
    pointer: string[];
    id: string;
    isResolved: boolean = false;
    params: any[];
    resolvedValue?: S;
    error?: E;
    serializedParams?: any[];
    mappings: MapFromServerFnRef[] = [];

    constructor(
        parentProps: string[],
        handlerId: string,
        argArray: any[],
        readonly client: MionClient
    ) {
        this.pointer = [...parentProps];
        this.id = handlerId;
        this.params = argArray.map((arg, index) => {
            if (isMapFromRef(arg)) {
                arg.toRequestId = this.id;
                arg.paramIndex = index;
                this.mappings.push(arg);
                return null;
            }
            return arg;
        });
    }

    /** Prefills MiddleFn's parameters and returns TypedEvent for event handler registration */
    prefill(): TypedEvent<S, E> {
        const typedEvent = new TypedEvent<S, E>(this.id, this.client.handlersRegistry);

        this.client.prefill(this as MiddlewareSubRequest<any>).catch((errors: RequestErrors) => {
            console.error('Prefill error:', findSubRequestError(this, errors));
        });

        return typedEvent;
    }

    /** Removes prefilled value and clears any registered error handlers for this middleFn */
    removePrefill(): Promise<void> {
        this.client.handlersRegistry.clearHandlers(this.id);
        return this.client.removePrefill(this as MiddlewareSubRequest<any>);
    }

    /** Calls a remote route with optional setup (middleFns, otherRoutes, signal, timeout) */
    call(setup?: CallSetup<any, any>): Promise<any> {
        const signal = setup?.signal;
        const timeout = setup?.timeout;
        if (!setup || (!setup.otherRoutes && !setup.middleFns)) {
            return this.client.execute(this as unknown as RouteSubRequest<any>, undefined, undefined, signal, timeout);
        }
        if (setup.otherRoutes && setup.otherRoutes.length > 0) {
            return this.executeWithOtherRoutes(setup.otherRoutes, setup.middleFns, signal, timeout);
        }
        return this.client.execute(this as unknown as RouteSubRequest<any>, undefined, setup.middleFns, signal, timeout);
    }

    private async executeWithOtherRoutes(
        otherRoutes: RouteSubRequest<any>[],
        middleFns?: Record<string, MiddlewareSubRequest<any>>,
        signal?: AbortSignal,
        timeout?: number
    ): Promise<any> {
        const allRoutes = [this as unknown as RouteSubRequest<any>, ...otherRoutes];
        const [results, errors, mfR, mfE] = await this.client.execute(undefined, allRoutes, middleFns ?? {}, signal, timeout);
        const emptyResults = allRoutes.map(() => undefined);
        const emptyErrors = allRoutes.map(() => undefined);
        return [results ?? emptyResults, errors ?? emptyErrors, mfR, mfE];
    }

    /** Validates parameters and returns type errors */
    typeErrors(): Promise<RunTypeError[]> {
        return this.client
            .typeErrors(this as SubRequest<any>)
            .catch((errors: RequestErrors) => Promise.reject(findSubRequestError(this, errors)));
    }
}

/** Finds the most relevant error from the errors map for a given sub-request */
export function findSubRequestError(subRequest: SubRequest<any>, errors: RequestErrors): RpcError<string> {
    const specificError = errors.get(subRequest.id);
    if (specificError) return specificError;

    const firstError = errors.values().next().value;
    if (firstError) return firstError;

    return new RpcError({
        type: 'unknown-error',
        publicMessage: 'An unknown error occurred',
    });
}
