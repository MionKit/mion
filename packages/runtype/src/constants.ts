/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionOptions} from './types';

/** These are copied from router package so we dont do circular dependencies
 * Mostly used for unit testing on this package
 */
export const DEFAULT_REFLECTION_OPTIONS: Readonly<ReflectionOptions> = {
    /**
     * Deepkit Serialization Options
     * loosely defaults to false, Soft conversion disabled.
     * !! We Don't recommend to enable soft conversion as validation might fail
     * */
    serializationOptions: {
        loosely: false,
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
