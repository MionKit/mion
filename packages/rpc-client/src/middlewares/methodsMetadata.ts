/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {isRpcError, RpcError} from '@mionjs/core';
import type {SerializableMethodsData} from '@mionjs/core';
import type {MethodsMetadataHandler as Handler} from '@mionjs/core/middlewares';
import type {ClientCallContext, ClientMiddlewareOf, SubRequest} from '../types.ts';
import {hasApiVersionMismatch} from '../lib/apiBuildVersion.ts';
import {hasMethod} from '../lib/methods.ts';
import {loadedMetadataFromServer, loadMetadataFromServer} from '../lib/metadataFromServerLoader.ts';
import {middlewareTargetOf, setMetadataFetcher, type MetadataCall, type MetadataFetcher} from '../lib/metadataFetcher.ts';

/** Client half of `mionMethodsMetadata`: fetches the rows of routes the build did not bundle, on first use.
 *  Needed only when `bundleApi` is `false` or `'mixed'`; a fully bundled client never asks. */
export function useMethodsMetadata(middleware: ClientMiddlewareOf<Handler>): void {
  const {id, registry} = middlewareTargetOf(middleware);
  setMetadataFetcher(registry, createFetcher(id));
}

// the by-id route is spread next to its middleware, so it shares the middleware's group
function byIdRouteOf(id: string): string {
  return `${id}ById`;
}

function createFetcher(id: string): MetadataFetcher {
  const byIdRouteId = byIdRouteOf(id);
  const fetchRows = async (ids: string[], options: ClientCallContext['options'], signal?: AbortSignal) => {
    const lane = await loadMetadataFromServer();
    await lane.fetchRemoteMethodsMetadata(ids, options, signal, byIdRouteId);
  };
  return {
    id,
    fetchRows,
    startCall: (context) => startCall(id, context),
    takeError: () => loadedMetadataFromServer()?.takeMetadataCacheError(),
  };
}

function startCall(id: string, context: ClientCallContext): MetadataCall {
  const {options} = context;
  let optimistic = false;
  /** ids this attempt asked the server to confirm after a version mismatch */
  let verifying: string[] | undefined;
  let callIds: string[] = [];

  const addRowsRequest = (ids: string[]) => {
    context.subRequestList[id] = {pointer: id.split('/'), id, isResolved: false, params: [ids]} as SubRequest<any>;
  };

  return {
    async prepare(ids) {
      callIds = ids;
      verifying = undefined;
      optimistic = false;
      delete context.subRequestList[id];
      if (!ids.every((methodId) => hasMethod(methodId))) {
        // One indexed read settles an id this page never heard of; guessing wrong costs a round trip AND its resend.
        await (await loadMetadataFromServer()).hydrateMetadataCache(options);
        optimistic = !ids.every((methodId) => hasMethod(methodId));
        return optimistic;
      }
      // After a version mismatch each route is confirmed once, on its first use, riding this request. The
      // middleware's own row writes the ids, and a server that never placed it has nothing to confirm with.
      if (hasApiVersionMismatch(options.baseURL) && hasMethod(id)) {
        const unverified = (await loadMetadataFromServer()).unverifiedIds(options.baseURL, ids);
        if (unverified.length) {
          verifying = unverified;
          addRowsRequest(unverified);
        }
      }
      return false;
    },

    askRows(ids) {
      // Storing the server's copy over a BUNDLED method would let a later purge drop it for good.
      addRowsRequest(ids.filter((methodId) => !hasMethod(methodId)));
    },

    readRows(parsedBody) {
      if (!(id in parsedBody)) return;
      const slot = parsedBody[id];
      delete parsedBody[id];
      // a union answer rides the `[index, value]` envelope
      const value = Array.isArray(slot) ? slot[1] : slot;
      if (isRpcError(value)) return {[id]: new RpcError(value)};
      const rows = value as SerializableMethodsData | undefined;
      if (!rows?.methods) return;
      // Only the lane can have asked, so it is loaded; the rows install before anything else in the body decodes.
      const lane = loadedMetadataFromServer()!;
      if (verifying) lane.verifyMethodRows(options, verifying, rows);
      else lane.installMethodRows(rows, options);
    },

    async shouldResend(failedOnWire) {
      if (!failedOnWire || context.signal?.aborted) return false;
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
  };
}
