/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
    ReflectionOptions,
    FunctionParamDeserializer,
    FunctionParamSerializer,
    FunctionReturnSerializer,
    FunctionReturnDeSerializer,
} from './types';
import {
    deserializeFunction,
    SerializationOptions,
    serializeFunction,
    JSONPartial,
    SerializeFunction,
    TypeFunction,
    serialize,
    ReflectionKind,
    TypeUnion,
    isSameType,
    Type,
} from '@deepkit/type';
import {RpcError} from '@mionkit/core';
import {ERROR_TYPE, RPC_ERROR_TYPE} from '@mionkit/runtype';

/**
 * Returns an Array of functions to Deserialize route handler parameters.
 * @param handler
 * @param routerOptions
 * @returns
 */
export function getFunctionParamsDeserializer(
    handlerType: TypeFunction,
    reflectionOptions: ReflectionOptions,
    skipInitialParams: number
): FunctionParamDeserializer[] {
    return getParamsSD(handlerType, reflectionOptions, skipInitialParams, true) as FunctionParamDeserializer[];
}

/**
 * Returns an Array of functions to Serialize route handler parameters.
 * @param handler
 * @param routerOptions
 * @returns
 */
export function getFunctionParamsSerializer(
    handlerType: TypeFunction,
    reflectionOptions: ReflectionOptions,
    skipInitialParams: number
): FunctionParamSerializer[] {
    return getParamsSD(handlerType, reflectionOptions, skipInitialParams, false) as FunctionParamSerializer[];
}

/**
 * Serialize route parameters, transform an array of values into an array of serializable values.
 * i.e: [new Date()] => ['2022-12-19T00:24:00.00']
 * @param serializers
 * @param params
 * @returns
 */
export function serializeFunctionParams<T = any>(serializers: FunctionParamSerializer[], params: any[]): JSONPartial<T>[] {
    if (params.length > serializers.length) throw new Error('Invalid number of parameters');
    return serializers.map((serializer, index) => serializer(params[index]));
}

/**
 * Deserialize route parameters, transform an array of serialized values into an array of js values.
 * i.e: ['2022-12-19T00:24:00.00'] => [new Date('2022-12-19T00:24:00.00')]
 * @param serializers
 * @param params
 * @returns
 */
export function deserializeFunctionParams<T = any>(deSerializers: FunctionParamDeserializer[], params: JSONPartial<T>[]): any[] {
    if (params.length > deSerializers.length) throw new Error('Invalid number of parameters');
    return deSerializers.map((deserializer, index) => deserializer(params[index]));
}

/**
 * Returns a Deserialization function for the route return value.
 * @param handler
 * @param routerOptions
 * @returns
 */
export function getFunctionReturnDeserializer(
    handlerType: TypeFunction,
    reflectionOptions: ReflectionOptions
): FunctionReturnDeSerializer {
    return getReturnSD(handlerType, reflectionOptions, true);
}

/**
 * Returns a serialization function for the route return value.
 * @param handler
 * @param routerOptions
 * @returns
 */
export function getFunctionReturnSerializer(
    handlerType: TypeFunction,
    reflectionOptions: ReflectionOptions
): FunctionReturnSerializer {
    return getReturnSD(handlerType, reflectionOptions, false);
}

// ########### internal functions ###########

function getReturnSD(
    handlerType: TypeFunction,
    reflectionOptions: ReflectionOptions,
    isDeserialize: boolean
): FunctionReturnSerializer | FunctionReturnDeSerializer {
    // the union hack should be only applied when serializing
    if (!isDeserialize && hasUnionErrorTypes(handlerType))
        return deserializeReturnWithUnionErrorHack(handlerType, reflectionOptions, isDeserialize);

    const sFunctionCreate = isDeserialize ? deserializeFunction : serializeFunction;

    const opts: SerializationOptions = {
        ...reflectionOptions.serializationOptions,
    };

    // const returnFix = (handlerType.return as any)?.types?.[0] || handlerType.return;
    const sFunction = sFunctionCreate(
        reflectionOptions.customSerializer,
        reflectionOptions.serializerNamingStrategy,
        handlerType.return
    );

    return createSingleParamSerializeFunction(sFunction, opts);
}

