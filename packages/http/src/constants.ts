/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {addDefaultGlobalOptions} from '@mionkit/core';
import {HttpOptions} from './types';

export const DEFAULT_HTTP_OPTIONS = addDefaultGlobalOptions<HttpOptions>({
    protocol: 'http',
    port: 80,
    options: {
        /** @default 8KB same as default value in new node versions */
        maxHeaderSize: 8192,
    },
    useCallbacks: false,
});
