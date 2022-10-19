/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {
    Executable,
    Handler,
    MkError,
    RouteParamDeserializer,
    RouteOutputSerializer,
    RouteParamValidator,
    RouterOptions,
} from './types';
import {reflect, validateFunction, Type, isSameType, serializeFunction, deserializeFunction} from '@deepkit/type';
import {isFunctionType} from './types';
import {StatusCodes} from './status-codes';

/**
 * Returns an array of functions to validate route handler parameters,
 * First param is excluded from the returned array a is alway the route Context and doesn't need to be validated
 * @param handler
 * @param routerOptions
 * @returns the returned array is in the same order as the handler parameters
 */
export const getParamValidators = (handler: Handler, routerOptions: RouterOptions): RouteParamValidator[] => {
    const handlerType = reflect(handler);
    if (!isFunctionType(handlerType)) throw 'invalid route handler';

    const paramValidators = handlerType.parameters.map((paramType, index) => {
        // assumes the context type that is the first parameter is always valid
        return index > 0 ? validateFunction(routerOptions.customSerializer, paramType) : () => [];
    });

    return paramValidators.slice(1);
};

/**
 * Returns an Array of functions to deserialize route handler parameters,
 * @param handler
 * @param routerOptions
 * @returns
 */
export const getParamsDeserializer = (handler: Handler, routerOptions: RouterOptions): RouteParamDeserializer[] => {
    const handlerType = reflect(handler);
    if (!isFunctionType(handlerType)) throw 'invalid route handler';

    const paramDeserializer = handlerType.parameters.map((paramType, index) => {
        // assumes the context type that is the first parameter is always valid
        return index > 0
            ? deserializeFunction(
                  routerOptions.serializationOptions,
                  routerOptions.customSerializer,
                  routerOptions.serializerNamingStrategy,
                  paramType,
              )
            : () => null;
    });

    return paramDeserializer.slice(1);
};

/**
 * Returns a serialization function for the route return value;
 * @param handler
 * @param routerOptions
 * @returns
 */
export const getOutputSerializer = (handler: Handler, routerOptions: RouterOptions): RouteOutputSerializer => {
    const handlerType = reflect(handler);
    if (!isFunctionType(handlerType)) throw 'invalid route handler';

    const outPutSerializer = serializeFunction(
        routerOptions.serializationOptions,
        routerOptions.customSerializer,
        routerOptions.serializerNamingStrategy,
        handlerType.return,
    );

    return outPutSerializer;
};

export const validateParams = (executable: Executable, params: any[] = []): MkError[] => {
    const validators = executable.paramValidators;
    if (params.length !== validators.length) throw 'Invalid number of parameters';
    const errors = validators.map((validate, index) => validate(params[index])).flat();
    return errors.map((validationError) => ({
        statusCode: StatusCodes.BAD_REQUEST,
        message: `Invalid input ${executable.inputFieldName}. ${validationError.toString()}`,
    }));
};

export const deserializeParams = (executable: Executable, params: any[] = []): any[] => {
    const deSerializers = executable.paramsDeSerializers;
    if (params.length !== deSerializers.length) throw 'Invalid number of parameters';
    return deSerializers.map((deserializer, index) => deserializer(params[index]));
};

export const isFirstParameterContext = (contextType: Type, handler: Handler): boolean => {
    const handlerType = reflect(handler);
    if (!isFunctionType(handlerType)) throw 'invalid route handler';

    if (!handlerType.parameters.length) return true;
    return isSameType(contextType, handlerType.parameters[0].type);
};
