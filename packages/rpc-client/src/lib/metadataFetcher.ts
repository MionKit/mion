/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Internal hooks between the dispatch and `useMethodsMetadata`. Never exported from the package: the public
// middleware type stays hooks only, and a client that never sets metadata fetching up ships none of it.

import type {RpcError} from '@mionjs/core';
import type {ClientCallContext, ClientOptions, RequestErrors} from '../types.ts';
import type {HandlersRegistry} from './handlersRegistry.ts';

/** What `useMethodsMetadata` hands the dispatch, once per client. */
export interface MetadataFetcher {
  /** Rows for the given ids without running any route; route sync refetches through it. */
  fetchRows(ids: string[], routePointer: string[], options: ClientOptions, signal?: AbortSignal): Promise<void>;
  startCall(context: ClientCallContext): MetadataCall;
}

/** One call's metadata state, driven by the dispatch attempt by attempt. */
export interface MetadataCall {
  /** the metadata middleware's id: the rows a call asks for ride the request under it */
  readonly id: string;
  /** Before the chain is read. `ids` omits its own entry; `optimistic`: sent before rows are known, in plain wire forms. */
  prepare(skipOptimistic: boolean): Promise<{ids: string[]; optimistic: boolean}>;
  /** Optimistic attempt: asks the server for the rows of every id in the call. */
  askRows(): void;
  /** Rows for the given ids without running any route: `typeErrors()`, a body that cannot go out plain. */
  fetchRows(ids: string[], signal?: AbortSignal): Promise<void>;
  /** Takes this call's rows out of the raw body before anything is decoded; returns a refusal to put back. */
  readRows(parsedBody: Record<string, unknown>): Record<string, RpcError<string>> | undefined;
  /** After a failed attempt: true when a resend with fresh rows can fix it. Called at most once per call. */
  shouldResend(errors: RequestErrors): Promise<boolean>;
  /** a store write the browser refused, reported once in a later call's undeclared slot */
  takeError(): RpcError<string> | undefined;
}

/** A middleware's client and id, read off `middlewares.<name>` through a key no public type names. */
export const MIDDLEWARE_TARGET = Symbol('mion.middlewareTarget');

export interface MiddlewareTarget {
  id: string;
  registry: HandlersRegistry;
}

const fetchers = new WeakMap<HandlersRegistry, MetadataFetcher>();

const readTarget = (middleware: object) => (middleware as {[MIDDLEWARE_TARGET]?: MiddlewareTarget})[MIDDLEWARE_TARGET];

export function middlewareTargetOf(middleware: object): MiddlewareTarget {
  const target = readTarget(middleware);
  if (!target) throw new Error('Expected a middleware from the client, like middlewares.mionMethodsMetadata');
  return target;
}

export function setMetadataFetcher(registry: HandlersRegistry, fetcher: MetadataFetcher): void {
  fetchers.set(registry, fetcher);
}

export function getMetadataFetcher(registry: HandlersRegistry | undefined): MetadataFetcher | undefined {
  return registry && fetchers.get(registry);
}

/** The fetcher of the client a middleware belongs to, if it set one up; route sync refetches through it. */
export function metadataFetcherOf(middleware: object): MetadataFetcher | undefined {
  return getMetadataFetcher(readTarget(middleware)?.registry);
}
