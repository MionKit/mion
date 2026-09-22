/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Imported on demand through `#api-version-recovery`, so a client that never meets a mismatch ships none of this.
// Its own imports entry, not `#metadata-from-server`: @mionjs/devtools stubs that one out under `bundleApi: 'bundled'`.

// The formats registry a bundled build leaves out: the fetched rows compile their functions through it.
import '@mionjs/run-types/formats';
import {RpcError, MION_ROUTES, getRoutePath, addRoutesToCache, addSerializedJitCaches, routesCache} from '@mionjs/core';
import type {MethodIdCheck, SerializableMethodsData} from '@mionjs/core';
import type {ClientOptions} from '../types.ts';
import {settleApiVersionMismatch} from './apiBuildVersion.ts';
import {bundledMethodIds, dropBundledMethods, getMethod, setFetchedMethods} from './methods.ts';

/** One recovery at a time: several requests in flight all see the same differing header, and each would
 *  otherwise start its own. Cleared when it settles, so a failed one can be tried again. */
let inFlight: Promise<RpcError<'api-version-mismatch'> | undefined> | undefined;

/** Replaces the rows the server no longer agrees with, or answers undefined when there is nothing to replace.
 *  Sends the client's own ids, so the server returns only the rows that really differ. */
export function recoverFromApiVersionMismatch(
  options: ClientOptions,
  signal?: AbortSignal
): Promise<RpcError<'api-version-mismatch'> | undefined> {
  return (inFlight ??= runRecovery(options, signal).finally(() => {
    inFlight = undefined;
  }));
}

async function runRecovery(options: ClientOptions, signal?: AbortSignal): Promise<RpcError<'api-version-mismatch'> | undefined> {
  const ids = bundledMethodIds();
  // A fetched client carries no build-compiled rows to correct, and its stored cache is another change's job.
  if (!ids.length) {
    settleApiVersionMismatch();
    return undefined;
  }
  let replaced = 0;
  try {
    replaced = await replaceChangedMethods(ids, options, signal);
  } catch (error: any) {
    // Left unsettled on purpose: the next response tries again rather than calling stale routes in silence.
    return mismatchError(`The client could not read them from the server: ${error?.message}`);
  }
  settleApiVersionMismatch();
  return mismatchError(
    replaced
      ? `${replaced} of its routes were replaced with the ones the server declares now.`
      : 'None of its routes changed, so nothing was replaced.'
  );
}

/** Returns how many rows the server sent back, which is how many really differed. */
async function replaceChangedMethods(ids: string[], options: ClientOptions, signal?: AbortSignal): Promise<number> {
  const knownIds: MethodIdCheck[] = [];
  for (const id of ids) {
    const method = getMethod(id);
    if (method) knownIds.push({id, paramsJitHash: method.paramsJitHash, returnJitHash: method.returnJitHash});
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
  const changed = Object.keys(data.methods);
  if (!changed.length) return 0;
  addSerializedJitCaches(data.deps, data.purFnDeps);
  // The bundled shelf wins over the fetched one, so the rows it replaces have to go first
  dropBundledMethods(changed);
  addRoutesToCache(data.methods);
  setFetchedMethods(routesCache);
  return changed.length;
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
