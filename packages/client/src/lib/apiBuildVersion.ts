/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Split from client.ts like bundleApiMode.ts: request.ts reads the version per response and must not pull the
// client in. Process-wide like the client's other caches: two initClient calls already share one set of rows.

import type {RpcError} from '@mionjs/core';

/** The API version this client was built against, injected at `initClient` by the build. */
let apiBuildVersion: string | undefined;
/** The version the server last answered with, once it differed from this build's. */
let serverApiVersion: string | undefined;
/** Ids the server has confirmed: each route is checked once, on its first use after the mismatch. */
const verifiedIds = new Set<string>();
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
  serverApiVersion = serverVersion;
  return true;
}

/** The ids to ask the server to confirm: none until a mismatch, then each one once. */
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
