/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {addDefaultGlobalOptions} from './core';
import {CoreOptions} from './types';

export const DEFAULT_CORE_OPTIONS = addDefaultGlobalOptions<CoreOptions>({
    /** automatically generate and uuid */
    autoGenerateErrorId: false,
    /** use getCallContext instead passing the context as first route parameter */
    useAsyncCallContext: false,
});
