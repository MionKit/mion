/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Executable, Handler, MkError, RouteParamValidator} from './types';
import {reflect, validateFunction, Type, isSameType} from '@deepkit/type';
import {isFunctionType} from './types';
import {StatusCodes} from './status-codes';

/**
 * Returns an array of functions to validate route handler parameters,
 * First param is excluded from the returned array a is alway the route Context and doesn't need to be validated
 * @param handler
 * @returns the returned array is in the same order as the handler parameters
 */
export const getParamValidators = (handler: Handler): RouteParamValidator[] => {
    const handlerType = reflect(handler);
    if (!isFunctionType(handlerType)) throw 'invalid route handler';

    const paramValidators = handlerType.parameters.map((paramType, index) => {
        // assumes the context type that is the first parameter is always valid
        return index > 0 ? validateFunction(undefined, paramType) : () => [];
    });

    return paramValidators.slice(1);
};

export const validateParams = (executable: Executable, params: any[], validators: RouteParamValidator[]): MkError[] => {
    if (params.length < validators.length)
        return [
            {
                statusCode: StatusCodes.BAD_REQUEST,
                message: `Invalid input ${executable.inputFieldName}, missing input parameters, expecting ${validators.length} got ${params.length}`,
            },
        ];
    const errors = validators.map((validate, index) => validate(params[index])).flat();
    return errors.map((validationError) => ({
        statusCode: StatusCodes.BAD_REQUEST,
        message: `Invalid input ${executable.inputFieldName}. ${validationError.toString()}`,
    }));
};

export const isFirstParameterContext = (contextType: Type, handler: Handler): boolean => {
    const handlerType = reflect(handler);
    if (!isFunctionType(handlerType)) throw 'invalid route handler';

    if (!handlerType.parameters.length) return true;
    return isSameType(contextType, handlerType.parameters[0].type);
};
