/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// What `#fetched-lane` resolves to under `bundleApi: 'bundled'`: a client whose whole API came with
// the build never asks the server how a route works, never stores an answer and never rebuilds a
// compiled function. It is a real file rather than a virtual module because a `load` hook on the
// shared unplugin changes how esbuild and Bun read every OTHER file too.
// A bundled client refuses a method its build did not carry before it reaches any of these, so each
// one only has to exist.

export const createMetadataSubRequest = () => ({pointer: [], id: '', isResolved: false, params: []});
export const extractAndProcessMetadata = (): void => undefined;
export const hydrateMetadataCache = (): Promise<void> => Promise.resolve();
export const purgeHydratedMetadata = (): Promise<void> => Promise.resolve();
export const takeMetadataCacheError = (): undefined => undefined;
export const wasHydratedFromCache = (): boolean => false;
export const fetchRemoteMethodsMetadata = (): Promise<void> => Promise.resolve();
