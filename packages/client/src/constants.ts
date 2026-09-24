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
    headers: {'Content-Type': 'application/json'},
  },
  /** Prefix for all routes, i.e: api/v1 */
  basePath: '',
  /** Suffix for all routes, i.e: .json */
  suffix: '',
  validateParams: true,
  sanitizeParams: true,
  /** Default first-call mode: fetch the metadata first, then encode with the route's own strategy */
  serializer: 'stringifyJson',
  /** Where the client keeps what it learned about the remote methods */
  storageEngine: DEFAULT_STORAGE_ENGINE,
};

/** Maximum safe URL length for GET requests with ?data= query param */
export const MAX_GET_URL_LENGTH = 4096;

export const STORAGE_KEY = 'mion:client';

/** What one server's metadata cache may hold before it drops its oldest entries; well under what a browser grants. */
export const METADATA_CACHE_MAX_BYTES = 8 * 1024 * 1024;

/** How many times a refused write may drop more old entries and retry before the app is told. */
export const METADATA_CACHE_EVICTION_ROUNDS = 5;

/** Key for request-scoped client errors (transport, platform, framework); deliberately NOT a route or
 * middleware id, so they can never land in a subrequest's slot. */
export const CLIENT_REQUEST_ERROR_ID = 'mion-client-request';
