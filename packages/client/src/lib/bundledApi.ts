/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
  HandlerType,
  RpcError,
  getHeadersReflectionFromMarkers,
  getReflectionFromMarkers,
  routesCache,
  type MethodWithOptsAndJitFns,
  type RemoteMethodOpts,
  type RtMarkerPayload,
} from '@mionjs/core';

// The bundled-API lane (the build's `bundleApi` option). A build with it on compiles, for every
// route the program calls, the same validators and serializers the server holds, and injects at
// each dispatch point (`.call()`, `.prefill()`, `.typeErrors()`, a batch's `.call()`) a module
// carrying that route plus the middleFns of its chain: metadata rows and the very marker payload
// a server helper receives (live function tuples, nothing to evaluate). This registers such a
// payload into the routes cache through the same reflection the router runs at initRoutes, so a
// bundled method looks exactly like a fetched one to the rest of the client, hash for hash.

/** One method of a bundled payload: the metadata the server would answer with plus its marker payload. */
export interface BundledMethod {
  id: string;
  pointer: string[];
  nestLevel: number;
  type: number;
  isAsync: boolean;
  options: RemoteMethodOpts;
  middleFnIds?: string[];
  rtFns: RtMarkerPayload;
}

/** What the build injects at a dispatch point: the method called plus every middleFn in its chain. */
export interface BundledApiPayload {
  methods: BundledMethod[];
}

/** The ids whose metadata came from a bundle; a fetched or restored answer never replaces them. */
const bundledIds = new Set<string>();

/** Registers a bundled payload, once per method id. Idempotent and cheap on repeat: a dispatch point
 *  passes the same module on every call. */
export function registerBundledApi(payload: unknown): void {
  if (!isBundledApiPayload(payload)) {
    throw new RpcError({
      type: 'bundle-api-invalid-payload',
      publicMessage:
        'The bundled API metadata injected at this call is not what the build writes; rebuild with a matching @mionjs/devtools.',
    });
  }
  for (const method of payload.methods) {
    if (bundledIds.has(method.id)) continue;
    // a fetched or restored entry for the same id gives way: the bundle is what the build compiled
    routesCache.removeMetadata(method.id);
    routesCache.setMethodJitFns(method.id, bundledMethodToCacheEntry(method));
    bundledIds.add(method.id);
  }
}

/** True when the method's metadata came from a bundle. */
export function isBundledMethod(id: string): boolean {
  return bundledIds.has(id);
}

/** Forgets which ids came from a bundle. Tests only (the routes cache is reset alongside). */
export function resetBundledApi(): void {
  bundledIds.clear();
}

function isBundledApiPayload(value: unknown): value is BundledApiPayload {
  return typeof value === 'object' && value !== null && Array.isArray((value as BundledApiPayload).methods);
}

/** A bundled method never carries a handler; the reflection reads everything off the marker payload
 *  and the row, so the placeholder is never called. */
const noHandler = () => undefined;

function bundledMethodToCacheEntry(method: BundledMethod): MethodWithOptsAndJitFns {
  const reflection =
    method.type === HandlerType.headersMiddleFn
      ? getHeadersReflectionFromMarkers(method.rtFns, noHandler, method.id)
      : getReflectionFromMarkers(method.rtFns, noHandler, method.id);
  const entry: MethodWithOptsAndJitFns = {
    type: method.type,
    id: method.id,
    pointer: method.pointer,
    nestLevel: method.nestLevel,
    // the build answered this off the server handler's declared return; the placeholder above cannot
    isAsync: method.isAsync,
    hasReturnData: reflection.hasReturnData,
    paramsCount: reflection.paramsCount,
    paramNames: reflection.paramNames,
    paramsJitHash: reflection.paramsJitHash,
    returnJitHash: reflection.returnJitHash,
    paramsJitFns: reflection.paramsJitFns,
    returnJitFns: reflection.returnJitFns,
    // `options.maxBodySize` is the route's own declared limit or nothing: the number the server
    // settles for a chain that declares none (its types times the router factor, else the platform
    // adapter's) is only known at the server's registration, and the client never enforces it
    options: method.options,
  };
  // the build-time maximum of the params tuple rides the reflection root, like on the server
  if (reflection.paramsJsonMaxBytes !== undefined) entry.paramsJsonMaxBytes = reflection.paramsJsonMaxBytes;
  if (reflection.headersParam) entry.headersParam = reflection.headersParam;
  if (reflection.headersReturn) entry.headersReturn = reflection.headersReturn;
  if (method.middleFnIds && method.middleFnIds.length) entry.middleFnIds = method.middleFnIds;
  return entry;
}
