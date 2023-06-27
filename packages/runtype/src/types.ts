/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {
    Type,
    ValidationErrorItem,
    Serializer,
    SerializationOptions,
    NamingStrategy,
    JSONPartial,
    TypePromise,
    TypeFunction,
} from '@deepkit/type';
import {ReflectionKind, isType, reflect} from '@deepkit/type';

export type Handler<Ret = any> = (...params: any[]) => Ret | Promise<Ret>;

// ####### Router Options #######

/** Reflection and Deepkit Serialization-Validation options */
export type ReflectionOptions = {
    /**
     * Deepkit Serialization Options
     * loosely defaults to false, Soft conversion disabled.
     * !! We Don't recommend to enable soft conversion as validation might fail
     * */
    serializationOptions: SerializationOptions;
    /**
     * Deepkit custom serializer
     * @link https://docs.deepkit.io/english/serialization.html#serialisation-custom-serialiser
     * */
    customSerializer?: Serializer;
    /**
     * Deepkit naming strategy
     * @link https://docs.deepkit.io/english/serialization.html#_naming_strategy
     * */
    serializerNamingStrategy?: NamingStrategy;
};

/** Reflection for functions */
export type FunctionReflection = {
    paramsLength: number;
    /** runtime types of the function */
    handlerType: TypeFunction;
    /** validates the parameters of the reflected function */
    validateParams: (params: any[]) => ParamsValidationResponse;
    /** serializes the parameters of the reflected function */
    serializeParams: (params: any[]) => JSONPartial<any>[];
    /** deserializes the parameters of the reflected function */
    deserializeParams: (serializedParams: JSONPartial<any>[]) => any[];
    /** validates the return value of the reflected function */
    validateReturn: (returnValue: any) => ReturnValidationResponse;
    /** serializes the return value of the reflected function */
    serializeReturn: (returnValue: any) => JSONPartial<any>;
    /** deserializes the return value of the reflected function */
    deserializeReturn: (serializedReturnValue: JSONPartial<any>) => any;
};

/** Validation Error for a single Item, it can contain multiple errors. */
export type ItemValidationError = Pick<ValidationErrorItem, 'path' | 'code' | 'message'>[];

// #######  VALIDATE #######
export type FunctionParamValidator = (param: any) => ItemValidationError;
export type FunctionReturnValidator = (returnValue: any) => ItemValidationError;
/** Params Validation response */
export type ParamsValidationResponse = {
    hasErrors: boolean;
    totalErrors: number;
    errors: ItemValidationError[];
};
/** Validation response */
export type ReturnValidationResponse = {
    hasErrors: boolean;
    error: ItemValidationError;
};

// #######  SERIALIZE #######
export type FunctionParamSerializer = <T>(param: T) => JSONPartial<T>;
export type FunctionReturnSerializer = <T>(returnValue: T) => JSONPartial<T>;

// #######  DE-SERIALIZE #######
export type FunctionParamDeserializer = <T>(param: JSONPartial<T>) => T;
export type FunctionReturnDeSerializer = <T>(returnValue: T) => JSONPartial<T>;

export const isFunctionType = (t: Type): t is TypeFunction => t.kind === ReflectionKind.function;

// TODO: we might be missing some scenarios here and might need more test
export const isAsyncType = (t: Type): t is TypePromise =>
    t.kind === ReflectionKind.promise || t.kind === ReflectionKind.any || t.kind === ReflectionKind.unknown;

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

export const getHandlerType = (handlerOrType: Handler | Type): TypeFunction => {
    const handlerType: Type = isType(handlerOrType) ? handlerOrType : reflect(handlerOrType);
    if (!isFunctionType(handlerType)) throw new Error('Invalid handler type must be a function');
    return handlerType;
};
