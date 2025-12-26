/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError, routesCache} from '@mionkit/core';
import {RequestErrors, SubRequest} from './types';
import type {MionRequest} from './request';

// ############# VALIDATION #############

/**
 * Validate subRequests locally using existing RemoteApi metadata.
 * If there are errors subRequest is marked as resolved and error is added to the errors  are added as subRequest responses.
 */
export function validateSubRequests(
    subRequestIds: string[],
    req: MionRequest<any, any>,
    errors: RequestErrors,
    validateRouteHooks = true
): void {
    if (!req.options.validateParams) return;
    subRequestIds.forEach((id) => {
        const subRequest = req.subRequestList[id];
        validateSubRequest(id, subRequest, errors);
        const methodMeta = routesCache.getMetadata(id);
        if (validateRouteHooks && methodMeta?.hookIds?.length) {
            validateSubRequests(methodMeta.hookIds, req, errors, validateRouteHooks);
        }
    });
    return;
}

/**
 * Validate subRequest locally using existing RemoteApi metadata.
 * If there is an error then subRequest is marked as resolved and error is added as subRequest response.
 */
export function validateSubRequest(id: string, subRequest: SubRequest<any>, errors: RequestErrors): void {
    // subRequest might be undefined if does not require to send parameters or are optional
    if (subRequest?.error || subRequest?.isResolved) return;

    const params = subRequest?.params || [];
    const validationResponse = getTypeErrors(id, params);
    if (!validationResponse) return; // if validation is void then validation is disabled for this method
    const error = validationResponse;
    errors.set(id, error);
    // if errors then mark subRequest as resolved
    if (subRequest) {
        subRequest.error = error;
        subRequest.isResolved = true;
    }
    return;
}

// ############# PRIVATE METHODS #############

function getTypeErrors(id: string, params: any[]): void | RpcError<'validation-error' | 'unexpected-validation-error'> {
    const method = routesCache.useMethodJitFns(id);
    const paramsJit = method.paramsJitFns;
    if (paramsJit.typeErrors.isNoop) return;
    try {
        const validationsResponse = paramsJit.isType.fn(params) || paramsJit.typeErrors.fn(params);
        if ((validationsResponse as [])?.length) {
            return new RpcError({
                type: 'validation-error',
                publicMessage: `Invalid params for Route or Hook '${method.id}', validation failed.`,
                errorData: validationsResponse,
            });
        }
    } catch (e: any | Error) {
        return new RpcError({
            type: 'unexpected-validation-error',
            publicMessage: `Could not validate params for Route or Hook '${method.id}': ${e.message} `,
        });
    }
}
