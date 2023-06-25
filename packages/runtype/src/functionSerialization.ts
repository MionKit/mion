/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {reflect, Type, serializeFunction, isType} from '@deepkit/type';
import {ReflectionOptions, Handler, FunctionReturnSerializer, isFunctionType} from './types';
import {serializeDeserializeOptionsFix} from './lib';

/**
 * Returns a serialization function for the route return value.
 * @param handler
 * @param routerOptions
 * @returns
 */
export const getFunctionReturnSerializer = (
    handlerOrType: Handler | Type,
    reflectionOptions: ReflectionOptions
): FunctionReturnSerializer => {
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
