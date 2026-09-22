/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RouterOptions} from './types/general.ts';
import {getENV} from '@mionjs/core';

export const IS_TEST_ENV = getENV('VITEST_WORKER_ID') !== undefined || getENV('NODE_ENV') === 'test';

export const DEFAULT_ROUTE_OPTIONS = {
  basePath: '',
  suffix: '',
  pathTransform: undefined,
  /** set to true to generate router spec for clients.  */
  getPublicRoutesData: process.env.GENERATE_ROUTER_SPEC === 'true',
  autoGenerateErrorId: false,
  /** Client routes are registered by default, and skipped under vitest or NODE_ENV=test. */
  skipClientRoutes: IS_TEST_ENV,
  /** Every chain step is awaited by default, so the chain keeps yielding between steps */
  alwaysAwait: true,
  /** A type-derived request limit is the JSON maximum times this factor */
  maxBodySizeFactor: 2,
  releaseRawBody: true,
  globalResponseHeaders: {},
  apiVersionCheck: true,
} as Readonly<RouterOptions>;

/** Carries the version of the API the server was built from; a client compares it with its own. */
export const BUILD_VERSION_HEADER = 'x-build-version';

export const MAX_ROUTE_NESTING = 10;
