/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError, routesCache} from '@mionkit/core';
import {RequestErrors, SubRequest} from './types';
import type {MionClientRequest} from './request';

/** Validate subRequests locally using existing RemoteApi metadata */
export function validateSubRequests(
    subRequestIds: string[],
    req: MionClientRequest<any, any>,
    errors: RequestErrors,
    validateRouteLinkedFns = true
): void {
    if (!req.options.validateParams) return;
    subRequestIds.forEach((id) => {
        const subRequest = req.subRequestList[id];
        validateSubRequest(id, subRequest, errors);
        const methodMeta = routesCache.getMetadata(id);
        if (validateRouteLinkedFns && methodMeta?.linkedFnIds?.length) {
            const validLinkedFnIds = methodMeta.linkedFnIds.filter((linkedFnId) => linkedFnId != null);
            validateSubRequests(validLinkedFnIds, req, errors, validateRouteLinkedFns);
        }
    });
    return;
}

/** Validate subRequest locally using existing RemoteApi metadata */
export function validateSubRequest(id: string, subRequest: SubRequest<any>, errors: RequestErrors): void {
    if (subRequest?.error || subRequest?.isResolved) return;

    const params = subRequest?.params || [];
    const validationResponse = getTypeErrors(id, params);
    if (!validationResponse) return;
    const error = validationResponse;
    errors.set(id, error);
    if (subRequest) {
        subRequest.error = error;
        subRequest.isResolved = true;
    }
    return;
}

function getTypeErrors(id: string, params: any[]): void | RpcError<'validation-error' | 'unexpected-validation-error'> {
    const method = routesCache.useMethodJitFns(id);
    if (!method.paramNames || method.paramNames.length === 0) return;
    const paramsJit = method.paramsJitFns;
    if (paramsJit.typeErrors.isNoop) return;
    try {
        const validationsResponse = paramsJit.isType.fn(params) || paramsJit.typeErrors.fn(params);
        if ((validationsResponse as [])?.length) {
            return new RpcError({
                type: 'validation-error',
                publicMessage: `Invalid params for Route or LinkedFn '${method.id}', validation failed.`,
                errorData: validationsResponse,
            });
        }
    } catch (e: any | Error) {
        return new RpcError({
            type: 'unexpected-validation-error',
            publicMessage: `Could not validate params for Route or LinkedFn '${method.id}': ${e.message} `,
        });
    }
}
