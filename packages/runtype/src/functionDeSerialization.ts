/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {reflect, Type, deserializeFunction, SerializationOptions, isType} from '@deepkit/type';
import {ReflectionOptions, Handler, FunctionParamDeserializer, isFunctionType} from './types';
import {serializeDeserializeOptionsFix} from './lib';

/**
 * Returns an Array of functions to deserialize route handler parameters.
 * @param handler
 * @param routerOptions
 * @returns
 */
export const getFunctionParamsDeserializer = (
    handlerOrType: Handler | Type,
    reflectionOptions: ReflectionOptions,
    skipInitialParams: number
): FunctionParamDeserializer[] => {
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

    return paramDeserializer.slice(skipInitialParams);
};

/**
 * Deserialize route parameters
 * @param deSerializers
 * @param params
 * @returns
 */
export const deserializeFunctionParams = (deSerializers: FunctionParamDeserializer[], params: any[] = []): any[] => {
    if (params.length !== deSerializers.length) throw new Error('Invalid number of parameters');
    return deSerializers.map((deserializer, index) => deserializer(params[index]));
};
