/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The version check rides every response, so it cannot be lazily loaded; what a mismatch then does lives in
// apiVersionRecovery.ts, behind `#metadata-from-server`. Split from client.ts like bundleApiMode.ts: request.ts
// must not pull the client in. The build version is the program's; a mismatch is kept per server (baseURL).

import type {RpcError} from '@mionjs/core';

/** The API version this client was built against, injected at `initClient` by the build. */
let apiBuildVersion: string | undefined;
/** The servers (baseURLs) that answered with a version other than this build's. */
const mismatchedServers = new Set<string>();
let mismatchError: RpcError<'api-version-mismatch'> | undefined;

/** Called by generated code, never by hand: the value comes from the API's types. */
export function setApiBuildVersion(version: string | undefined): void {
  apiBuildVersion = version || undefined;
}

export function getApiBuildVersion(): string | undefined {
  return apiBuildVersion;
}

/** A missing version on either side answers false: an end with no version knows too little to call it a mismatch. */
export function noteServerApiVersion(baseURL: string, serverVersion: string | undefined | null): boolean {
  if (!serverVersion || !apiBuildVersion || serverVersion === apiBuildVersion) return false;
  mismatchedServers.add(baseURL);
  return true;
}

/** Whether the recovery module is worth loading for this server: nothing else in this file reaches it. */
export function hasApiVersionMismatch(baseURL: string): boolean {
  return mismatchedServers.has(baseURL);
}

/** Held for the next call's undeclared slot, beside the bundled-API error: the call itself ran. */
export function stashApiVersionError(error: RpcError<'api-version-mismatch'>): void {
  mismatchError = error;
}

/** The mismatch error, reported once. */
export function takeApiVersionError(): RpcError<'api-version-mismatch'> | undefined {
  const error = mismatchError;
  mismatchError = undefined;
  return error;
}

/** Tests only: forgets the injected version and the mismatch. */
export function resetApiBuildVersion(): void {
  apiBuildVersion = undefined;
  mismatchedServers.clear();
  mismatchError = undefined;
}
