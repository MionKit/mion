/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Split from bundledApi.ts, which reaches the marker reflection in @mionjs/core that client.ts does not need.

let apiBundled = false;

/** Called by generated code, never by hand: bundling the API is a build option. */
export function setApiBundled(): void {
  apiBundled = true;
}

export function isApiBundled(): boolean {
  return apiBundled;
}
