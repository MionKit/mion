/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {isRpcError, RpcError} from '@mionjs/core';
import type {SerializableMethodsData} from '@mionjs/core';
import type {FetchMetadataHandler as Handler} from '@mionjs/core/middlewares';
import type {ClientCallContext, ClientMiddlewareOf, RequestErrors, SubRequest} from '../types.ts';
import {getRoutePointers} from '../callContext.ts';
import {hasApiVersionMismatch} from '../lib/apiBuildVersion.ts';
import {hasMethod} from '../lib/methods.ts';
import {loadedMetadataFromServer, loadMetadataFromServer} from '../lib/metadataFromServerLoader.ts';
import {middlewareTargetOf, setMetadataFetcher, type MetadataCall, type MetadataFetcher} from '../lib/metadataFetcher.ts';

/** Client half of `mionFetchMetadata`: fetches unbundled routes' rows on first use. */
export function useFetchMetadata(middleware: ClientMiddlewareOf<Handler>): void {
  const {id, registry} = middlewareTargetOf(middleware);
  setMetadataFetcher(registry, createFetcher(id));
}

function createFetcher(id: string): MetadataFetcher {
  const fetchRows: MetadataFetcher['fetchRows'] = async (ids, routePointer, options, signal) => {
    const lane = await loadMetadataFromServer();
    await lane.fetchRemoteMethodsMetadata(ids, routePointer, options, signal, id);
  };
  return {fetchRows, startCall: (context) => startCall(id, context, fetchRows)};
}

/** The errors plain wire forms or stale rows cause: the server could not read what the client wrote. */
function failedOnWire(errors: RequestErrors): boolean {
  for (const error of errors.values()) {
    const type = error?.type;
    if (type === 'serialization-error' || type === 'validation-error' || type === 'parsing-json-request-error') return true;
  }
  return false;
}

function startCall(id: string, context: ClientCallContext, fetchRows: MetadataFetcher['fetchRows']): MetadataCall {
  const {options} = context;
  let optimistic = false;
  /** ids this attempt asked the server to confirm after a version mismatch */
  let verifying: string[] | undefined;
  let callIds: string[] = [];

  const addRowsRequest = (ids: string[]) => {
    context.subRequestList[id] = {pointer: id.split('/'), id, isResolved: false, params: [ids]} as SubRequest<any>;
  };

  return {
    id,

    async prepare(skipOptimistic) {
      delete context.subRequestList[id];
      const ids = Object.keys(context.subRequestList);
      callIds = ids;
      verifying = undefined;
      optimistic = false;
      if (!ids.every((methodId) => hasMethod(methodId))) {
        // One indexed read settles an id this page never heard of; guessing wrong costs a round trip AND its resend.
        await (await loadMetadataFromServer()).hydrateMetadataCache(options);
        optimistic = !skipOptimistic && !ids.every((methodId) => hasMethod(methodId));
        return {ids, optimistic};
      }
      // After a version mismatch each route is confirmed once, on first use, riding this request.
      // Needs the middleware's own row: it encodes the ids, and a server that never placed it cannot confirm.
      if (hasApiVersionMismatch(options.baseURL) && hasMethod(id)) {
        const unverified = (await loadMetadataFromServer()).unverifiedIds(options.baseURL, ids);
        if (unverified.length) {
          verifying = unverified;
          addRowsRequest(unverified);
        }
      }
      return {ids, optimistic};
    },

    askRows() {
      // Storing the server's copy over a BUNDLED method would let a later purge drop it for good.
      addRowsRequest(Object.keys(context.subRequestList).filter((methodId) => !hasMethod(methodId)));
    },

    fetchRows(ids, signal) {
      // sent to a route of this call, whose chain holds the metadata middleware
      const pointer = getRoutePointers(context)[0] ?? Object.values(context.subRequestList)[0].pointer;
      return fetchRows(ids, pointer, options, signal);
    },

    readRows(parsedBody) {
      if (!(id in parsedBody)) return;
      const slot = parsedBody[id];
      delete parsedBody[id];
      // a union answer rides the `[index, value]` envelope
      const value = Array.isArray(slot) ? slot[1] : slot;
      if (isRpcError(value)) return {[id]: new RpcError(value)};
      const rows = value as SerializableMethodsData | undefined;
      // only an attempt that loaded the lane asks for rows
      const lane = loadedMetadataFromServer();
      if (!rows?.methods || !lane) return;
      if (verifying) lane.verifyMethodRows(options, verifying, rows);
      else lane.installMethodRows(rows, options);
    },

    async shouldResend(errors) {
      if (!failedOnWire(errors) || context.signal?.aborted) return false;
      // the server read plain wire forms its decoders refused; the real encoders fix that
      if (optimistic) return true;
      // stored rows can predate the server's current build and nothing else would correct them
      const lane = loadedMetadataFromServer();
      if (lane && callIds.some((methodId) => lane.wasHydratedFromCache(methodId, options))) {
        await lane.purgeHydratedMetadata(callIds, options);
        return true;
      }
      // the server's build differs: the resend confirms the rows this call uses, and refreshes fetched ones
      return hasApiVersionMismatch(options.baseURL);
    },

    takeError: () => loadedMetadataFromServer()?.takeMetadataCacheError(),
  };
}
