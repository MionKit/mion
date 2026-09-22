/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Split from client.ts the way bundleApiMode.ts is: request.ts reads the version on every response and
// must not pull the client in.

/** The API version this client was built against, injected at `initClient` by the build. */
let apiBuildVersion: string | undefined;
/** One mismatch is acted on per process: the two versions never change, so a second is the same news. */
let mismatchHandled = false;

/** Called by generated code, never by hand: the value comes from the API's types. */
export function setApiBuildVersion(version: string | undefined): void {
  apiBuildVersion = version || undefined;
}

export function getApiBuildVersion(): string | undefined {
  return apiBuildVersion;
}

/** True the first time the server's version differs from this build's. A server that sends no version, and
 *  a client the build gave none, both answer false: neither end knows enough to call it a mismatch. */
export function takeApiVersionMismatch(serverVersion: string | undefined | null): boolean {
  if (mismatchHandled || !serverVersion || !apiBuildVersion || serverVersion === apiBuildVersion) return false;
  mismatchHandled = true;
  return true;
}

/** Tests only: forgets the injected version and the handled mismatch. */
export function resetApiBuildVersion(): void {
  apiBuildVersion = undefined;
  mismatchHandled = false;
}
