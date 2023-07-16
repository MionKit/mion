/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {mionParseJsonRequestBodyHook, mionStringifyJsonResponseBodyHook} from './jsonBodyParser';
import {mionHttpCloseConnectionHook, mionHttpConnectionHook} from './httpConnection';
import {HooksCollection} from './types';
import {RouteError, StatusCodes} from '@mionkit/core';

export const mionHooks = {
    mionParseJsonRequestBodyHook,
    mionStringifyJsonResponseBodyHook,
    mionHttpConnectionHook,
    mionHttpCloseConnectionHook,
    mion404Hook: {
        isInternal: true,
        hook: () => {
            return new RouteError({statusCode: StatusCodes.NOT_FOUND, publicMessage: `Route not found`});
        },
    },
} satisfies HooksCollection;
