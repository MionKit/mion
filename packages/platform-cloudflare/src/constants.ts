/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {DEFAULT_MAX_BODY_SIZE} from '@mionjs/core';
import {CloudflareHandlerOptions} from './types.ts';

/** Cloudflare's 100 MB ceiling on Free and Pro; override `maxBodySizeCap` on Business (200 MB) or Enterprise (500 MB). */
export const CLOUDFLARE_MAX_BODY_SIZE_CAP = 100_000_000;

export const DEFAULT_CLOUDFLARE_OPTIONS: CloudflareHandlerOptions = {
  defaultResponseHeaders: {},
  basePath: '',
  maxBodySize: DEFAULT_MAX_BODY_SIZE,
  maxBodySizeCap: CLOUDFLARE_MAX_BODY_SIZE_CAP,
};
