/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Kept off the main barrel, published on `@mionjs/core/middlewares`.

import type {FatalError, RpcError} from '../errors.ts';
import type {SerializableMethodsData} from './method.types.ts';

/** One type for both route sync refusals: the encoder cannot tell two `FatalError`s in a union apart */
export type RouteSyncError = FatalError<'route-types-mismatch' | 'route-sync-required', RouteSyncErrorData>;

export interface RouteSyncErrorData {
  /** 'route-types-mismatch': the routes whose ids differ */
  routeIds?: string[];
  /** 'route-sync-required': rows of the called routes and their chains, for the client to compute the ids */
  metadata?: SerializableMethodsData;
}

/** The route sync middleware's handler, typed here so the client installer needs no router import */
export type SyncRoutesHandler = (ctx: any, routeSyncIds?: string[]) => RouteSyncError | void;

/** The metadata middleware's handler: no ids, no answer, so a call that asks nothing pays nothing */
export type MethodsMetadataHandler = (
  ctx: any,
  methodsIds?: string[],
  getAllRemoteMethods?: boolean
) => SerializableMethodsData | RpcError<'rpc-metadata-not-found'> | void;

/** The by-id route's handler: rows without running any route, for `typeErrors()` and a body that cannot go out plain */
export type MethodsMetadataByIdHandler = (
  ctx: any,
  methodsIds: string[],
  getAllRemoteMethods?: boolean
) => SerializableMethodsData | RpcError<'rpc-metadata-not-found'>;
