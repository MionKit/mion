/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Internal hooks between the dispatch and `useMethodsMetadata`. Never exported from the package: the public
// middleware type stays hooks only, and a client that never sets metadata fetching up ships none of it.

import type {RpcError} from '@mionjs/core';
import type {ClientCallContext, ClientOptions} from '../types.ts';
import type {HandlersRegistry} from './handlersRegistry.ts';

/** What `useMethodsMetadata` hands the dispatch, once per client. */
export interface MetadataFetcher {
  /** the metadata middleware's id: the rows a call asks for ride the request under it */
  readonly id: string;
  /** Rows for the given ids without running any route: `typeErrors()`, a body that cannot go out plain. */
  fetchRows(ids: string[], options: ClientOptions, signal?: AbortSignal): Promise<void>;
  startCall(context: ClientCallContext): MetadataCall;
  /** a store write the browser refused, reported once in a later call's undeclared slot */
  takeError(): RpcError<string> | undefined;
}

/** One call's metadata state, driven by the dispatch attempt by attempt. */
export interface MetadataCall {
  /** Before the chain is read: restores the store, asks for verification after a version mismatch.
   *  True when the attempt goes out before the rows are known, in plain wire forms. */
  prepare(ids: string[]): Promise<boolean>;
  /** Optimistic attempt: asks the server for the rows of the given ids along with the call. */
  askRows(ids: string[]): void;
  /** Takes this call's rows out of the raw body before anything is decoded; returns a refusal to put back. */
  readRows(parsedBody: Record<string, unknown>): Record<string, unknown> | undefined;
  /** After a failed attempt: true when a resend with fresh rows can fix it. Called at most once per call. */
  shouldResend(failedOnWire: boolean): Promise<boolean>;
}

/** A middleware's client and id, read off `middlewares.<name>` through a key no public type names. */
export const MIDDLEWARE_TARGET = Symbol('mion.middlewareTarget');

export interface MiddlewareTarget {
  id: string;
  registry: HandlersRegistry;
}

const fetchers = new WeakMap<HandlersRegistry, MetadataFetcher>();

export function middlewareTargetOf(middleware: object): MiddlewareTarget {
  const target = (middleware as {[MIDDLEWARE_TARGET]?: MiddlewareTarget})[MIDDLEWARE_TARGET];
  if (!target) throw new Error('Expected a middleware from the client, like middlewares.mionMethodsMetadata');
  return target;
}

export function setMetadataFetcher(registry: HandlersRegistry, fetcher: MetadataFetcher): void {
  fetchers.set(registry, fetcher);
}

export function getMetadataFetcher(registry: HandlersRegistry): MetadataFetcher | undefined {
  return fetchers.get(registry);
}

/** The fetcher of the client a middleware belongs to, if it set one up; route sync refetches through it. */
export function metadataFetcherOf(middleware: object): MetadataFetcher | undefined {
  const target = (middleware as {[MIDDLEWARE_TARGET]?: MiddlewareTarget})[MIDDLEWARE_TARGET];
  return target && fetchers.get(target.registry);
}
