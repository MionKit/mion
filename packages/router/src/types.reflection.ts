/* ########
 * 2022 mion
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
} from '@deepkit/type';
import {ReflectionKind} from '@deepkit/type';

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

// #######  reflection #######

export type RouteParamValidator = (data: any) => ValidationErrorItem[];
export type RouteParamDeserializer = <T>(data: JSONPartial<T>) => T;
export type RouteOutputSerializer = <T>(data: T) => JSONSingle<T>;

// #######  type guards #######

// TODO: we might be missing some scenarios here and might need more test
export const isAsyncType = (t: Type): t is TypePromise =>
    t.kind === ReflectionKind.promise || t.kind === ReflectionKind.any || t.kind === ReflectionKind.unknown;
