/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionOptions} from './types';

/** Reflection and Deepkit Serialization-Validation options */
export const DEFAULT_REFLECTION_OPTIONS: Readonly<ReflectionOptions> = {
    /**
     * Deepkit Serialization Options
     * !! We Don't recommend to enable soft conversion as json is used to send and receive data and already have support for basic javascript types
     * Soft conversion is only useful when parameters are sent only as strings like url query params or http headers
     * @link https://docs.deepkit.io/english/serialization.html#serialisation-options
     * */
    serializationOptions: {
        loosely: false, // Soft conversion disabled by default
    },

    /**
     * Deepkit custom serializer
     * @link https://docs.deepkit.io/english/serialization.html#serialisation-custom-serialiser
     * */
    customSerializer: undefined,

    /**
     * Deepkit Serialization Options
     * @link https://docs.deepkit.io/english/serialization.html#_naming_strategy
     * */
    serializerNamingStrategy: undefined,
};
