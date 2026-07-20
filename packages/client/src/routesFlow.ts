/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionjs/core';
import {mionPureFnId} from '@mionjs/run-types';
import type {PureFunction, InjectPureFnHash} from '@mionjs/run-types';
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
 * TWO call shapes; either way the wire carries only `bodyHash` (a ts-runtypes registry
 * key) and the mapper EXECUTES ON THE SERVER — the server only runs functions its own
 * build baked in, never code received over the wire:
 * - INLINE (vite builds): `serverMapFrom(order, (o) => o.userId)`. The mion vite plugin
 *   extracts the mapper at build time (ts-runtypes PureFunction/InjectPureFnHash
 *   markers), content-hashes it (`bodyHash = 'rt::<hash>'`) and ships the body to the
 *   server bundle through the server-mappers manifest (see mionVitePlugin serverMappers).
 * - BY NAME (non-vite / CDN clients): `serverMapFrom(order, 'toUserId')` references a
 *   mapper registered on the server with registerMionPureFn ('mionjs::<name>').
 */
export function serverMapFrom<FromSR extends SubRequest<any>, MappedInput = any>(
    source: FromSR,
    fnName: string
): MapFromServerFnRef<(value: FromSR['resolvedValue']) => MappedInput>;
export function serverMapFrom<FromSR extends SubRequest<any>, MappedInput = any>(
    source: FromSR,
    mapper: PureFunction<(value: FromSR['resolvedValue']) => MappedInput>,
    hash?: InjectPureFnHash<(value: FromSR['resolvedValue']) => MappedInput>
): MapFromServerFnRef<(value: FromSR['resolvedValue']) => MappedInput>;
export function serverMapFrom<FromSR extends SubRequest<any>, MappedInput = any>(
    source: FromSR,
    mapperOrName: unknown,
    hash?: string
): MapFromServerFnRef<(value: FromSR['resolvedValue']) => MappedInput> {
    const isNameLane = typeof mapperOrName === 'string';
    if (isNameLane && !mapperOrName)
        throw new Error('serverMapFrom() requires a mapper function or the name of a server-registered mion pure fn');
    if (!isNameLane && !hash)
        throw new Error(
            'serverMapFrom() with an inline mapper requires the mion vite plugin (no pure-fn hash was injected at build time). ' +
                'For non-vite clients pass the name of a server-registered mion pure fn instead.'
        );
    // Legacy pre-migration shape serverMapFrom(src, mapper, 'name') still typechecks (the 3rd
    // param is string-typed) but the plugin never overrides an explicit 3rd arg — reject it
    // loudly instead of sending a key no server resolves.
    if (!isNameLane && !(hash as string).includes('::'))
        throw new Error(
            `serverMapFrom() got a plain name ('${hash}') in the 3rd argument — that legacy call shape was removed. ` +
                `Pass the name as the 2nd argument instead: serverMapFrom(source, '${hash}').`
        );
    // full registry key: 'mionjs::<name>' (name lane) | injected 'rt::<hash>' (inline lane)
    const bodyHash = isNameLane ? mionPureFnId(mapperOrName as string) : (hash as string);
    const sep = bodyHash.indexOf('::');
    const ref = {
        mapFromSymbol,
        namespace: bodyHash.slice(0, sep),
        fnName: bodyHash.slice(sep + 2),
        bodyHash,
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
