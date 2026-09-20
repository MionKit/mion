/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// What `#metadata-from-server` resolves to under `bundleApi: 'bundled'`, where a client never asks the
// server how a route works. A real file rather than a virtual module: a `load` hook on the shared
// unplugin changes how esbuild and Bun read every OTHER file too. Each export only has to exist.

export const createMetadataSubRequest = () => ({pointer: [], id: '', isResolved: false, params: []});
export const extractAndProcessMetadata = (): void => undefined;
export const hydrateMetadataCache = (): Promise<void> => Promise.resolve();
export const purgeHydratedMetadata = (): Promise<void> => Promise.resolve();
export const takeMetadataCacheError = (): undefined => undefined;
export const wasHydratedFromCache = (): boolean => false;
export const fetchRemoteMethodsMetadata = (): Promise<void> => Promise.resolve();
