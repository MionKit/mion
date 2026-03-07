/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError, routesCache} from '@mionjs/core';
import {RequestErrors, SubRequest} from './types.ts';
import type {MionClientRequest} from './request.ts';

/** Validate subRequests locally using existing RemoteApi metadata */
export function validateSubRequests(
    subRequestIds: string[],
    req: MionClientRequest<any, any>,
    errors: RequestErrors,
    validateRouteMiddleFns = true
): void {
    if (!req.options.validateParams) return;
    subRequestIds.forEach((id) => {
        const subRequest = req.subRequestList[id];
        validateSubRequest(id, subRequest, errors);
        const methodMeta = routesCache.getMetadata(id);
        if (validateRouteMiddleFns && methodMeta?.middleFnIds?.length) {
            const validMiddleFnIds = methodMeta.middleFnIds.filter((middleFnId) => middleFnId != null);
            validateSubRequests(validMiddleFnIds, req, errors, validateRouteMiddleFns);
        }
    });
    return;
}

/** Validate subRequest locally using existing RemoteApi metadata */
export function validateSubRequest(id: string, subRequest: SubRequest<any>, errors: RequestErrors): void {
    if (subRequest?.error || subRequest?.isResolved) return;
    // Skip validation for subrequests with mapFrom mappings — params contain null placeholders
    // that will be filled by the server's mapping step after the source route executes
    const mappings = (subRequest as any)?.mappings;
    if (Array.isArray(mappings) && mappings.length > 0) return;

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
                publicMessage: `Invalid params for Route or MiddleFn '${method.id}', validation failed.`,
                errorData: validationsResponse,
            });
        }
    } catch (e: any | Error) {
        return new RpcError({
            type: 'unexpected-validation-error',
            publicMessage: `Could not validate params for Route or MiddleFn '${method.id}': ${e.message} `,
        });
    }
}
