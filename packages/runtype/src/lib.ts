/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {reflect, Type, SerializationOptions, isType} from '@deepkit/type';
import {Handler, isAsyncType, isFunctionType} from './types';

/**
 * Checks whether a handler returns a promise.
 * @param handlerOrType
 * @returns
 */
export const isAsyncHandler = (handlerOrType: Handler | Type): boolean => {
    const handlerType: Type = isType(handlerOrType) ? handlerOrType : reflect(handlerOrType);
    if (!isFunctionType(handlerType)) throw new Error('Invalid handler type must be a function');
    return isAsyncType(handlerType.return);
};

// DeepKit serializeFunction and deserializeFunction are not keeping the options when calling the function, so this fixes it
export const serializeDeserializeOptionsFix = (
    sdFunction: (d: any, b: SerializationOptions) => any,
    opts: SerializationOptions
) => {
    return (p: any) => sdFunction(p, opts);
};
