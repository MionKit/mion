/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The one door into the fetched lane: the metadata request, the cache-into-store logic, the store
// engines, eviction and the persistence prompt. The request path imports none of them directly, so
// a build that bundles the API drops the lot; only the loader next door reaches this, when a call needs it.

export {
  createMetadataSubRequest,
  extractAndProcessMetadata,
  hydrateMetadataCache,
  purgeHydratedMetadata,
  takeMetadataCacheError,
  wasHydratedFromCache,
} from './clientMethodsMetadata.ts';
export {fetchRemoteMethodsMetadata} from './fetchRemoteMethodsMetadata.ts';
