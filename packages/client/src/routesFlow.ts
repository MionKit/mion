/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionjs/core';
import {MION_PURE_FN_NAMESPACE} from '@mionjs/run-types';
import type {MiddlewareSubRequest, RouteSubRequest, RoutesFlowBuilder, SubRequest} from './types.ts';
import type {MionSubRequest} from './subRequest.ts';
import {MapFromServerFnRef} from '@mionjs/core';

/** Creates a RoutesFlowBuilder for deferred execution of multiple routes in a single HTTP request */
export function routesFlow<Routes extends RouteSubRequest<any>[]>(routeSubRequests: [...Routes]): RoutesFlowBuilder<Routes> {
    if (!routeSubRequests || routeSubRequests.length === 0) {
        throw new RpcError({
            type: 'routesFlow-empty-routes',
            publicMessage: 'RoutesFlow requires at least one route subrequest.',
        });
    }

    const firstSubRequest = routeSubRequests[0] as MionSubRequest;
    if (!firstSubRequest.client) {
        throw new RpcError({
            type: 'routesFlow-missing-client',
            publicMessage: 'Could not extract MionClient from subrequest. Ensure subrequests are created via routes proxy.',
        });
    }

    const client = firstSubRequest.client;

    // Validate all subrequests use the same client instance
    for (let i = 1; i < routeSubRequests.length; i++) {
        const subRequest = routeSubRequests[i] as MionSubRequest;
        if (subRequest.client !== client) {
            throw new RpcError({
                type: 'routesFlow-client-mismatch',
                publicMessage: `All subrequests in a routesFlow must use the same client instance. Subrequest at index ${i} has a different client.`,
            });
        }
    }

    return {
        async call(setup?: {middleFns?: Record<string, MiddlewareSubRequest<any>>; signal?: AbortSignal; timeout?: number}) {
            const middleFns = setup?.middleFns ?? {};
            const [results, errors, middleFnResults, middleFnErrors] = await client.execute(
                undefined,
                routeSubRequests as any,
                middleFns as any,
                setup?.signal,
                setup?.timeout
            );
            const emptyResults = routeSubRequests.map(() => undefined);
            const emptyErrors = routeSubRequests.map(() => undefined);
            return [results ?? emptyResults, errors ?? emptyErrors, middleFnResults, middleFnErrors] as any;
        },
    };
}

const mapFromSymbol = Symbol('MapFromServerFnRef');

/**
 * Maps the output of one route SubRequest to the input of another within a routesFlow.
 *
 * ts-runtypes migration: the mapper is referenced BY NAME — it must be registered on the
 * SERVER with registerMionPureFn(fnName, factory) (ts-runtypes registry, 'mionjs'
 * namespace). The old implicit build-time body extraction is gone: mappers are shared,
 * explicitly registered server code, and the wire only carries the name.
 */
export function serverMapFrom<FromSR extends SubRequest<any>, MappedInput = any>(
    source: FromSR,
    fnName: string
): MapFromServerFnRef<(value: FromSR['resolvedValue']) => MappedInput> {
    if (!fnName) throw new Error('serverMapFrom() requires the name of a server-registered mion pure fn');
    const ref = {
        mapFromSymbol,
        namespace: MION_PURE_FN_NAMESPACE,
        fnName,
        bodyHash: fnName,
        isFactory: false,
        fromRequestId: source.id,
        toRequestId: '',
        paramIndex: -1, // set by MionSubRequest constructor when passed as a parameter
        asArg() {
            return ref as unknown as MappedInput;
        },
    } as unknown as MapFromServerFnRef<(value: FromSR['resolvedValue']) => MappedInput>;
    return ref;
}

export function isServerMapFromRef(ref: any): ref is MapFromServerFnRef<any> {
    return ref && ref.mapFromSymbol === mapFromSymbol;
}
