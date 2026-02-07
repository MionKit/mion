/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Routes} from '../types/general';
import type {CallContext} from '../types/context';
import {RpcError, MION_ROUTES, StatusCodes, HandlerType, SerializerModes} from '@mionkit/core';
import {linkedFn, route} from '../lib/handlers';
import {MethodsExecutionList, RemoteMethod} from '../types/remoteMethods';
import {endLinkedFns, getRouteExecutionChain, startLinkedFns} from '../router';

/** Builds a merged execution chain from multiple route paths, deduplicating linkedFns by ID */
export function buildWorkflowExecutionChain(routePaths: string[]): MethodsExecutionList {
    const seenLinkedFnIds = new Set<string>();
    const mergedMiddle: RemoteMethod[] = [];
    const startLen = startLinkedFns.length;
    const endLen = endLinkedFns.length;

    // Mark start/end linkedFn IDs as seen so they are not duplicated in the middle
    for (const fn of startLinkedFns) seenLinkedFnIds.add(fn.id);
    for (const fn of endLinkedFns) seenLinkedFnIds.add(fn.id);

    for (const routePath of routePaths) {
        const chain = getRouteExecutionChain(routePath);
        if (!chain) {
            throw new RpcError({
                statusCode: StatusCodes.NOT_FOUND,
                type: 'workflow-route-not-found',
                publicMessage: `Workflow route not found: '${routePath}'.`,
            });
        }

        // Extract middle portion (skip start/end linkedFns)
        const methods = chain.methods;
        const middleStart = startLen;
        const middleEnd = methods.length - endLen;

        for (let i = middleStart; i < middleEnd; i++) {
            const method = methods[i];
            if (method.type === HandlerType.route) {
                // Routes are never deduplicated — each route in the workflow must execute
                mergedMiddle.push(method);
            } else if (!seenLinkedFnIds.has(method.id)) {
                seenLinkedFnIds.add(method.id);
                mergedMiddle.push(method);
            }
        }
    }

    const mergedMethods: RemoteMethod[] = [...startLinkedFns, ...mergedMiddle, ...endLinkedFns];

    return {
        routeIndex: -1, // Not applicable for workflow chains (multiple routes)
        methods: mergedMethods,
        serializer: SerializerModes.stringifyJson, // Workflows only support JSON for now
    } satisfies MethodsExecutionList;
}

export const mionWorkflowRoutes = {
    /** Modifies the execution chain to run all  */
    [MION_ROUTES.workflowRoute]: route((ctx: CallContext, routeIds: string[]): void => {
        // does nothing we just need the route to be registered, so it can be found by the router
    }),
} as const satisfies Routes;
