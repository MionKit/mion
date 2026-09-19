/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {isRpcError, MION_ROUTES, getRoutePath} from '@mionjs/core';
import {ClientOptions, RequestBody} from '../types.ts';
import {hydrateMetadataCache} from './clientMethodsMetadata.ts';
import {deserializeResponseBody} from './serializer.ts';
import {hasMethod} from './methods.ts';

/** Manually calls mionGetRemoteMethodsInfoById to get Remote Api Metadata.
 *  Part of the fetched lane, so a bundled client never reaches it: the request path refuses a
 *  method its bundle lacks before the lane is ever loaded. */
export async function fetchRemoteMethodsMetadata(
  methodIds: string[],
  options: ClientOptions,
  signal?: AbortSignal
): Promise<void> {
  await hydrateMetadataCache(options);
  const missingAfterLocal = methodIds.filter((path) => !hasMethod(path));
  if (!missingAfterLocal.length) return;
  const body: RequestBody = {
    [MION_ROUTES.methodsMetadataById]: [missingAfterLocal],
  };
  try {
    const path = getRoutePath([MION_ROUTES.methodsMetadataById], options);
    const url = new URL(path, options.baseURL);
    const response = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body),
      signal,
    });
    const deserialized = await deserializeResponseBody(response, options);
    const platformError = deserialized[MION_ROUTES.platformError];
    if (isRpcError(platformError)) throw platformError;
    const stillMissing = missingAfterLocal.filter((id) => !hasMethod(id));
    if (stillMissing.length) throw new Error(`Failed to fetch metadata for: ${stillMissing.join(', ')}`);
  } catch (error: any) {
    // Preserve abort/timeout DOMException so the caller's onError can classify it correctly
    if (signal?.aborted) throw error;
    throw new Error(`Error fetching validation and serialization metadata: ${error?.message}`);
  }
}
