/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {DEFAULT_MAX_BODY_SIZE} from '@mionjs/core';
import {GoogleCFOptions} from './types.ts';

/** Google's own request ceiling on a 1st gen function, 10 MB, which no option can raise. Override
 *  `maxBodySizeCap` on 2nd gen (32 MB). */
export const GOOGLE_CF_MAX_BODY_SIZE_CAP = 10_000_000;

export const DEFAULT_GOOGLE_CF_OPTIONS: GoogleCFOptions = {
  defaultResponseHeaders: {},
  maxBodySize: DEFAULT_MAX_BODY_SIZE,
  maxBodySizeCap: GOOGLE_CF_MAX_BODY_SIZE_CAP,
};
