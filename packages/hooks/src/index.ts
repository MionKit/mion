/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {parseJsonRequestBody, stringifyJsonResponseBody} from './jsonBodyParser';
import {httpCloseConnection, httpConnectionHandler} from './httpConnection';
import {HooksCollection} from './types';

export const mionHooks = {
    parseJsonRequestBody: {
        isInternal: true,
        hook: parseJsonRequestBody,
    },
    stringifyJsonResponseBody: {
        isInternal: true,
        hook: stringifyJsonResponseBody,
    },
    httpConnectionHandler: {
        isInternal: true,
        hook: httpConnectionHandler,
    },
    httpCloseConnection: {
        isInternal: true,
        hook: httpCloseConnection,
    },
} satisfies HooksCollection;
