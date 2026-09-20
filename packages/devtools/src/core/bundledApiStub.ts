/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// What `#bundled-api` resolves to when `bundleApi` is off, where no dispatch point ever receives
// injected metadata and nothing calls these. Keeping the real module out takes the marker
// reflection in @mionjs/core with it. A real file rather than a virtual module, for the reason
// metadataFromServerStub.ts gives: a `load` hook changes how esbuild and Bun read every other file.

export const registerBundledApi = (): void => undefined;
export const takeBundledApiError = (): undefined => undefined;
export const resetBundledApi = (): void => undefined;
