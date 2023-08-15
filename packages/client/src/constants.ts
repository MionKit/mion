/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {DEFAULT_REFLECTION_OPTIONS} from '@mionkit/reflection';
import {ClientOptions} from './types';

export const DEFAULT_PREFILL_OPTIONS: ClientOptions = {
    baseURL: '',
    storage: 'localStorage',

    fetchOptions: {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
    },

    /** Prefix for all routes, i.e: api/v1.
     * path separator is added between the prefix and the route */
    prefix: '',

    /** Suffix for all routes, i.e: .json.
     * No path separator is added between the route and the suffix */
    suffix: '',

    /** Enables automatic parameter validation */
    enableValidation: true,

    /** Enables automatic serialization/deserialization */
    enableSerialization: true,

    /** Reflection and Deepkit Serialization-Validation options */
    reflectionOptions: DEFAULT_REFLECTION_OPTIONS,

    /** Custom body parser, defaults to Native JSON */
    bodyParser: JSON,

    /** Set true to automatically generate and id for every error.  */
    autoGenerateErrorId: false,
};

export const STORAGE_KEY = 'mionkit:client';
