/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// What `#fetched-lane` resolves to under `bundleApi: 'bundled'` on Turbopack, which has no plugin
// API for the virtual module every other bundler gets. A bundled client refuses a method its build
// did not carry before it ever reaches any of these, so each one only has to exist.

export const createMetadataSubRequest = () => ({pointer: [], id: '', isResolved: false, params: []});
export const extractAndProcessMetadata = (): void => undefined;
export const hydrateMetadataCache = (): Promise<void> => Promise.resolve();
export const purgeHydratedMetadata = (): Promise<void> => Promise.resolve();
export const takeMetadataCacheError = (): undefined => undefined;
export const wasHydratedFromCache = (): boolean => false;
export const fetchRemoteMethodsMetadata = (): Promise<void> => Promise.resolve();
