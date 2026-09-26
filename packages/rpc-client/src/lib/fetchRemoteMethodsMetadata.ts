/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {isRpcError, MION_ROUTES, getRoutePath, RpcError} from '@mionjs/core';
import {ClientOptions, RequestBody} from '../types.ts';
import {extractAndProcessMetadata, hydrateMetadataCache} from './clientMethodsMetadata.ts';
import {hasMethod} from './methods.ts';

/** The by-id route `mionMethodsMetadata` spreads into the routes, next to its middleware. */
export const METHODS_METADATA_BY_ID = 'mionMethodsMetadataById';

/** Fetched lane only: asks the by-id route for rows, without running any route. */
export async function fetchRemoteMethodsMetadata(
  methodIds: string[],
  options: ClientOptions,
  signal?: AbortSignal,
  byIdRouteId: string = METHODS_METADATA_BY_ID
): Promise<void> {
  await hydrateMetadataCache(options);
  const missingAfterLocal = methodIds.filter((path) => !hasMethod(path));
  if (!missingAfterLocal.length) return;
  const body: RequestBody = {[byIdRouteId]: [missingAfterLocal]};
  try {
    const path = getRoutePath(byIdRouteId.split('/'), options);
    const url = new URL(path, options.baseURL);
    const response = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body),
      signal,
    });
    // the route pins the built-in parser on both wires, so its answer is plain JSON
    const parsedBody = await response.json();
    const platformError = parsedBody?.[MION_ROUTES.thrownErrors]?.[MION_ROUTES.platformError];
    if (isRpcError(platformError)) throw new RpcError(platformError);
    extractAndProcessMetadata(byIdRouteId, parsedBody, options);
    const stillMissing = missingAfterLocal.filter((id) => !hasMethod(id));
    if (stillMissing.length) throw new Error(`Failed to fetch metadata for: ${stillMissing.join(', ')}`);
  } catch (error: any) {
    // Preserve the abort/timeout DOMException so the caller's onError can classify it
    if (signal?.aborted) throw error;
    throw new Error(`Error fetching validation and serialization metadata: ${error?.message}`);
  }
}
