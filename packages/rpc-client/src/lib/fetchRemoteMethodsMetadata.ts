/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {isRpcError, MION_ROUTES, getRoutePath, RpcError, getRouterItemId} from '@mionjs/core';
import type {MethodsMetadataOnlyData} from '@mionjs/core/middlewares';
import {ClientOptions} from '../types.ts';
import {hydrateMetadataCache, installMethodRows} from './clientMethodsMetadata.ts';
import {hasMethod} from './methods.ts';

/** The key `mionMethodsMetadata` sits under when placed by its own name. */
const METHODS_METADATA_ID = 'mionMethodsMetadata';

/** Sent to a route's path: the metadata middleware answers and stops the call before the route runs. */
export async function fetchRemoteMethodsMetadata(
  methodIds: string[],
  routePointer: string[],
  options: ClientOptions,
  signal?: AbortSignal,
  middlewareId: string = METHODS_METADATA_ID
): Promise<void> {
  await hydrateMetadataCache(options);
  const missingAfterLocal = methodIds.filter((path) => !hasMethod(path));
  if (!missingAfterLocal.length) return;
  const body: Record<string, unknown> = {
    [middlewareId]: [missingAfterLocal, 'only'],
    // not params: a server without the middleware refuses this slot instead of running the route
    [getRouterItemId(routePointer)]: 'metadata-only',
  };
  try {
    const url = new URL(getRoutePath(routePointer, options), options.baseURL);
    const response = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body),
      signal,
    });
    // the middleware pins the built-in parser on both wires, so its answer is plain JSON
    const parsedBody = await response.json();
    const platformError = parsedBody?.[MION_ROUTES.thrownErrors]?.[MION_ROUTES.platformError];
    if (isRpcError(platformError)) throw new RpcError(platformError);
    const slot = parsedBody?.[middlewareId];
    // a union answer rides the `[index, value]` envelope
    const answer = (Array.isArray(slot) ? slot[1] : slot) as RpcError<string, MethodsMetadataOnlyData> | undefined;
    if (!isRpcError(answer) || answer.type !== 'metadata-only' || !answer.errorData?.metadata)
      throw new Error(`the server answered no metadata; place ${middlewareId} first in its routes`);
    installMethodRows(answer.errorData.metadata, options);
    const stillMissing = missingAfterLocal.filter((id) => !hasMethod(id));
    if (stillMissing.length) throw new Error(`Failed to fetch metadata for: ${stillMissing.join(', ')}`);
  } catch (error: any) {
    // Preserve the abort/timeout DOMException so the caller's onError can classify it
    if (signal?.aborted) throw error;
    throw new Error(`Error fetching validation and serialization metadata: ${error?.message}`);
  }
}
