/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {addDefaultGlobalOptions} from '@mionkit/core';
import {HookDef, HookOptions} from './types';

export const DEFAULT_HOOKS_OPTIONS = addDefaultGlobalOptions<HookOptions>({
    /** enable automatic parameter validation, defaults to true */
    enableValidation: true,
    /** Enables serialization/deserialization */
    enableSerialization: true,
});

export const DEFAULT_HOOK: Readonly<Required<HookDef>> = {
    forceRunOnError: false,
    canReturnData: false,
    inHeader: false,
    fieldName: '',
    description: '',
    enableValidation: true,
    enableSerialization: true,
    isInternal: false,
    hook: () => null,
};

export const HOOK_KEYS = Object.keys(DEFAULT_HOOK);
