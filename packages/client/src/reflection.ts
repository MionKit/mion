/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {RemoteMethod, ResolvedPublicResponses} from '@mionkit/router';
import {FunctionReflection, ParamsValidationResponse} from '@mionkit/runtype';
import {PublicError, StatusCodes, isPublicError} from '@mionkit/core';
import {SubRequestErrors, SubRequest, ValidationRequest} from './types';

// ############# VALIDATION SERIALIZATION #############

/**
 * Validate subRequests locally using existing RemoteMethods metadata.
 * If there are errors subRequest is marked as resolved and error is added to the errors  are added as subRequest responses.
 */
export function validateSubRequests(
    subRequestIds: string[],
    req: ValidationRequest,
    errors: SubRequestErrors = new Map(),
    validateRouteHooks = true
): SubRequestErrors {
    if (!req.options.enableValidation) return errors;
    subRequestIds.forEach((id) => {
        validateSubRequest(id, req, errors);
        const remoteMethod = req.remoteMethodsById.get(id);
        if (validateRouteHooks && remoteMethod?.hookIds?.length) {
            validateSubRequests(remoteMethod.hookIds, req, errors, validateRouteHooks);
        }
    });
    return errors;
}

/**
 * Validate subRequest locally using existing RemoteMethods metadata.
 * If there is an error then subRequest is marked as resolved and error is added as subRequest response.
 */
export function validateSubRequest(id: string, req: ValidationRequest, errors: SubRequestErrors = new Map()): SubRequestErrors {
    if (!req.options.enableSerialization) return errors;
    // subRequest might be undefined if does not require to send parameters or are optional
    const {remoteMethod, subRequest} = getSerializationRequiredData(id, req);
    if (subRequest?.validationResponse || subRequest?.isResolved) return errors;

    const params = subRequest?.params || [];
    const validationResponse = validateParameters(params, remoteMethod, req.reflectionById.get(id));
    if (!validationResponse) return errors; // if validation is void then validation is disabled for this method
    if (isPublicError(validationResponse)) {
        const error = validationResponse;
        errors.set(id, error);
        // if errors then mark subRequest as resolved
        if (subRequest) {
            subRequest.error = error;
            subRequest.isResolved = true;
            subRequest.validationResponse = validationResponse.errorData as ParamsValidationResponse;
        }
    } else if (subRequest) {
        subRequest.validationResponse = validationResponse;
    }
    return errors;
}

/** Serialize subRequests. If there are any errors subRequests are marked as resolved. */
export function serializeSubRequests(
    subRequestIds: string[],
    req: ValidationRequest,
    errors: SubRequestErrors = new Map()
): SubRequestErrors {
    if (!req.options.enableSerialization) return errors;
    subRequestIds.forEach((id) => {
        serializeSubRequest(id, req, errors);
        const remoteMethod = req.remoteMethodsById.get(id);
        if (remoteMethod?.hookIds?.length) serializeSubRequests(remoteMethod.hookIds, req, errors);
    });
    return errors;
}

/** Serialize a single subRequest. If there are is an error subRequest is marked as resolved. */
export function serializeSubRequest(id: string, req: ValidationRequest, errors: SubRequestErrors = new Map()): SubRequestErrors {
    if (!req.options.enableSerialization) return errors;
    const {remoteMethod, subRequest} = getSerializationRequiredData(id, req);
    // at this point subRequest might been validated so if not defined then is not required
    if (!subRequest) return errors;
    if (subRequest.serializedParams) return errors;

    const params = subRequest?.params || [];
    const serializedParams = serializeParameters(params, remoteMethod, req.reflectionById.get(id));
    if (isPublicError(serializedParams)) {
        errors.set(id, serializedParams);
        // if errors then mark subRequest as resolved
        subRequest.error = serializedParams;
        subRequest.isResolved = true;
    } else {
        subRequest.serializedParams = serializedParams;
    }
    return errors;
}

export function deserializeResponseBody(responseBody: ResolvedPublicResponses, req: ValidationRequest): ResolvedPublicResponses {
    const deSerializedBody = responseBody;
    Object.entries(deSerializedBody).forEach(([key, remoteHandlerResponse]) => {
        const remoteMethod = req.remoteMethodsById.get(key);
        if (!remoteMethod) throw new Error(`Metadata for remote method ${key} not found.`);
        const deSerialized = deSerializeReturn(remoteHandlerResponse, remoteMethod, req.reflectionById.get(remoteMethod.id));
        deSerializedBody[key] = deSerialized;
    });
    return deSerializedBody;
}

// ############# PRIVATE METHODS #############

function getSerializationRequiredData(
    id: string,
    req: ValidationRequest
): {remoteMethod: RemoteMethod; subRequest?: SubRequest<any>} {
    const remoteMethod = req.remoteMethodsById.get(id);
    const subRequest = req.subRequests[id];
    if (!remoteMethod) throw new Error(`Metadata for remote method ${id} not found.`);
    return {remoteMethod, subRequest};
}

function serializeParameters(params: any[], method: RemoteMethod, reflection?: FunctionReflection): any[] | PublicError {
    if (!reflection) return params;
    if (params.length && method.enableSerialization) {
        try {
            params = reflection.serializeParams(params);
        } catch (e: any | Error) {
            return new PublicError({
                statusCode: StatusCodes.BAD_REQUEST,
                name: 'Serialization Error',
                message: `Invalid params for Route or Hook '${method.id}', can not serialize params: ${e.message} `,
                errorData: e?.errors,
            });
        }
    }
    return params;
}

function validateParameters(
    params: any[],
    method: RemoteMethod,
    reflection?: FunctionReflection
): void | ParamsValidationResponse | PublicError {
    if (!reflection || !method.enableValidation) return;
    try {
        const validationsResponse = reflection.validateParams(params);
        if (validationsResponse.hasErrors) {
            return new PublicError({
                statusCode: StatusCodes.BAD_REQUEST,
                name: 'Validation Error',
                message: `Invalid params for Route or Hook '${method.id}', validation failed.`,
                errorData: validationsResponse,
            });
        }
        return validationsResponse;
    } catch (e: any | Error) {
        return new PublicError({
            statusCode: StatusCodes.BAD_REQUEST,
            name: 'Validation Error',
            message: `Could not validate params for Route or Hook '${method.id}': ${e.message} `,
        });
    }
}

function deSerializeReturn(
    remoteHandlerResponse: any | PublicError,
    method: RemoteMethod,
    reflection?: FunctionReflection
): any | PublicError {
    if (!reflection || !method.enableSerialization || !remoteHandlerResponse) return remoteHandlerResponse;
    try {
        const ret = reflection.deserializeReturn(remoteHandlerResponse);
        if (isPublicError(ret) && !(ret instanceof PublicError)) return new PublicError(ret);
        return ret;
    } catch (e: any) {
        return new PublicError({
            statusCode: StatusCodes.BAD_REQUEST,
            name: 'Serialization Error',
            message: `Invalid response from Route or Hook '${method.id}', can not deserialize return value: ${e.message}`,
            errorData: e?.errors,
        });
    }
}
