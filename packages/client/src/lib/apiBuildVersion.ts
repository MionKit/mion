/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Split from client.ts like bundleApiMode.ts: request.ts reads the version per response and must not pull the client in.

import type {RpcError} from '@mionjs/core';

/** The API version this client was built against, injected at `initClient` by the build. */
let apiBuildVersion: string | undefined;
/** Set once a recovery finished: the two versions never change, so a second mismatch is the same news.
 *  NOT set at detection, or one failed recovery would leave the client calling stale routes in silence. */
let mismatchSettled = false;
let mismatchError: RpcError<'api-version-mismatch'> | undefined;

/** Called by generated code, never by hand: the value comes from the API's types. */
export function setApiBuildVersion(version: string | undefined): void {
  apiBuildVersion = version || undefined;
}

export function getApiBuildVersion(): string | undefined {
  return apiBuildVersion;
}

/** Whether the server was built from a different API than this client. An end with no version knows too little
 *  to call it a mismatch, so both missing values answer false. */
export function apiVersionDiffers(serverVersion: string | undefined | null): boolean {
  if (mismatchSettled || !serverVersion || !apiBuildVersion) return false;
  return serverVersion !== apiBuildVersion;
}

/** Called by the recovery once it has nothing left to do, whether it replaced rows or found none to replace. */
export function settleApiVersionMismatch(): void {
  mismatchSettled = true;
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

/** Tests only: forgets the injected version and everything a mismatch left behind. */
export function resetApiBuildVersion(): void {
  apiBuildVersion = undefined;
  mismatchSettled = false;
  mismatchError = undefined;
}
