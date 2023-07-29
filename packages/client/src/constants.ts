/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ClientOptions} from './types';

export const DEFAULT_PREFILL_OPTIONS: ClientOptions = {
    apiURL: window.location.origin,
    storage: 'localStorage',
    localStorageKey: 'mionkit:client',
};
