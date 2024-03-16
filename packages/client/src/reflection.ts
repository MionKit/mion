/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {PublicProcedure, PublicResponses} from '@mionkit/router';
import type {CompiledFunctions, JSONValue} from '@mionkit/runtype';
import {RpcError, StatusCodes, isRpcError} from '@mionkit/core';
import {RequestErrors, SubRequest, ValidationRequest} from './types';

// ############# VALIDATION SERIALIZATION #############

/**
 * Validate subRequests locally using existing RemoteApi metadata.
 * If there are errors subRequest is marked as resolved and error is added to the errors  are added as subRequest responses.
 */
export function validateSubRequests(
    subRequestIds: string[],
    req: ValidationRequest,
    errors: RequestErrors,
    validateRouteHooks = true
): void {
    if (!req.options.useValidation) return;
    subRequestIds.forEach((id) => {
        validateSubRequest(id, req, errors);
        const methodMeta = req.metadataById.get(id);
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
export function validateSubRequest(id: string, req: ValidationRequest, errors: RequestErrors): void {
    if (!req.options.useSerialization) return;
    // subRequest might be undefined if does not require to send parameters or are optional
    const {methodMeta, subRequest} = getSerializationRequiredData(id, req);
    if (subRequest?.error || subRequest?.isResolved) return;

    const params = subRequest?.params || [];
    const validationResponse = validateParameters(params, methodMeta, req.jitFunctionsById.get(id)?.params);
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

/** Serialize subRequests. If there are any errors subRequests are marked as resolved. */
export function serializeSubRequests(subRequestIds: string[], req: ValidationRequest, errors: RequestErrors): void {
    if (!req.options.useSerialization) return;
    subRequestIds.forEach((id) => {
        serializeSubRequest(id, req, errors);
        const methodMeta = req.metadataById.get(id);
        if (methodMeta?.hookIds?.length) serializeSubRequests(methodMeta.hookIds, req, errors);
    });
    return;
}

/** Serialize a single subRequest. If there are is an error subRequest is marked as resolved. */
export function serializeSubRequest(id: string, req: ValidationRequest, errors: RequestErrors): void {
    if (!req.options.useSerialization) return;
    const {methodMeta, subRequest} = getSerializationRequiredData(id, req);
    // at this point subRequest might been validated so if not defined then is not required
    if (!subRequest) return;
    if (subRequest.serializedParams) return;

    const params = subRequest?.params || [];
    const serializedParams = serializeParameters(params, methodMeta, req.jitFunctionsById.get(id)?.params);
    if (isRpcError(serializedParams)) {
        errors.set(id, serializedParams);
        // if errors then mark subRequest as resolved
        subRequest.error = serializedParams;
        subRequest.isResolved = true;
    } else {
        subRequest.serializedParams = serializedParams;
    }
    return;
}

// if there is any error it will be inserted in the body as a route return error
export function deserializeResponseBody(responseBody: PublicResponses, req: ValidationRequest): PublicResponses {
    const deSerializedBody = responseBody;
    Object.entries(deSerializedBody).forEach(([key, remoteHandlerResponse]) => {
        const methodMeta = req.metadataById.get(key);
        if (!methodMeta) throw new Error(`Metadata for remote method ${key} not found.`);
        const deSerialized = deSerializeReturn(
            remoteHandlerResponse,
            methodMeta,
            req.jitFunctionsById.get(methodMeta.id)?.return
        );
        deSerializedBody[key] = deSerialized;
    });
    return deSerializedBody;
}

// ############# PRIVATE METHODS #############

function getSerializationRequiredData(
    id: string,
    req: ValidationRequest
): {methodMeta: PublicProcedure; subRequest?: SubRequest<any>} {
    const methodMeta = req.metadataById.get(id);
    const subRequest = req.subRequests[id];
    if (!methodMeta) throw new Error(`Metadata for remote method ${id} not found.`);
    return {methodMeta, subRequest};
}

function serializeParameters(params: any[], method: PublicProcedure, paramsJit?: CompiledFunctions): any[] | RpcError {
    if (!paramsJit) return params;
    if (params.length && method.useSerialization) {
        try {
            params = paramsJit.jsonEncode.fn(params) as JSONValue[];
        } catch (e: any | Error) {
            return new RpcError({
                statusCode: StatusCodes.BAD_REQUEST,
                name: 'Serialization Error',
                message: `Invalid params for Route or Hook '${method.id}', can not serialize params: ${e.message} `,
                errorData: {deserializeError: e.message},
            });
        }
    }
    return params;
}

function validateParameters(params: any[], method: PublicProcedure, paramsJit?: CompiledFunctions): void | RpcError {
    if (!paramsJit || !method.useValidation) return;
    try {
        const validationsResponse = paramsJit.typeErrors.fn(params);
        if (validationsResponse.length) {
            return new RpcError({
                statusCode: StatusCodes.BAD_REQUEST,
                name: 'Validation Error',
                message: `Invalid params for Route or Hook '${method.id}', validation failed.`,
                errorData: validationsResponse,
            });
        }
    } catch (e: any | Error) {
        return new RpcError({
            statusCode: StatusCodes.BAD_REQUEST,
            name: 'Validation Error',
            message: `Could not validate params for Route or Hook '${method.id}': ${e.message} `,
        });
    }
}

function deSerializeReturn(response: any | RpcError, method: PublicProcedure, returnJit?: CompiledFunctions): any | RpcError {
    if (!returnJit || !method.useSerialization || !response) return response;
    try {
        if (response instanceof RpcError) return response;
        if (isRpcError(response)) return new RpcError(response);
        const ret = returnJit.jsonDecode.fn(response);
        return ret;
    } catch (e: any) {
        return new RpcError({
            statusCode: StatusCodes.BAD_REQUEST,
            name: 'Serialization Error',
            message: `Invalid response from Route or Hook '${method.id}', can not deserialize return value: ${e.message}`,
            errorData: e?.errors,
        });
    }
}
