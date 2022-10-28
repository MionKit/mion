/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
    Executable,
    Handler,
    RouteParamDeserializer,
    RouteOutputSerializer,
    RouteParamValidator,
    RouterOptions,
    isAsyncType,
} from './types';
import {
    reflect,
    validateFunction,
    Type,
    isSameType,
    serializeFunction,
    deserializeFunction,
    SerializationOptions,
} from '@deepkit/type';
import {isFunctionType} from './types';

/**
 * Returns an array of functions to validate route handler parameters,
 * First param is excluded from the returned array a is alway the route Context and doesn't need to be validated
 * @param handler
 * @param routerOptions
 * @returns the returned array is in the same order as the handler parameters
 */
export const getParamValidators = (handler: Handler, routerOptions: RouterOptions, type?: Type): RouteParamValidator[] => {
    const handlerType = type || reflect(handler);
    if (!isFunctionType(handlerType)) throw 'Invalid route/hook handler';

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
export const getParamsDeserializer = (handler: Handler, routerOptions: RouterOptions, type?: Type): RouteParamDeserializer[] => {
    const handlerType = type || reflect(handler);
    if (!isFunctionType(handlerType)) throw 'Invalid route/hook handler';

    const opts: SerializationOptions = {
        ...routerOptions.serializationOptions,
    };
    const paramDeserializer = handlerType.parameters.map((paramType, index) => {
        // assumes the context type that is the first parameter is always valid
        return index > 0
            ? serializeDeserializeOptionsFix(
                  deserializeFunction(
                      routerOptions.serializationOptions,
                      routerOptions.customSerializer,
                      routerOptions.serializerNamingStrategy,
                      paramType,
                  ),
                  opts,
              )
            : (a) => '';
    });

    return paramDeserializer.slice(1);
};

/**
 * Returns a serialization function for the route return value;
 * @param handler
 * @param routerOptions
 * @returns
 */
export const getOutputSerializer = (handler: Handler, routerOptions: RouterOptions, type?: Type): RouteOutputSerializer => {
    const handlerType = type || reflect(handler);
    if (!isFunctionType(handlerType)) throw 'Invalid route/hook handler';

    const outPutSerializer = serializeFunction(
        routerOptions.serializationOptions,
        routerOptions.customSerializer,
        routerOptions.serializerNamingStrategy,
        handlerType.return,
    );

    return serializeDeserializeOptionsFix(outPutSerializer, {...routerOptions.serializationOptions});
};

export const validateParams = (executable: Executable, params: any[] = []): string[] => {
    const validators = executable.paramValidators;
    if (params.length !== validators.length) throw 'Invalid number of parameters';
    const errors = validators.map((validate, index) => validate(params[index])).flat();
    return errors.map(
        (validationError, index) => `Invalid param[${index}] in '${executable.fieldName}', ${validationError.toString()}.`,
    );
};

export const deserializeParams = (executable: Executable, params: any[] = []): any[] => {
    const deSerializers = executable.paramsDeSerializers;
    if (params.length !== deSerializers.length) throw 'Invalid number of parameters';
    return deSerializers.map((deserializer, index) => deserializer(params[index]));
};

export const isAsyncHandler = (handler: Handler, type?: Type): boolean => {
    const handlerType = type || reflect(handler);
    if (!isFunctionType(handlerType)) throw 'Invalid route/hook handler';

    return isAsyncType(handlerType.return);
};
// TODO: validate router explicit types
// export const hasExplicitTypes = (handler: Handler, type?: Type): boolean => {
//     const handlerType = type || reflect(handler);
//     if (!isFunctionType(handlerType)) throw 'Invalid route/hook handler';

//     const hasExplicitParams = handlerType.parameters.map((paramType, index) => {
//         console.log('paramType', paramType);
//         console.log('paramType.originTypes', paramType.originTypes);
//         console.log('paramType.type', paramType.type);
//         console.log('paramType.typeArguments', paramType.typeArguments);
//         console.log('paramType.optional', paramType.optional);
//         console.log('paramType.type', paramType.visibility);
//         return paramType;
//     });
//     return false;
// };

export const isFirstParameterContext = (contextType: Type, handler: Handler): boolean => {
    const handlerType = reflect(handler);
    if (!isFunctionType(handlerType)) throw 'Invalid route/hook handler';

    if (!handlerType.parameters.length) return true;
    return isSameType(contextType, handlerType.parameters[0].type);
};

// DeepKit serializeFunction and deserializeFunction are not keeping the options when calling the function, so this fixes it
const serializeDeserializeOptionsFix = (sdFunction: (d: any, b: SerializationOptions) => any, opts: SerializationOptions) => {
    return (p: any) => sdFunction(p, opts);
};
