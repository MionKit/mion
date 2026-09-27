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

/** Either mode stops the call before its route; `all` answers every public method and the batch ids */
export type MethodsMetadataMode = 'only' | 'all';

export interface MethodsMetadataOnlyData {
  metadata: SerializableMethodsData;
  /** ids the server does not know, with the reason */
  notFound?: Record<string, string>;
  /** `all` asked, but the server has more methods than it answers at once: only the given ids came back */
  truncated?: boolean;
}

/** Stops the chain so the route never runs; carries the rows the client asked for */
export type MethodsMetadataOnly = FatalError<'metadata-only', MethodsMetadataOnlyData>;

/** No mode and no ids, no answer: a call that asks nothing pays nothing */
export type MethodsMetadataHandler = (
  ctx: any,
  methodsIds?: string[],
  mode?: MethodsMetadataMode
) => SerializableMethodsData | RpcError<'rpc-metadata-not-found'> | MethodsMetadataOnly | void;
