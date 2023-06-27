/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
    ReflectionOptions,
    Handler,
    FunctionParamDeserializer,
    FunctionParamSerializer,
    FunctionReturnSerializer,
    FunctionReturnDeSerializer,
    getHandlerType,
} from './types';
import {Type, deserializeFunction, SerializationOptions, serializeFunction, JSONPartial, SerializeFunction} from '@deepkit/type';

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
    const sFunctionCreate = deserialize ? deserializeFunction : serializeFunction;
    const handlerType: Type = getHandlerType(handlerOrType);

    const opts: SerializationOptions = {
        ...reflectionOptions.serializationOptions,
    };
    const sFunction = sFunctionCreate(
        reflectionOptions.serializationOptions,
        reflectionOptions.customSerializer,
        reflectionOptions.serializerNamingStrategy,
        handlerType.return
    );
    return createSingleParamSerializeFunction(sFunction, opts);
};

/**
 * Creates a serializer or deserializer function to validate params
 * @param handlerOrType
 * @param reflectionOptions
 * @param skipInitialParams
 * @param deserialize
 * @returns
 */
const getParamsSD = (
    handlerOrType: Handler | Type,
    reflectionOptions: ReflectionOptions,
    skipInitialParams: number,
    deserialize: boolean
): FunctionParamDeserializer[] | FunctionParamSerializer[] => {
    const sFunctionCreate = deserialize ? deserializeFunction : serializeFunction;
    const handlerType: Type = getHandlerType(handlerOrType);

    const opts: SerializationOptions = {
        ...reflectionOptions.serializationOptions,
    };
    const paramSD = handlerType.parameters.map((paramType, index) => {
        const shouldCreateSerializer = index >= skipInitialParams;
        return shouldCreateSerializer
            ? createSingleParamSerializeFunction(
                  sFunctionCreate(
                      reflectionOptions.serializationOptions,
                      reflectionOptions.customSerializer,
                      reflectionOptions.serializerNamingStrategy,
                      paramType
                  ),
                  opts
              )
            : (null as any as SerializeFunction);
    });

    return paramSD.slice(skipInitialParams);
};

// DeepKit serializeFunction and deserializeFunction are not keeping the options when calling the function, so this fixes it
const createSingleParamSerializeFunction = (sFunction: SerializeFunction, opts: SerializationOptions) => {
    return (p: JSONPartial<unknown> | unknown) => sFunction(p, opts);
};
