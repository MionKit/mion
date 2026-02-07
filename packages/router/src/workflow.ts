/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {RawRequestBody} from './types/context';
import type {MethodsExecutionList} from './types/remoteMethods';
import type {RemoteMethod} from './types/remoteMethods';
import {MION_ROUTES, StatusCodes, HandlerType, SerializerModes} from '@mionkit/core';
import {RpcError} from '@mionkit/core';
import {getRouteExecutionChain, startLinkedFns, endLinkedFns} from './router';

// ############# PUBLIC METHODS #############

/** Pre-parses the raw body to extract the workflow route list from the `mion@workflow` property */
export function extractWorkflowRoutes(rawBody: RawRequestBody): string[] | null {
    if (!rawBody) return null;

    let parsed: any;
    if (typeof rawBody === 'string') {
        try {
            parsed = JSON.parse(rawBody);
        } catch {
            return null;
        }
    } else if (typeof rawBody === 'object' && !(rawBody instanceof Uint8Array) && !(rawBody instanceof ArrayBuffer)) {
        // Pre-parsed object (e.g. from Google Cloud Functions)
        parsed = rawBody;
    } else {
        // Binary bodies are not supported for workflows
        return null;
    }

    const workflowKey = MION_ROUTES.workflowMiddy;
    if (!parsed || typeof parsed !== 'object' || !(workflowKey in parsed)) return null;

    const routeIds = parsed[workflowKey];
    if (!Array.isArray(routeIds)) {
        throw new RpcError({
            statusCode: StatusCodes.UNEXPECTED_ERROR,
            type: 'invalid-workflow-request',
            publicMessage: `Invalid workflow request: '${workflowKey}' must be an array of route paths.`,
        });
    }
    if (routeIds.length === 0) {
        throw new RpcError({
            statusCode: StatusCodes.UNEXPECTED_ERROR,
            type: 'invalid-workflow-request',
            publicMessage: `Invalid workflow request: '${workflowKey}' must contain at least one route path.`,
        });
    }
    for (const id of routeIds) {
        if (typeof id !== 'string') {
            throw new RpcError({
                statusCode: StatusCodes.UNEXPECTED_ERROR,
                type: 'invalid-workflow-request',
                publicMessage: `Invalid workflow request: all entries in '${workflowKey}' must be strings.`,
            });
        }
    }
    return routeIds;
}

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
    };
}
