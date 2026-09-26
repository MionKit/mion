/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RouterOptions} from './types/general.ts';
import {MION_ROUTES} from '@mionjs/core';

export const DEFAULT_ROUTE_OPTIONS = {
  basePath: '',
  suffix: '',
  pathTransform: undefined,
  /** set to true to generate router spec for clients.  */
  getPublicRoutesData: process.env.GENERATE_ROUTER_SPEC === 'true',
  autoGenerateErrorId: false,
  /** Every chain step is awaited by default, so the chain keeps yielding between steps */
  alwaysAwait: true,
  /** A type-derived request limit is the JSON maximum times this factor */
  maxBodySizeFactor: 2,
  releaseRawBody: true,
  globalResponseHeaders: {},
  apiVersionCheck: true,
} as Readonly<RouterOptions>;

export const MAX_ROUTE_NESTING = 10;

/** mion's own ids, never exposed to clients */
export const mionInternalRouteIds: ReadonlySet<string> = new Set(Object.values(MION_ROUTES));
