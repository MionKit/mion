/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RemoteMethod, ResolvedResponse} from '@mionkit/router';
import {FunctionReflection} from '@mionkit/runtype';
import {PublicError, StatusCodes} from '@mionkit/core';

export function serializeParameters(params: any[], method: RemoteMethod, reflection?: FunctionReflection): any[] | PublicError {
    if (!reflection) return params;
    if (params.length && method.enableSerialization) {
        try {
            params = reflection.serializeParams(params);
        } catch (e: any | Error) {
            return new PublicError({
                statusCode: StatusCodes.BAD_REQUEST,
                name: 'Serialization Error',
                message: `Invalid params '${method.id}', can not serialize: ${e.message} `,
                errorData: e?.errors,
            });
        }
    }
    return params;
}

export function validateParameters(params: any[], method: RemoteMethod, reflection?: FunctionReflection): any[] | PublicError {
    if (!reflection) return params;
    if (method.enableValidation) {
        const validationResponse = reflection.validateParams(params);
        if (validationResponse.hasErrors) {
            return new PublicError({
                statusCode: StatusCodes.BAD_REQUEST,
                name: 'Validation Error',
                message: `Invalid params in '${method.id}', validation failed.`,
                errorData: validationResponse,
            });
        }
    }
    return params;
}

export function deSerializeReturn(
    remoteHandlerResponse: ResolvedResponse<any>,
    method: RemoteMethod,
    reflection?: FunctionReflection
): ResolvedResponse<any> | PublicError {
    if (!reflection || !method.enableSerialization) return remoteHandlerResponse;
    const result = remoteHandlerResponse[0];
    if (!result) return remoteHandlerResponse;
    try {
        const serialized = reflection.deserializeReturn(result);
        return [serialized, remoteHandlerResponse[1]];
    } catch (e: any) {
        return new PublicError({
            statusCode: StatusCodes.BAD_REQUEST,
            name: 'Serialization Error',
            message: `Invalid response '${method.id}', can not serialize: ${e.message}`,
            errorData: e?.errors,
        });
    }
}
