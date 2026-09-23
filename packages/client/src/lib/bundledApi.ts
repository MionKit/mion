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
  type MethodWithOptions,
  type MethodWithOptsAndJitFns,
  type RtMarkerPayload,
} from '@mionjs/core';
import type {InjectedApiMetadata} from '../types.ts';
import {isBundledMethod, resetBundledMethods, setBundledMethod} from './methods.ts';
// Re-exported from the light half, which request.ts imports without the marker reflection this module needs.
export {setBundleApiMode, getBundleApiMode} from './bundleApiMode.ts';

// The bundled-API lane (the build's `bundleApi` option): the build compiles the same validators and
// serializers the server holds and injects, at each dispatch point, a module carrying the route plus its
// chain's middlewares, as metadata rows and live marker payloads. Registering one goes through the same
// reflection the router runs at initRoutes, so a bundled method looks exactly like a fetched one.

/** One method of a bundled payload: the `MethodWithOptions` members the build can answer from the API type,
 *  plus the marker payload. The rest (jit hashes, arity, header names) comes from the reflection instead. */
export interface BundledMethod extends Pick<
  MethodWithOptions,
  'id' | 'pointer' | 'nestLevel' | 'type' | 'isAsync' | 'options' | 'middlewareIds'
> {
  rtFns: RtMarkerPayload;
}

/** What the build injects at a dispatch point: the method called plus every middleware in its chain. */
export interface BundledApiPayload {
  methods: BundledMethod[];
}

/** A payload the build did not write, held until a call can report it once. */
let pendingPayloadError: RpcError<string> | undefined;

/** Registers a bundled payload, once per method id; a dispatch point passes the same module on every call.
 *  The guard runs despite the declared type because a `<genDir>/api/` tree from another @mionjs/devtools
 *  version can disagree; a payload it did not write is recorded, never thrown, since `call()` never throws. */
export function registerBundledApi(payload: InjectedApiMetadata): void {
  if (!isBundledApiPayload(payload)) {
    pendingPayloadError = new RpcError({
      type: 'bundle-api-invalid-payload',
      publicMessage:
        'The bundled API metadata injected at this call is not what the build writes; rebuild with a matching @mionjs/devtools.',
    });
    console.error('[mion] bundled API payload rejected at a dispatch point; rebuild with a matching @mionjs/devtools');
    return;
  }
  for (const method of payload.methods) {
    if (isBundledMethod(method.id)) continue;
    setBundledMethod(method.id, bundledMethodToCacheEntry(method));
  }
}

/** Takes the last rejected payload, if any, so a call can report it once. */
export function takeBundledApiError(): RpcError<string> | undefined {
  const error = pendingPayloadError;
  pendingPayloadError = undefined;
  return error;
}

/** Forgets which ids came from a bundle. Tests only. */
export function resetBundledApi(): void {
  resetBundledMethods();
  pendingPayloadError = undefined;
  // the lane is NOT cleared: the build's module sets it once at import, and no amount of cache
  // resetting changes which build produced this bundle
}

function isBundledApiPayload(value: unknown): value is BundledApiPayload {
  if (typeof value !== 'object' || value === null) return false;
  const methods = (value as BundledApiPayload).methods;
  return Array.isArray(methods) && methods.every(isBundledMethodRow);
}

/** Every member the cache entry reads, so a stale module fails the guard instead of a later access. */
function isBundledMethodRow(value: unknown): value is BundledMethod {
  if (typeof value !== 'object' || value === null) return false;
  const method = value as BundledMethod;
  return (
    typeof method.id === 'string' &&
    typeof method.type === 'number' &&
    typeof method.nestLevel === 'number' &&
    typeof method.isAsync === 'boolean' &&
    Array.isArray(method.pointer) &&
    typeof method.options === 'object' &&
    method.options !== null &&
    typeof method.rtFns === 'object' &&
    method.rtFns !== null
  );
}

/** A bundled method never carries a handler; the reflection reads everything off the marker payload
 *  and the row, so the placeholder is never called. */
const noHandler = () => undefined;

function bundledMethodToCacheEntry(method: BundledMethod): MethodWithOptsAndJitFns {
  const reflection =
    method.type === HandlerType.headersMiddleware
      ? getHeadersReflectionFromMarkers(method.rtFns, noHandler, method.id)
      : getReflectionFromMarkers(method.rtFns, noHandler, method.id);
  // spread, like `registerRoutes` does on the server, so a member added to the reflection reaches
  // a bundled method too; only the row's own answers are written over it
  const entry: MethodWithOptsAndJitFns = {
    ...reflection,
    type: method.type,
    id: method.id,
    pointer: method.pointer,
    nestLevel: method.nestLevel,
    // the build answered this off the server handler's declared return; the placeholder above cannot
    isAsync: method.isAsync,
    // `options.maxBodySize` is the route's own declared limit or nothing: the number the server
    // settles for a chain that declares none (its types times the router factor, else the platform
    // adapter's) is only known at the server's registration, and the client never enforces it
    options: method.options,
  };
  // the params byte ceiling is the SERVER's: it settles a chain's request limit once at
  // registration. The client enforces no limit, and the fetched lane is never sent it either
  delete entry.paramsJsonMaxBytes;
  if (method.middlewareIds && method.middlewareIds.length) entry.middlewareIds = method.middlewareIds;
  return entry;
}
