/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// `#bundled-api` under clientRoutes 'fetch', so @mionjs/core's marker reflection stays out of the bundle.
// A real file, not a virtual module: a `load` hook would change how esbuild and Bun read every other file.

export const registerBundledApi = (): void => undefined;
export const takeBundledApiError = (): undefined => undefined;
export const resetBundledApi = (): void => undefined;
