/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionjs/core';
import type {RunTypeError} from '@mionjs/core';
import type {
    CallWithMiddleFnsResult,
    MiddlewareSubRequest,
    RequestErrors,
    Result,
    RouteSubRequest,
    SubRequest,
    WorkflowResult,
} from './types.ts';
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

    /** Calls a remote route and returns a Result 4-tuple with full typing preserved */
    call(): Promise<Result<S, E>> {
        return this.client.executeCall(this as unknown as RouteSubRequest<any>);
    }

    /** Calls a remote route with middleFns and returns a fully-typed 4-tuple result */
    callWithMiddleFns<H extends Record<string, MiddlewareSubRequest<any>>>(
        middleFns: H
    ): Promise<CallWithMiddleFnsResult<S, E, H>> {
        if (Object.keys(middleFns).length === 0) {
            throw new Error(
                'callWithMiddleFns requires at least one middleFn. Use call() instead for requests without middleFns.'
            );
        }
        return this.client.executeCallWithMiddleFns(this as RouteSubRequest<any>, middleFns) as Promise<
            CallWithMiddleFnsResult<S, E, H>
        >;
    }

    /** Calls this route as part of a routesFlow with other routes in a single HTTP request */
    async callWithWorkflow<OtherRoutes extends RouteSubRequest<any>[], H extends Record<string, MiddlewareSubRequest<any>>>(
        otherRoutes: [...OtherRoutes],
        middleFns?: H
    ): Promise<WorkflowResult<[RouteSubRequest<any>, ...OtherRoutes], H>> {
        const allRoutes = [this as unknown as RouteSubRequest<any>, ...otherRoutes];
        const [results, errors, middleFnResults, middleFnErrors] = await this.client.executeCallWithWorkflow(
            allRoutes,
            middleFns ?? ({} as H)
        );
        const emptyResults = allRoutes.map(() => undefined);
        const emptyErrors = allRoutes.map(() => undefined);
        return [results ?? emptyResults, errors ?? emptyErrors, middleFnResults, middleFnErrors] as WorkflowResult<
            [RouteSubRequest<any>, ...OtherRoutes],
            H
        >;
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
