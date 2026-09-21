/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {DEFAULT_MAX_BODY_SIZE} from '@mionjs/core';
import {VercelHandlerOptions} from './types.ts';

/** Vercel's 4.5 MB ceiling on a function, which no option can raise; override `maxBodySizeCap` if Vercel changes it. */
export const VERCEL_MAX_BODY_SIZE_CAP = 4_500_000;

export const DEFAULT_VERCEL_OPTIONS: VercelHandlerOptions = {
  defaultResponseHeaders: {},
  maxBodySize: DEFAULT_MAX_BODY_SIZE,
  maxBodySizeCap: VERCEL_MAX_BODY_SIZE_CAP,
};
