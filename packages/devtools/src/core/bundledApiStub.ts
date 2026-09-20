/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// What `#bundled-api` resolves to when `bundleApi` is off: nothing calls these, and keeping the real
// module out takes @mionjs/core's marker reflection with it. A real file rather than a virtual module,
// for the reason metadataFromServerStub.ts gives: a `load` hook changes how esbuild and Bun read every file.

export const registerBundledApi = (): void => undefined;
export const takeBundledApiError = (): undefined => undefined;
export const resetBundledApi = (): void => undefined;
