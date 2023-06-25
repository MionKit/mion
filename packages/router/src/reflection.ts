/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Executable, Handler, RouterOptions} from './types';
import {
    reflect,
    validateFunction,
    Type,
    serializeFunction,
    deserializeFunction,
    SerializationOptions,
    isType,
} from '@deepkit/type';
import {isFunctionType} from './types';
import {ROUTE_DEFAULT_PARAMS} from './constants';
import {
    ReflectionOptions,
    RouteOutputSerializer,
    RouteParamDeserializer,
    RouteParamValidator,
    isAsyncType,
} from './types.reflection';

/**
 * Returns an array of functions to validate route handler parameters,
 * First param is excluded from the returned array a is alway the route Context and doesn't need to be validated
 * @param handler
 * @param routerOptions
 * @returns the returned array is in the same order as the handler parameters
 */
export const getParamValidators = (handlerOrType: Handler | Type, routerOptions: RouterOptions): RouteParamValidator[] => {
    const handlerType: Type = isType(handlerOrType) ? handlerOrType : reflect(handlerOrType);
    return _getParamValidators(handlerType, routerOptions.reflectionOptions);
};

/**
 * Returns an array of functions to validate route handler parameters,
 * First param is excluded from the returned array a is alway the route Context and doesn't need to be validated
 * @param handlerType
 * @param reflectionOptions
 * @returns the returned array is in the same order as the handler parameters
 */
export const _getParamValidators = (handlerType: Type, reflectionOptions: ReflectionOptions): RouteParamValidator[] => {
    if (!isFunctionType(handlerType)) throw 'Invalid route/hook handler';

    const paramValidators = handlerType.parameters.map((paramType, index) => {
        // assumes the context type that is the first parameter is always valid
        return index > 0 ? validateFunction(reflectionOptions.customSerializer, paramType) : () => [];
    });

    return paramValidators.slice(ROUTE_DEFAULT_PARAMS.length);
};

/**
 * Returns an Array of functions to deserialize route handler parameters.
 * @param handler
 * @param routerOptions
 * @returns
 */
export const getParamsDeserializer = (handlerOrType: Handler | Type, routerOptions: RouterOptions): RouteParamDeserializer[] => {
    const handlerType: Type = isType(handlerOrType) ? handlerOrType : reflect(handlerOrType);
    return _getParamsDeserializer(handlerType, routerOptions.reflectionOptions);
};

/**
 * Returns an Array of functions to deserialize route handler parameters.
 * @param handlerType
 * @param reflectionOptions
 * @returns
 */
export const _getParamsDeserializer = (handlerType: Type, reflectionOptions: ReflectionOptions): RouteParamDeserializer[] => {
    if (!isFunctionType(handlerType)) throw 'Invalid route/hook handler';

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

    return paramDeserializer.slice(ROUTE_DEFAULT_PARAMS.length);
};

/**
 * Returns a serialization function for the route return value.
 * @param handler
 * @param routerOptions
 * @returns
 */
export const getOutputSerializer = (handlerOrType: Handler | Type, routerOptions: RouterOptions): RouteOutputSerializer => {
    const handlerType: Type = isType(handlerOrType) ? handlerOrType : reflect(handlerOrType);
    return _getOutputSerializer(handlerType, routerOptions.reflectionOptions);
};

/**
 * Returns a serialization function for the route return value.
 * @param handlerType
 * @param reflectionOptions
 * @returns
 */
export const _getOutputSerializer = (handlerType: Type, reflectionOptions: ReflectionOptions): RouteOutputSerializer => {
    if (!isFunctionType(handlerType)) throw 'Invalid route/hook handler';

    const outPutSerializer = serializeFunction(
        reflectionOptions.serializationOptions,
        reflectionOptions.customSerializer,
        reflectionOptions.serializerNamingStrategy,
        handlerType.return
    );

    return serializeDeserializeOptionsFix(outPutSerializer, {...reflectionOptions.serializationOptions});
};

/**
 * Validates parameters from an executable
 * @param executable
 * @param params
 * @returns
 */
export const validateParams = (executable: Executable, params: any[] = []): string[] => {
    const validators = executable.paramValidators;
    return _validateParams(executable.fieldName, executable.paramValidators, params);
};

/**
 * Validate route parameters
 * @param functionName
 * @param validators
 * @param params
 * @returns
 */
export const _validateParams = (functionName: string, validators: RouteParamValidator[], params: any[] = []): string[] => {
    if (params.length !== validators.length) throw 'Invalid number of parameters';
    const errors = validators.map((validate, index) => validate(params[index])).flat();
    // TODO: return default error instead new one
    return errors.map((validationError, index) => `Invalid param[${index}] in '${functionName}', ${validationError.toString()}.`);
};

/**
 * Deserialize parameters from executable
 * @param executable
 * @param params
 * @returns
 */
export const deserializeParams = (executable: Executable, params: any[] = []): any[] => {
    return _deserializeParams(executable.paramsDeSerializers, params);
};

/**
 * Deserialize route parameters
 * @param deSerializers
 * @param params
 * @returns
 */
export const _deserializeParams = (deSerializers: RouteParamDeserializer[], params: any[] = []): any[] => {
    if (params.length !== deSerializers.length) throw 'Invalid number of parameters';
    return deSerializers.map((deserializer, index) => deserializer(params[index]));
};

/**
 * Checks whether a handler returns a promise.
 * @param handlerOrType
 * @returns
 */
export const isAsyncHandler = (handlerOrType: Handler | Type): boolean => {
    const handlerType: Type = isType(handlerOrType) ? handlerOrType : reflect(handlerOrType);
    return _isAsyncHandler(handlerType);
};

/**
 * Checks whether a handler return type is async.
 * @param handlerOrType
 * @returns
 */
export const _isAsyncHandler = (handlerType: Type): boolean => {
    if (!isFunctionType(handlerType)) throw 'Invalid route/hook handler';
    return isAsyncType(handlerType.return);
};

// DeepKit serializeFunction and deserializeFunction are not keeping the options when calling the function, so this fixes it
const serializeDeserializeOptionsFix = (sdFunction: (d: any, b: SerializationOptions) => any, opts: SerializationOptions) => {
    return (p: any) => sdFunction(p, opts);
};
