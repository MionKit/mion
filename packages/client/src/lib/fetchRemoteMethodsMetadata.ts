/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {isRpcError, MION_ROUTES, RpcError, getRoutePath, routesCache} from '@mionjs/core';
import {getBundleApiMode} from './bundledApi.ts';
import {ClientOptions, RequestBody} from '../types.ts';
import {hydrateMetadataCache} from './clientMethodsMetadata.ts';
import {deserializeResponseBody} from './serializer.ts';

/** The error a `bundled` client raises for a method its bundle does not carry: the build only
 *  bundles what the program calls through its own dispatch points, so the server is never asked. */
export function bundledMetadataMissingError(missing: string[]): RpcError<'route-metadata-not-found'> {
  return new RpcError({
    type: 'route-metadata-not-found',
    publicMessage:
      `Metadata for ${missing.join(', ')} is not in the bundle. The build (bundleApi: 'bundled') bundles only the routes ` +
      `and middleFns the program calls through their own call sites; a method reached another way (a generic helper, ` +
      `client.prefill(...) / client.typeErrors(...), a call the build reported) is not fetched either. ` +
      `Call it through its own subrequest, or build with bundleApi: 'mixed' to fetch what the bundle lacks.`,
  });
}

/** Manually calls mionGetRemoteMethodsInfoById to get Remote Api Metadata */
export async function fetchRemoteMethodsMetadata(
  methodIds: string[],
  options: ClientOptions,
  signal?: AbortSignal
): Promise<void> {
  // a bundled client never asks the server nor the store: what the build did not bundle is an error
  if (getBundleApiMode() === 'bundled') {
    const missing = methodIds.filter((id) => !routesCache.hasMetadata(id));
    if (missing.length) throw bundledMetadataMissingError(missing);
    return;
  }
  await hydrateMetadataCache(options);
  const missingAfterLocal = methodIds.filter((path) => !routesCache.hasMetadata(path));
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
    const stillMissing = missingAfterLocal.filter((id) => !routesCache.hasMetadata(id));
    if (stillMissing.length) throw new Error(`Failed to fetch metadata for: ${stillMissing.join(', ')}`);
  } catch (error: any) {
    // Preserve abort/timeout DOMException so the caller's onError can classify it correctly
    if (signal?.aborted) throw error;
    throw new Error(`Error fetching validation and serialization metadata: ${error?.message}`);
  }
}
