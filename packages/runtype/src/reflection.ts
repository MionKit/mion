/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
    reflect,
    validateFunction,
    Type,
    serializeFunction,
    deserializeFunction,
    SerializationOptions,
    isType,
} from '@deepkit/type';
import {
    ReflectionOptions,
    RemoteCall,
    RouteOutputSerializer,
    RouteParamDeserializer,
    RouteParamValidator,
    isAsyncType,
    isFunctionType,
} from './types';
import {REMOTE_DEFAULT_PARAMS} from './constants';

/**
 * Returns an array of functions to validate route handler parameters,
 * First param is excluded from the returned array a is alway the route Context and doesn't need to be validated
 * @param handler
 * @param routerOptions
 * @returns the returned array is in the same order as the handler parameters
 */
export const getParamValidators = (
    handlerOrType: RemoteCall | Type,
    reflectionOptions: ReflectionOptions
): RouteParamValidator[] => {
    const handlerType: Type = isType(handlerOrType) ? handlerOrType : reflect(handlerOrType);
    if (!isFunctionType(handlerType)) throw new Error('Invalid handler type must be a function');

    const paramValidators = handlerType.parameters.map((paramType, index) => {
        // assumes the context type that is the first parameter is always valid
        return index > 0 ? validateFunction(reflectionOptions.customSerializer, paramType) : () => [];
    });

    return paramValidators.slice(REMOTE_DEFAULT_PARAMS.length);
};

/**
 * Returns an Array of functions to deserialize route handler parameters.
 * @param handler
 * @param routerOptions
 * @returns
 */
export const getParamsDeserializer = (
    handlerOrType: RemoteCall | Type,
    reflectionOptions: ReflectionOptions
): RouteParamDeserializer[] => {
    const handlerType: Type = isType(handlerOrType) ? handlerOrType : reflect(handlerOrType);
    if (!isFunctionType(handlerType)) throw new Error('Invalid handler type must be a function');

    const opts: SerializationOptions = {
        ...reflectionOptions.serializationOptions,
    };
    const paramDeserializer = handlerType.parameters.map((paramType, index) => {
        // assumes the app and context type that is the first parameter is always valid
        return index > 1
            ? serializeDeserializeOptionsFix(
                  deserializeFunction(
                      reflectionOptions.serializationOptions,
                      reflectionOptions.customSerializer,
                      reflectionOptions.serializerNamingStrategy,
                      paramType
                  ),
                  opts
              )
            : (a) => '';
    });

    return paramDeserializer.slice(REMOTE_DEFAULT_PARAMS.length);
};

/**
 * Returns a serialization function for the route return value.
 * @param handler
 * @param routerOptions
 * @returns
 */
export const getOutputSerializer = (
    handlerOrType: RemoteCall | Type,
    reflectionOptions: ReflectionOptions
): RouteOutputSerializer => {
    const handlerType: Type = isType(handlerOrType) ? handlerOrType : reflect(handlerOrType);
    if (!isFunctionType(handlerType)) throw new Error('Invalid handler type must be a function');

    const outPutSerializer = serializeFunction(
        reflectionOptions.serializationOptions,
        reflectionOptions.customSerializer,
        reflectionOptions.serializerNamingStrategy,
        handlerType.return
    );

    return serializeDeserializeOptionsFix(outPutSerializer, {...reflectionOptions.serializationOptions});
};

/**
 * Validate route parameters
 * @param functionName
 * @param validators
 * @param params
 * @returns
 */
export const validateParams = (functionName: string, validators: RouteParamValidator[], params: any[] = []): string[] => {
    if (params.length !== validators.length) throw new Error('Invalid number of parameters');
    const errors = validators.map((validate, index) => validate(params[index])).flat();
    // TODO: return default error instead new one
    return errors.map((validationError, index) => `Invalid param[${index}] in '${functionName}', ${validationError.toString()}.`);
};

/**
 * Deserialize route parameters
 * @param deSerializers
 * @param params
 * @returns
 */
export const deserializeParams = (deSerializers: RouteParamDeserializer[], params: any[] = []): any[] => {
    if (params.length !== deSerializers.length) throw new Error('Invalid number of parameters');
    return deSerializers.map((deserializer, index) => deserializer(params[index]));
};

/**
 * Checks whether a handler returns a promise.
 * @param handlerOrType
 * @returns
 */
export const isAsyncHandler = (handlerOrType: RemoteCall | Type): boolean => {
    const handlerType: Type = isType(handlerOrType) ? handlerOrType : reflect(handlerOrType);
    if (!isFunctionType(handlerType)) throw new Error('Invalid handler type must be a function');
    return isAsyncType(handlerType.return);
};

// DeepKit serializeFunction and deserializeFunction are not keeping the options when calling the function, so this fixes it
const serializeDeserializeOptionsFix = (sdFunction: (d: any, b: SerializationOptions) => any, opts: SerializationOptions) => {
    return (p: any) => sdFunction(p, opts);
};
