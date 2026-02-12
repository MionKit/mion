/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionkit/core';
import type {HSubRequest, RSubRequest, WorkflowResult} from './types.ts';
import type {MionSubRequest} from './subRequest.ts';

/** Creates and executes a workflow request with multiple routes */
export async function workflow<
    Routes extends RSubRequest<any>[],
    LinkedFns extends Record<string, HSubRequest<any>> = Record<string, never>,
>(routeSubRequests: [...Routes], linkedFns?: LinkedFns): Promise<WorkflowResult<Routes, LinkedFns>> {
    if (!routeSubRequests || routeSubRequests.length === 0) {
        throw new RpcError({
            type: 'workflow-empty-routes',
            publicMessage: 'Workflow requires at least one route subrequest.',
        });
    }

    const firstSubRequest = routeSubRequests[0] as MionSubRequest;
    if (!firstSubRequest.client) {
        throw new RpcError({
            type: 'workflow-missing-client',
            publicMessage: 'Could not extract MionClient from subrequest. Ensure subrequests are created via routes proxy.',
        });
    }

    const client = firstSubRequest.client;

    // Validate all subrequests use the same client instance
    for (let i = 1; i < routeSubRequests.length; i++) {
        const subRequest = routeSubRequests[i] as MionSubRequest;
        if (subRequest.client !== client) {
            throw new RpcError({
                type: 'workflow-client-mismatch',
                publicMessage: `All subrequests in a workflow must use the same client instance. Subrequest at index ${i} has a different client.`,
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
