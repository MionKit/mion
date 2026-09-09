/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ClientOptions} from './types.ts';
import type {StorageEngine} from './lib/storage.ts';

/** The engine the client uses when an app does not name one. */
export const DEFAULT_STORAGE_ENGINE: StorageEngine = 'indexeddb';

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
  /** Where the client keeps what it learned about the remote methods */
  storageEngine: DEFAULT_STORAGE_ENGINE,
};

/** Maximum safe URL length for GET requests with ?data= query param */
export const MAX_GET_URL_LENGTH = 4096;

export const STORAGE_KEY = 'mion:client';

/** How much of the browser's space the metadata cache will use for one server before it starts
 *  dropping its oldest entries. Well under what a browser normally grants, so the cache stays a
 *  good neighbour to whatever else the page stores. */
export const METADATA_CACHE_MAX_BYTES = 8 * 1024 * 1024;

/** How many times a refused write may drop another batch of old entries and try again before the
 *  failure is reported to the app. */
export const METADATA_CACHE_EVICTION_ROUNDS = 5;

/** Key for request-scoped client errors (transport, platform, framework) in the RequestErrors map.
 * Deliberately NOT a route or middleFn id so these errors can never land in a subrequest's slot. */
export const CLIENT_REQUEST_ERROR_ID = 'mion-client-request';
