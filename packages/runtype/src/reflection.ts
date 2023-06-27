/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JSONPartial, SerializedTypes, Type, reflect, serializeType} from '@deepkit/type';
import {FunctionReflection, Handler, ReflectionOptions, getHandlerType} from './types';
import {
    getFunctionParamValidators,
    getFunctionReturnValidator,
    validateFunctionParams,
    validateFunctionReturnType,
} from './validation';
import {
    deserializeFunctionParams,
    getFunctionParamsDeserializer,
    getFunctionParamsSerializer,
    getFunctionReturnDeserializer,
    getFunctionReturnSerializer,
    serializeFunctionParams,
} from './serialization';

/**
 * Gets an object with all the functions required to, serialize, deserialize and validate a function.
 * @param handlerOrType
 * @param reflectionOptions
 * @param skipInitialParams
 * @returns
 */
export const getFunctionReflectionMethods = (
    handlerOrType: Handler | Type,
    reflectionOptions: ReflectionOptions,
    skipInitialParams: number
): FunctionReflection => {
    const handlerType: Type = getHandlerType(handlerOrType);

    const paramsValidators = getFunctionParamValidators(handlerType, reflectionOptions, skipInitialParams);
    const paramsSerializers = getFunctionParamsSerializer(handlerType, reflectionOptions, skipInitialParams);
    const paramsDeSerializers = getFunctionParamsDeserializer(handlerType, reflectionOptions, skipInitialParams);

    const returnValidator = getFunctionReturnValidator(handlerType, reflectionOptions);
    const returnSerializer = getFunctionReturnSerializer(handlerType, reflectionOptions);
    const returnDeSerializer = getFunctionReturnDeserializer(handlerType, reflectionOptions);

    const length = handlerType.parameters.length;
    // prettier-ignore
    return {
        handlerType: handlerType,
        paramsLength:  length <= skipInitialParams ? 0 : length - skipInitialParams,
        validateParams: (params: any[]) => validateFunctionParams(paramsValidators, params),
        serializeParams: (params: any[]) => serializeFunctionParams(paramsSerializers, params),
        deserializeParams: (serializedParams: JSONPartial<any>) => deserializeFunctionParams(paramsDeSerializers, serializedParams),
        validateReturn: (returnValue: any) => validateFunctionReturnType(returnValidator, returnValue),
        serializeReturn: (returnValue: any) => returnSerializer(returnValue),
        deserializeReturn: (serializedReturnValue: any) => returnDeSerializer(serializedReturnValue),
    };
};

/** Gets a data structure that can be serialized in json and transmitted over the wire  */
export const getSerializedFunctionTypes = (handler: Handler): SerializedTypes => serializeType(reflect(handler));
