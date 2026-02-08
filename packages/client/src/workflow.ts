/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionkit/core';
import type {HSubRequest, RSubRequest, WorkflowResult} from './types';
import type {MionSubRequest} from './subRequest';

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
    const linkedFnSubRequests: HSubRequest<any>[] = linkedFns ? Object.values(linkedFns) : [];

    return client.executeCallWithWorkflow(
        routeSubRequests as any,
        (linkedFns ?? {}) as any,
        linkedFnSubRequests
    ) as unknown as Promise<WorkflowResult<Routes, LinkedFns>>;
}
