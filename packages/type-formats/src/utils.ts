/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {FormatParam, FormatParamLiteral} from '@mionkit/core';
import {isFormatParamMeta} from '@mionkit/run-types';

/** Returns the literal value of a FormatParam */
export function paramVal<L extends FormatParamLiteral>(p: FormatParam<L>): L {
    return isFormatParamMeta(p) ? p.val : p;
}

/**
 * Escapes special characters in a regular expression.
 * Should be the same as https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp/escape
 * @param val
 * @returns
 */
export function regexpEscape(val: string): string {
    return val.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
}
