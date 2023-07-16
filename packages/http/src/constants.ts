/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {HttpOptions} from './types';

export const DEFAULT_SERVER_OPTIONS: Readonly<HttpOptions> = {
    protocol: 'http',
    port: 80,
    options: {
        /** @default 8KB same as default value in new node versions */
        maxHeaderSize: 8192,
    },
    useCallbacks: false,
};
