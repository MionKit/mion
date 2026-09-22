/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The whole version check, and nothing else: it rides every response, so it is the one part that cannot be
// lazily loaded. What a mismatch then does lives in apiVersionRecovery.ts, behind `#api-version-recovery`.
// Split from client.ts like bundleApiMode.ts: request.ts reads the version per response and must not pull the
// client in. Process-wide, like the rest of the client's caches: two initClient calls against two servers share
// one set of rows, so they would share one version too.

import type {RpcError} from '@mionjs/core';

/** The API version this client was built against, injected at `initClient` by the build. */
let apiBuildVersion: string | undefined;
/** True once a response carried a version other than this build's. */
let mismatched = false;
let mismatchError: RpcError<'api-version-mismatch'> | undefined;

/** Called by generated code, never by hand: the value comes from the API's types. */
export function setApiBuildVersion(version: string | undefined): void {
  apiBuildVersion = version || undefined;
}

export function getApiBuildVersion(): string | undefined {
  return apiBuildVersion;
}

/** A missing version on either side answers false: an end with no version knows too little to call it a mismatch. */
export function noteServerApiVersion(serverVersion: string | undefined | null): boolean {
  if (!serverVersion || !apiBuildVersion || serverVersion === apiBuildVersion) return false;
  mismatched = true;
  return true;
}

/** Whether the recovery module is worth loading: nothing else in this file reaches it. */
export function hasApiVersionMismatch(): boolean {
  return mismatched;
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
  mismatched = false;
  mismatchError = undefined;
}
