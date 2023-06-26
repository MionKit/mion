/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {reflect, Type, deserializeFunction, SerializationOptions, isType, serializeFunction, JSONPartial} from '@deepkit/type';
import {
    ReflectionOptions,
    Handler,
    FunctionParamDeserializer,
    isFunctionType,
    FunctionParamSerializer,
    FunctionReturnSerializer,
    FunctionReturnDeSerializer,
} from './types';
import {serializeDeserializeOptionsFix} from './lib';

/**
 * Returns an Array of functions to Deserialize route handler parameters.
 * @param handler
 * @param routerOptions
 * @returns
 */
export const getFunctionParamsDeserializer = (
    handlerOrType: Handler | Type,
    reflectionOptions: ReflectionOptions,
    skipInitialParams: number
): FunctionParamDeserializer[] =>
    getParamsSD(handlerOrType, reflectionOptions, skipInitialParams, true) as FunctionParamDeserializer[];

/**
 * Returns an Array of functions to Serialize route handler parameters.
 * @param handler
 * @param routerOptions
 * @returns
 */
export const getFunctionParamsSerializer = (
    handlerOrType: Handler | Type,
    reflectionOptions: ReflectionOptions,
    skipInitialParams: number
): FunctionParamSerializer[] =>
    getParamsSD(handlerOrType, reflectionOptions, skipInitialParams, false) as FunctionParamSerializer[];

/**
 * Serialize route parameters, transform an array of values into an array of serializable values.
 * i.e: [new Date()] => ['2022-12-19T00:24:00.00']
 * @param serializers
 * @param params
 * @returns
 */
export const serializeFunctionParams = <T = any>(serializers: FunctionParamSerializer[], params: any[]): JSONPartial<T>[] => {
    if (params.length !== serializers.length) throw new Error('Invalid number of parameters');
    return serializers.map((serializer, index) => serializer(params[index]));
};

/**
 * Deserialize route parameters, transform an array of serialized values into an array of js values.
 * i.e: ['2022-12-19T00:24:00.00'] => [new Date('2022-12-19T00:24:00.00')]
 * @param serializers
 * @param params
 * @returns
 */
export const deserializeFunctionParams = <T = any>(
    deSerializers: FunctionParamDeserializer[],
    params: JSONPartial<T>[]
): any[] => {
    if (params.length !== deSerializers.length) throw new Error('Invalid number of parameters');
    return deSerializers.map((deserializer, index) => deserializer(params[index]));
};

/**
 * Returns a Deserialization function for the route return value.
 * @param handler
 * @param routerOptions
 * @returns
 */
export const getFunctionReturnDeserializer = (
    handlerOrType: Handler | Type,
    reflectionOptions: ReflectionOptions
): FunctionReturnDeSerializer => getReturnSD(handlerOrType, reflectionOptions, true);

/**
 * Returns a serialization function for the route return value.
 * @param handler
 * @param routerOptions
 * @returns
 */
export const getFunctionReturnSerializer = (
    handlerOrType: Handler | Type,
    reflectionOptions: ReflectionOptions
): FunctionReturnSerializer => getReturnSD(handlerOrType, reflectionOptions, false);

// ########### internal functions ###########

const getReturnSD = (
    handlerOrType: Handler | Type,
    reflectionOptions: ReflectionOptions,
    deserialize: boolean
): FunctionReturnSerializer | FunctionReturnDeSerializer => {
    const sdFunction = deserialize ? deserializeFunction : serializeFunction;
    const handlerType: Type = isType(handlerOrType) ? handlerOrType : reflect(handlerOrType);
    if (!isFunctionType(handlerType)) throw new Error('Invalid handler type must be a function');

    const opts: SerializationOptions = {
        ...reflectionOptions.serializationOptions,
    };

    return serializeDeserializeOptionsFix(
        sdFunction(
            reflectionOptions.serializationOptions,
            reflectionOptions.customSerializer,
            reflectionOptions.serializerNamingStrategy,
            handlerType.return
        ),
        opts
    );
};

const getParamsSD = (
    handlerOrType: Handler | Type,
    reflectionOptions: ReflectionOptions,
    skipInitialParams: number,
    deserialize: boolean
): FunctionParamDeserializer[] | FunctionParamSerializer[] => {
    const sdFunction = deserialize ? deserializeFunction : serializeFunction;
    const handlerType: Type = isType(handlerOrType) ? handlerOrType : reflect(handlerOrType);
    if (!isFunctionType(handlerType)) throw new Error('Invalid handler type must be a function');

    const opts: SerializationOptions = {
        ...reflectionOptions.serializationOptions,
    };
    const paramSD = handlerType.parameters.map((paramType, index) => {
        // assumes the app and context type that is the first parameter is always valid
        return index > 1
            ? serializeDeserializeOptionsFix(
                  sdFunction(
                      reflectionOptions.serializationOptions,
                      reflectionOptions.customSerializer,
                      reflectionOptions.serializerNamingStrategy,
                      paramType
                  ),
                  opts
              )
            : (a) => '';
    });

    return paramSD.slice(skipInitialParams);
};
