/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionkit/core';
import type {HSubRequest, RSubRequest, WorkflowResult} from './types';
import type {MionSubRequest} from './subRequest';

/**
 * Creates and executes a workflow request with multiple routes.
 * Workflows allow calling multiple routes in a single HTTP request with shared context.
 *
 * @example
 * ```ts
 * const [results, errors, linkedFnResults, linkedFnErrors] = await workflow([
 *   routes.users.getUser({id: '1'}),
 *   routes.posts.getPosts({userId: '1'}),
 * ]);
 * const [user, posts] = results ?? [];
 * ```
 */
export async function workflow<
    Routes extends RSubRequest<any>[],
    LinkedFns extends Record<string, HSubRequest<any>> = Record<string, never>,
>(routeSubRequests: [...Routes], linkedFns?: LinkedFns): Promise<WorkflowResult<Routes, LinkedFns>> {
    // Validate input
    if (!routeSubRequests || routeSubRequests.length === 0) {
        throw new RpcError({
            type: 'workflow-empty-routes',
            publicMessage: 'Workflow requires at least one route subrequest.',
        });
    }

    // Extract client from first subrequest
    const firstSubRequest = routeSubRequests[0] as MionSubRequest;
    if (!firstSubRequest.client) {
        throw new RpcError({
            type: 'workflow-missing-client',
            publicMessage: 'Could not extract MionClient from subrequest. Ensure subrequests are created via routes proxy.',
        });
    }

    const client = firstSubRequest.client;

    // Collect linkedFn subrequests from the record
    const linkedFnSubRequests: HSubRequest<any>[] = linkedFns ? Object.values(linkedFns) : [];

    // Execute the workflow via client - cast to avoid deep type instantiation
    return client.executeCallWithWorkflow(
        routeSubRequests as any,
        (linkedFns ?? {}) as any,
        linkedFnSubRequests
    ) as unknown as Promise<WorkflowResult<Routes, LinkedFns>>;
}
