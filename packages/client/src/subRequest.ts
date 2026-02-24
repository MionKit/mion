/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionkit/core';
import type {RunTypeError} from '@mionkit/core';
import type {
    CallWithLinkedFnsResult,
    HSubRequest,
    RequestErrors,
    Result,
    RSubRequest,
    SubRequest,
    WorkflowResult,
} from './types.ts';
import type {MapFromRef, MapFromServerFnRef} from '@mionkit/core/src/types/pureFunctions.types.ts';
import type {MionClient} from './client.ts';
import {TypedEvent} from './typedEvent.ts';
import {mapFromSymbol} from './routesFlow.ts';

/** Implementation of both RouteSubRequest and LinkedFnSubRequest interfaces */
export class MionSubRequest<S = any, E extends RpcError<string, any> = any> implements RSubRequest<any>, HSubRequest<any> {
    pointer: string[];
    id: string;
    isResolved: boolean = false;
    params: any[];
    resolvedValue?: S;
    error?: E;
    serializedParams?: any[];
    mappings: MapFromRef[] = [];

    constructor(
        parentProps: string[],
        handlerId: string,
        argArray: any[],
        readonly client: MionClient
    ) {
        this.pointer = [...parentProps];
        this.id = handlerId;
        this.params = argArray.map((arg) => {
            if (arg && arg.mapFromSymbol === mapFromSymbol) {
                const ref = arg as MapFromServerFnRef<any>;
                this.mappings.push({
                    fromRequestId: ref.fromRequestId,
                    toRequestId: this.id,
                    fnName: ref.fnName,
                    namespace: ref.namespace,
                } satisfies MapFromRef);
                return null;
            }
            return arg;
        });
    }

    /** Prefills LinkedFn's parameters and returns TypedEvent for event handler registration */
    prefill(): TypedEvent<S, E> {
        const typedEvent = new TypedEvent<S, E>(this.id, this.client.handlersRegistry);

        this.client.prefill(this as HSubRequest<any>).catch((errors: RequestErrors) => {
            console.error('Prefill error:', findSubRequestError(this, errors));
        });

        return typedEvent;
    }

    /** Removes prefilled value and clears any registered error handlers for this linkedFn */
    removePrefill(): Promise<void> {
        this.client.handlersRegistry.clearHandlers(this.id);
        return this.client.removePrefill(this as HSubRequest<any>);
    }

    /** Calls a remote route and returns a Result 4-tuple with full typing preserved */
    call(): Promise<Result<S, E>> {
        return this.client.executeCall(this as unknown as RSubRequest<any>);
    }

    /** Calls a remote route with linkedFns and returns a fully-typed 4-tuple result */
    callWithLinkedFns<H extends Record<string, HSubRequest<any>>>(linkedFns: H): Promise<CallWithLinkedFnsResult<S, E, H>> {
        if (Object.keys(linkedFns).length === 0) {
            throw new Error(
                'callWithLinkedFns requires at least one linkedFn. Use call() instead for requests without linkedFns.'
            );
        }
        return this.client.executeCallWithLinkedFns(this as RSubRequest<any>, linkedFns) as Promise<
            CallWithLinkedFnsResult<S, E, H>
        >;
    }

    /** Calls this route as part of a routesFlow with other routes in a single HTTP request */
    async callWithWorkflow<OtherRoutes extends RSubRequest<any>[], H extends Record<string, HSubRequest<any>>>(
        otherRoutes: [...OtherRoutes],
        linkedFns?: H
    ): Promise<WorkflowResult<[RSubRequest<any>, ...OtherRoutes], H>> {
        const allRoutes = [this as unknown as RSubRequest<any>, ...otherRoutes];
        const [results, errors, linkedFnResults, linkedFnErrors] = await this.client.executeCallWithWorkflow(
            allRoutes,
            linkedFns ?? ({} as H)
        );
        const emptyResults = allRoutes.map(() => undefined);
        const emptyErrors = allRoutes.map(() => undefined);
        return [results ?? emptyResults, errors ?? emptyErrors, linkedFnResults, linkedFnErrors] as WorkflowResult<
            [RSubRequest<any>, ...OtherRoutes],
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
