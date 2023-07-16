/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {HookDef} from './types';

export const DEFAULT_HOOK: Readonly<Required<HookDef>> = {
    forceRunOnError: false,
    canReturnData: false,
    inHeader: false,
    fieldName: '',
    description: '',
    enableValidation: true,
    enableSerialization: true,
    hook: () => null,
};

export const HOOK_KEYS = Object.keys(DEFAULT_HOOK);
