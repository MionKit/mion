/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// What `#bundled-api` resolves to when `bundleApi` is off: keeping the real module out takes
// @mionjs/core's marker reflection with it. A real file, not a virtual module: a `load` hook would
// change how esbuild and Bun read every other file too.

export const registerBundledApi = (): void => undefined;
export const takeBundledApiError = (): undefined => undefined;
export const resetBundledApi = (): void => undefined;
