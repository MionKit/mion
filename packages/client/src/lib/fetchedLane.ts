/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The one door into the fetched lane: the metadata request, the cache-into-store logic, the store
// engines, eviction and the persistence prompt. Nothing on the request path imports any of those
// directly, so a build that bundles the API can drop the lot; laneLoader.ts is what reaches this
// module, and only when a call actually needs it.

export {
  createMetadataSubRequest,
  extractAndProcessMetadata,
  hydrateMetadataCache,
  purgeHydratedMetadata,
  takeMetadataCacheError,
  wasHydratedFromCache,
} from './clientMethodsMetadata.ts';
export {fetchRemoteMethodsMetadata} from './fetchRemoteMethodsMetadata.ts';
