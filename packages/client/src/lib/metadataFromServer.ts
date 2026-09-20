/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The one door into the fetched lane: the metadata request, the cache-into-store logic, the store
// engines, eviction and the persistence prompt. The request path imports none of them directly, so
// a build that bundles the API drops the lot; only the loader next door reaches this, when a call needs it.

// Side-effect: the format pure fns the fetched lane needs. A build-time client gets every pure fn
// body injected into its own generated tree, but fns that arrive over the wire do not carry the
// run-types-owned ones (router/src/lib/remoteMethods.ts skips them), so the fetched lane is the
// one road that must register them locally. Under `bundled` devtools stubs this module, and the
// registration goes with it.
import '@mionjs/run-types/formats';

export {
  createMetadataSubRequest,
  extractAndProcessMetadata,
  hydrateMetadataCache,
  purgeHydratedMetadata,
  takeMetadataCacheError,
  wasHydratedFromCache,
} from './clientMethodsMetadata.ts';
export {fetchRemoteMethodsMetadata} from './fetchRemoteMethodsMetadata.ts';
