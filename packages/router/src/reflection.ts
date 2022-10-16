/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Context, Handler, RouteParamValidator} from './types';
import {ReflectionKind, reflect, validateFunction, Type, isSameType} from '@deepkit/type';
import {isFunctionType} from './types';

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

export const isFirstParameterContext = (contextType: Type, handler: Handler): boolean => {
    const handlerType = reflect(handler);
    if (!isFunctionType(handlerType)) throw 'invalid route handler';

    if (!handlerType.parameters.length) return true;
    return isSameType(contextType, handlerType.parameters[0].type);
};
