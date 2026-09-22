/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Reached on demand through `#api-version-recovery`, a package.json `imports` entry of @mionjs/client, so
// a client that never meets a mismatch ships none of this. Its own entry, not `#metadata-from-server`:
// @mionjs/devtools stubs that one out under `bundleApi: 'bundled'`, and this lane must survive there.

// The formats registry a bundled build leaves out: the fetched rows compile their functions through it.
import '@mionjs/run-types/formats';
import {RpcError, MION_ROUTES, getRoutePath, addRoutesToCache, addSerializedJitCaches, routesCache} from '@mionjs/core';
import type {MethodIdCheck, SerializableMethodsData} from '@mionjs/core';
import type {ClientOptions} from '../types.ts';
import {bundledMethodIds, dropBundledMethods, getMethod, setFetchedMethods} from './methods.ts';

/** Replaces the build-compiled rows the server no longer agrees with, and answers with the error the call
 *  reports once. Sends the client's own ids, so the server returns only the rows that really differ. */
export async function recoverFromApiVersionMismatch(
  options: ClientOptions,
  signal?: AbortSignal
): Promise<RpcError<'api-version-mismatch'>> {
  const ids = bundledMethodIds();
  try {
    if (ids.length) await replaceChangedMethods(ids, options, signal);
  } catch (error: any) {
    return mismatchError(`The client could not read them from the server: ${error?.message}`);
  }
  return mismatchError('Its routes were replaced with the ones the server declares now.');
}

async function replaceChangedMethods(ids: string[], options: ClientOptions, signal?: AbortSignal): Promise<void> {
  const knownIds: MethodIdCheck[] = [];
  for (const id of ids) {
    const method = getMethod(id);
    if (method) knownIds.push({id, paramsId: method.paramsJitHash, returnId: method.returnJitHash});
  }
  const path = getRoutePath([MION_ROUTES.methodsMetadataById], options);
  const response = await fetch(new URL(path, options.baseURL), {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    // The route parses its params as a clone, so the payload is plain JSON and needs no compiled encoder
    body: JSON.stringify({[MION_ROUTES.methodsMetadataById]: [ids, false, knownIds]}),
    signal,
  });
  const body = await response.json();
  const answer = body?.[MION_ROUTES.methodsMetadataById];
  const data = (Array.isArray(answer) ? answer[1] : answer) as SerializableMethodsData | undefined;
  if (!data?.methods) throw new Error('the server sent no methods');
  addSerializedJitCaches(data.deps, data.purFnDeps);
  // The bundled shelf wins over the fetched one, so the rows it replaces have to go first
  dropBundledMethods(Object.keys(data.methods));
  addRoutesToCache(data.methods);
  setFetchedMethods(routesCache);
}

function mismatchError(outcome: string): RpcError<'api-version-mismatch'> {
  return new RpcError({
    type: 'api-version-mismatch',
    publicMessage:
      `This mion client carries routes compiled against an older version of the API: the server answers with ` +
      `a different build version. ${outcome} Rebuild the client against the current API to stop paying for the ` +
      `extra request.`,
  });
}
