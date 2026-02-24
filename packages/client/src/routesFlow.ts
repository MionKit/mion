/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {PURE_SERVER_FN_NAMESPACE, RpcError} from '@mionkit/core';
import type {HSubRequest, RSubRequest, SubRequest, WorkflowResult} from './types.ts';
import type {MionSubRequest} from './subRequest.ts';
import {MapFromServerFnRef} from '@mionkit/core/src/types/pureFunctions.types.ts';

/** Creates and executes a routesFlow request with multiple routes */
export async function routesFlow<
    Routes extends RSubRequest<any>[],
    LinkedFns extends Record<string, HSubRequest<any>> = Record<string, never>,
>(routeSubRequests: [...Routes], linkedFns?: LinkedFns): Promise<WorkflowResult<Routes, LinkedFns>> {
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

    const [results, errors, linkedFnResults, linkedFnErrors] = await client.executeCallWithWorkflow(
        routeSubRequests as any,
        (linkedFns ?? {}) as any
    );
    const emptyResults = routeSubRequests.map(() => undefined);
    const emptyErrors = routeSubRequests.map(() => undefined);
    return [results ?? emptyResults, errors ?? emptyErrors, linkedFnResults, linkedFnErrors] as WorkflowResult<Routes, LinkedFns>;
}

export const mapFromSymbol = Symbol('MapFromServerFnRef');

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  WARNING: This function's call signature is parsed by the mion vite plugin  ║
// ║  at build time (see devtools/src/vite-plugin/extractPureFn.ts).             ║
// ║  Do NOT rename, change the parameter order, or modify the function          ║
// ║  signature without updating the corresponding AST extraction and            ║
// ║  transformer logic in @mionkit/devtools.                                    ║
// ╚══════════════════════════════════════════════════════════════════════════════╝
/**
 * Maps the output of one route SubRequest to the input of another within a routesFlow.
 * The mapper function must be pure (same rules as pureServerFn).
 * The bodyHash is injected at build time by the mion vite plugin.
 */

export function mapFrom<FromSR extends SubRequest<any>, MappedInput>(
    source: FromSR,
    mapper: (value: FromSR['resolvedValue']) => MappedInput,
    bodyHash?: string // injected by mion vite plugin
): MapFromServerFnRef<(value: FromSR['resolvedValue']) => MappedInput> {
    // Important: bodyHash is injected at build time by mion vite plugin
    if (!bodyHash) throw new Error('mapFrom() requires mion vite plugin transform to inject bodyHash');
    const ref: MapFromServerFnRef<(value: FromSR['resolvedValue']) => MappedInput> = {
        mapFromSymbol,
        namespace: PURE_SERVER_FN_NAMESPACE,
        fnName: bodyHash,
        bodyHash,
        pureFn: mapper,
        isFactory: false,
        fromRequestId: source.id,
        toRequestId: '',
        fake() {
            return ref as unknown as MappedInput;
        },
    };
    return ref;
}
