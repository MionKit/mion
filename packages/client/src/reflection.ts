/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {PublicResponses} from '@mionkit/router';
import type {JitCompiledFunctions, JSONValue, SerializablePublicMethod} from '@mionkit/core';
import {RpcError, isRpcError, jitUtils, routerUtils} from '@mionkit/core';
import {StatusCodes} from '@mionkit/core';
import {RequestErrors, SubRequest} from './types';
import type {MionRequest} from './request';

// ############# VALIDATION SERIALIZATION #############

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
        validateSubRequest(id, req, errors);
        const methodMeta = routerUtils.getMetadata(id);
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
export function validateSubRequest(id: string, req: MionRequest<any, any>, errors: RequestErrors): void {
    // subRequest might be undefined if does not require to send parameters or are optional
    const {methodMeta, subRequest} = getSerializationRequiredData(id, req);
    if (subRequest?.error || subRequest?.isResolved) return;

    const params = subRequest?.params || [];
    const validationResponse = validateParameters(params, methodMeta, getParamsJitFunctions(id));
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
export function serializeSubRequests(subRequestIds: string[], req: MionRequest<any, any>, errors: RequestErrors): void {
    subRequestIds.forEach((id) => {
        serializeSubRequest(id, req, errors);
        const methodMeta = routerUtils.getMetadata(id);
        if (methodMeta?.hookIds?.length) serializeSubRequests(methodMeta.hookIds, req, errors);
    });
    return;
}

/** Serialize a single subRequest. If there are is an error subRequest is marked as resolved. */
export function serializeSubRequest(id: string, req: MionRequest<any, any>, errors: RequestErrors): void {
    const {methodMeta, subRequest} = getSerializationRequiredData(id, req);
    // at this point subRequest might been validated so if not defined then is not required
    if (!subRequest) return;
    if (subRequest.serializedParams) return;

    const params = subRequest?.params || [];
    const serializedParams = serializeParameters(params, methodMeta, getParamsJitFunctions(id));
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
export function deserializeResponseBody(responseBody: PublicResponses): PublicResponses {
    const deSerializedBody = responseBody;
    Object.entries(deSerializedBody).forEach(([key, remoteHandlerResponse]) => {
        const methodMeta = routerUtils.getMetadata(key);
        if (!methodMeta) throw new Error(`Metadata for remote method ${key} not found.`);
        const deSerialized = deSerializeReturn(remoteHandlerResponse, methodMeta, getReturnJitFunctions(methodMeta.id));
        deSerializedBody[key] = deSerialized;
    });
    return deSerializedBody;
}

// ############# PRIVATE METHODS #############

function getSerializationRequiredData(
    id: string,
    req: MionRequest<any, any>
): {methodMeta: SerializablePublicMethod; subRequest?: SubRequest<any>} {
    const methodMeta = routerUtils.getMetadata(id);
    const subRequest = req.subRequestList[id];
    if (!methodMeta) throw new Error(`Metadata for remote method ${id} not found.`);
    return {methodMeta, subRequest};
}

function serializeParameters(
    params: any[],
    method: SerializablePublicMethod,
    paramsJit?: JitCompiledFunctions
): any[] | RpcError<'serialization-error'> {
    if (!paramsJit) return params;
    if (params.length && paramsJit && !paramsJit.prepareForJson.isNoop) {
        try {
            params = paramsJit.prepareForJson.fn(params) as JSONValue[];
        } catch (e: any | Error) {
            return new RpcError({
                statusCode: StatusCodes.UNEXPECTED_ERROR,
                type: 'serialization-error',
                publicMessage: `Invalid params for Route or Hook '${method.id}', can not serialize params: ${e.message} `,
                errorData: {deserializeError: e.message},
            });
        }
    }
    return params;
}

function validateParameters(
    params: any[],
    method: SerializablePublicMethod,
    paramsJit?: JitCompiledFunctions
): void | RpcError<'validation-error' | 'unexpected-validation-error'> {
    if (!paramsJit || paramsJit.typeErrors.isNoop) return;
    try {
        const validationsResponse = paramsJit.typeErrors.fn(params);
        if (validationsResponse.length) {
            return new RpcError({
                statusCode: StatusCodes.APPLICATION_ERROR,
                type: 'validation-error',
                publicMessage: `Invalid params for Route or Hook '${method.id}', validation failed.`,
                errorData: validationsResponse,
            });
        }
    } catch (e: any | Error) {
        return new RpcError({
            statusCode: StatusCodes.UNEXPECTED_ERROR,
            type: 'unexpected-validation-error',
            publicMessage: `Could not validate params for Route or Hook '${method.id}': ${e.message} `,
        });
    }
}

function deSerializeReturn(
    response: any | RpcError<string>,
    method: SerializablePublicMethod,
    returnJit?: JitCompiledFunctions
): any | RpcError<'serialization-error'> {
    if (!returnJit || returnJit.restoreFromJson.isNoop || !response) return response;
    try {
        if (response instanceof RpcError) return response;
        if (isRpcError(response)) return new RpcError(response);
        const ret = returnJit.restoreFromJson.fn(response);
        return ret;
    } catch (e: any) {
        return new RpcError({
            statusCode: StatusCodes.UNEXPECTED_ERROR,
            type: 'serialization-error',
            publicMessage: `Invalid response from Route or Hook '${method.id}', can not deserialize return value: ${e.message}`,
            errorData: e?.errors,
        });
    }
}

/**
 * Get params JIT functions for a method using its JIT hashes
 */
function getParamsJitFunctions(id: string): JitCompiledFunctions | undefined {
    const metadata = routerUtils.getMetadata(id);
    if (!metadata?.paramsJitHashes) return undefined;
    const hashes = metadata.paramsJitHashes;
    return {
        isType: jitUtils.getJIT(hashes.isType),
        typeErrors: jitUtils.getJIT(hashes.typeErrors),
        prepareForJson: jitUtils.getJIT(hashes.prepareForJson),
        restoreFromJson: jitUtils.getJIT(hashes.restoreFromJson),
        jsonStringify: jitUtils.getJIT(hashes.jsonStringify),
        toBinary: jitUtils.getJIT(hashes.toBinary),
        fromBinary: jitUtils.getJIT(hashes.fromBinary),
    } as JitCompiledFunctions;
}

/**
 * Get return JIT functions for a method using its JIT hashes
 */
function getReturnJitFunctions(id: string): JitCompiledFunctions | undefined {
    const metadata = routerUtils.getMetadata(id);
    if (!metadata?.returnJitHashes) return undefined;
    const hashes = metadata.returnJitHashes;
    return {
        isType: jitUtils.getJIT(hashes.isType),
        typeErrors: jitUtils.getJIT(hashes.typeErrors),
        prepareForJson: jitUtils.getJIT(hashes.prepareForJson),
        restoreFromJson: jitUtils.getJIT(hashes.restoreFromJson),
        jsonStringify: jitUtils.getJIT(hashes.jsonStringify),
        toBinary: jitUtils.getJIT(hashes.toBinary),
        fromBinary: jitUtils.getJIT(hashes.fromBinary),
    } as JitCompiledFunctions;
}
