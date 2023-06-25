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
    JSONSingle,
    TypePromise,
    TypeFunction,
} from '@deepkit/type';
import {ReflectionKind} from '@deepkit/type';

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

// #######  VALIDATE #######
export type FunctionParamValidator = (data: any) => ValidationErrorItem[];
export type FunctionReturnValidator = (data: any) => ValidationErrorItem[];

// #######  SERIALIZE #######
export type FunctionParamSerializer = <T>(data: T) => JSONPartial<T>;
export type FunctionReturnDeSerializer = <T>(data: T) => JSONSingle<T>;

// #######  DE-SERIALIZE #######
export type FunctionParamDeserializer = <T>(data: JSONPartial<T>) => T;
export type FunctionReturnSerializer = <T>(data: T) => JSONSingle<T>;

export const isFunctionType = (t: Type): t is TypeFunction => t.kind === ReflectionKind.function;

// TODO: we might be missing some scenarios here and might need more test
export const isAsyncType = (t: Type): t is TypePromise =>
    t.kind === ReflectionKind.promise || t.kind === ReflectionKind.any || t.kind === ReflectionKind.unknown;
