/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ClientOptions} from './types';

// TODO: user @types/web, instead bellow, but there are conflicts with @types/node
// we probably need to move @types/node out of the root and add to each individual package
declare global {
    interface Window {
        location: any;
        fetch: (...params: any[]) => Promise<any>;
    }

    const window: Window;
}

export const DEFAULT_PREFILL_OPTIONS: ClientOptions = {
    apiURL: window.location.origin,
    prefillStorage: 'localStorage',
};
