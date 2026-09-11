/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {DEFAULT_MAX_BODY_SIZE} from '@mionjs/core';
import {CloudflareHandlerOptions} from './types.ts';

/** Cloudflare's own request ceiling on the Free and Pro plans, 100 MB, which no option can raise.
 *  Override `maxBodySizeCap` on a Business (200 MB) or Enterprise (500 MB) zone. */
export const CLOUDFLARE_MAX_BODY_SIZE_CAP = 100_000_000;

export const DEFAULT_CLOUDFLARE_OPTIONS: CloudflareHandlerOptions = {
  defaultResponseHeaders: {},
  basePath: '',
  maxBodySize: DEFAULT_MAX_BODY_SIZE,
  maxBodySizeCap: CLOUDFLARE_MAX_BODY_SIZE_CAP,
};
