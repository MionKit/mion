/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Split from client.ts like bundleApiMode.ts: request.ts reads the version per response and must not pull the
// client in. Process-wide, like the rest of the client's caches: two initClient calls against two servers share
// one set of rows, so they would share one version too.

import type {RpcError} from '@mionjs/core';

/** The API version this client was built against, injected at `initClient` by the build. */
let apiBuildVersion: string | undefined;
/** The version the server last answered with, once it differed from this build's. */
let serverApiVersion: string | undefined;
/** Ids whose row the server has since confirmed. A route is checked once, on its first use after the
 *  mismatch, so a client calling three of thirty routes never asks about the other twenty seven. */
const verifiedIds = new Set<string>();
let mismatchError: RpcError<'api-version-mismatch'> | undefined;

/** Called by generated code, never by hand: the value comes from the API's types. */
export function setApiBuildVersion(version: string | undefined): void {
  apiBuildVersion = version || undefined;
}

export function getApiBuildVersion(): string | undefined {
  return apiBuildVersion;
}

/** Records the version a response carried and says whether it differs from this build's. An end with no
 *  version knows too little to call it a mismatch, so a missing value on either side answers false. */
export function noteServerApiVersion(serverVersion: string | undefined | null): boolean {
  if (!serverVersion || !apiBuildVersion || serverVersion === apiBuildVersion) return false;
  serverApiVersion = serverVersion;
  return true;
}

/** The ids this request should ask the server to confirm: none until a mismatch, then each one once. */
export function unverifiedIds(ids: string[]): string[] {
  if (!serverApiVersion) return [];
  return ids.filter((id) => !verifiedIds.has(id));
}

/** Called once the server's rows for these ids are in hand, whether they replaced anything or matched. */
export function markApiVersionVerified(ids: string[]): void {
  for (const id of ids) verifiedIds.add(id);
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
  serverApiVersion = undefined;
  verifiedIds.clear();
  mismatchError = undefined;
}