/**
 * Creates a serializer or deserializer function to validate params
 * @param handlerOrType
 * @param reflectionOptions
 * @param skipInitialParams
 * @param isDeserialize
 * @returns
 */
function getParamsSD(
    handlerType: TypeFunction,
    reflectionOptions: ReflectionOptions,
    skipInitialParams: number,
    isDeserialize: boolean
): FunctionParamDeserializer[] | FunctionParamSerializer[] {
    const sFunctionCreate = isDeserialize ? deserializeFunction : serializeFunction;

    const opts: SerializationOptions = {
        ...reflectionOptions.serializationOptions,
    };
    const paramSD = handlerType.parameters.map((paramType, index) => {
        const shouldCreateSerializer = index >= skipInitialParams;
        return shouldCreateSerializer
            ? createSingleParamSerializeFunction(
                  sFunctionCreate(reflectionOptions.customSerializer, reflectionOptions.serializerNamingStrategy, paramType),
                  opts
              )
            : (null as any as SerializeFunction);
    });

    return paramSD.slice(skipInitialParams);
}

// TODO, review if this is still required
// DeepKit serializeFunction and deserializeFunction are not keeping the options when calling the function, so this fixes it
function createSingleParamSerializeFunction(sFunction: SerializeFunction, opts: SerializationOptions) {
    return (p: JSONPartial<unknown> | unknown) => sFunction(p, opts);
}

// ###### HACK TO FIX THE ISSUE WITH RETURNED UNION TYPES ######
// TODO: FOR SOME REASON ROUTES RETURNING AN UNION (Value | RpcError) ARE NOT BEING VALIDATED/SERIALIZED CORRECTLY

function serializeError(error: Error | RpcError): JSONPartial<any> {
    if (error instanceof RpcError) return serialize<RpcError>(error);
    if (error instanceof Error) return serialize<Error>(error);
    throw new Error('Invalid error type. can only serialize Error or RpcError');
}

function hasUnionErrorTypes(handlerType: TypeFunction): boolean {
    if (handlerType.return.kind !== ReflectionKind.union) return false;
    const returnTypes = (handlerType.return as TypeUnion).types;
    return returnTypes.some((t) => isErrorType(t));
}

function isErrorType(t: Type): boolean {
    return isSameType(t, RPC_ERROR_TYPE) || isSameType(t, ERROR_TYPE);
}

function getHandlerReturnUnionTypeWithoutErrors(handlerType: TypeFunction): Type {
    if (handlerType.return.kind !== ReflectionKind.union)
        throw new Error('Invalid handler type, only union types should be used');
    const returnTypes = (handlerType.return as TypeUnion).types;
    const typesWithoutErrors = returnTypes.filter((t) => !isErrorType(t));
    const newReturnType: Type =
        typesWithoutErrors.length === 1
            ? typesWithoutErrors[0]
            : {
                  ...handlerType.return,
                  types: typesWithoutErrors,
              };
    return newReturnType;
}

function deserializeReturnWithUnionErrorHack(
    handlerType: TypeFunction,
    reflectionOptions: ReflectionOptions,
    isDeserialize: boolean
): FunctionReturnSerializer | FunctionReturnDeSerializer {
    const sFunctionCreate = isDeserialize ? deserializeFunction : serializeFunction;
    const opts: SerializationOptions = {
        ...reflectionOptions.serializationOptions,
    };
    const returnTypeWithoutErrors = getHandlerReturnUnionTypeWithoutErrors(handlerType);
    const sFunction = sFunctionCreate(
        reflectionOptions.customSerializer,
        reflectionOptions.serializerNamingStrategy,
        returnTypeWithoutErrors
    );

    const serializeValue = createSingleParamSerializeFunction(sFunction, opts);

    return (p: JSONPartial<unknown> | unknown) => {
        if (p instanceof RpcError || p instanceof Error) return serializeError(p);
        const result = serializeValue(p);
        // do not fail silently if serialization returns undefined and the value is defined
        if (!!p && !result) throw new Error(`Serialization Error, can't serialize return value.`);
        return result;
    };
}
