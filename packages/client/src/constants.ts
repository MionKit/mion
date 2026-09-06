/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ClientOptions} from './types.ts';

export const DEFAULT_PREFILL_OPTIONS: ClientOptions = {
  baseURL: '',
  fetchOptions: {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
  },
  /** Prefix for all routes, i.e: api/v1 */
  basePath: '',
  /** Suffix for all routes, i.e: .json */
  suffix: '',
  /** Enables automatic parameter validation */
  validateParams: true,
  sanitizeParams: true,
  /** Set true to automatically generate and id for every error */
  autoGenerateErrorId: false,
  /** Default first-call mode: fetch the metadata first, then encode with the route's own strategy */
  serializer: 'stringifyJson',
};

/** Maximum safe URL length for GET requests with ?data= query param */
export const MAX_GET_URL_LENGTH = 4096;

export const STORAGE_KEY = 'mion:client';

/** Key for request-scoped client errors (transport, platform, framework) in the RequestErrors map.
 * Deliberately NOT a route or middleFn id so these errors can never land in a subrequest's slot. */
export const CLIENT_REQUEST_ERROR_ID = 'mion-client-request';
