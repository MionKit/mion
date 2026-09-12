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
  type MethodWithOptions,
  type MethodWithOptsAndJitFns,
  type RtMarkerPayload,
} from '@mionjs/core';
import type {BundleApiMode} from '../types.ts';

// The bundled-API lane (the build's `bundleApi` option). A build with it on compiles, for every
// route the program calls, the same validators and serializers the server holds, and injects at
// each dispatch point (`.call()`, `.prefill()`, `.typeErrors()`, a batch's `.call()`) a module
// carrying that route plus the middleFns of its chain: metadata rows and the very marker payload
// a server helper receives (live function tuples, nothing to evaluate). This registers such a
// payload into the routes cache through the same reflection the router runs at initRoutes, so a
// bundled method looks exactly like a fetched one to the rest of the client, hash for hash.

/** One method of a bundled payload: the members of the server's own `MethodWithOptions` that the
 *  build can answer from the API type, plus the marker payload. Everything else `MethodWithOptions`
 *  carries (the jit hashes, the arity, the header names) comes from the reflection at registration,
 *  so the build never writes it and this never names it. */
export interface BundledMethod extends Pick<
  MethodWithOptions,
  'id' | 'pointer' | 'nestLevel' | 'type' | 'isAsync' | 'options' | 'middleFnIds'
> {
  rtFns: RtMarkerPayload;
}

/** What the build injects at a dispatch point: the method called plus every middleFn in its chain. */
export interface BundledApiPayload {
  methods: BundledMethod[];
}

/** The ids whose metadata came from a bundle; a fetched or restored answer never replaces them. */
const bundledIds = new Set<string>();

/** A payload the build did not write, held until a call can report it once. */
let pendingPayloadError: RpcError<string> | undefined;

/** The lane the build put this bundle on, set by the module the build writes under `<genDir>/api/`
 *  and imported into every file that calls `initClient`. Undefined means the build option is off
 *  and the client fetches its metadata, as it always did. */
let bundleApiMode: BundleApiMode | undefined;

/** Puts the client on the lane the build compiled for. Called by generated code, never by hand:
 *  it is a build option, so the build is the one place it is set. */
export function setBundleApiMode(mode: BundleApiMode): void {
  if (mode !== 'bundled' && mode !== 'mixed') {
    throw new RpcError({
      type: 'bundle-api-invalid-mode',
      publicMessage: `The generated bundleApi module named an unknown mode '${String(mode)}'; expected 'bundled' or 'mixed'.`,
    });
  }
  bundleApiMode = mode;
}

/** The lane the build put this client on; undefined means the fetched lane. */
export function getBundleApiMode(): BundleApiMode | undefined {
  return bundleApiMode;
}

/** Registers a bundled payload, once per method id. Idempotent and cheap on repeat: a dispatch point
 *  passes the same module on every call. A payload the build did not write is recorded rather than
 *  thrown: `call()` never throws, so it rides the undeclared slot of the result instead. */
export function registerBundledApi(payload: unknown): void {
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
    if (bundledIds.has(method.id)) continue;
    // a fetched or restored entry for the same id gives way: the bundle is what the build compiled
    routesCache.removeMetadata(method.id);
    routesCache.setMethodJitFns(method.id, bundledMethodToCacheEntry(method));
    bundledIds.add(method.id);
  }
}

/** True when the method's metadata came from a bundle. Tests only; the client's own
 *  "a fetched answer never replaces a bundled one" guarantee comes from the routes cache. */
export function isBundledMethod(id: string): boolean {
  return bundledIds.has(id);
}

/** Takes the last rejected payload, if any, so a call can report it once. */
export function takeBundledApiError(): RpcError<string> | undefined {
  const error = pendingPayloadError;
  pendingPayloadError = undefined;
  return error;
}

/** Forgets which ids came from a bundle. Tests only (the routes cache is reset alongside). */
export function resetBundledApi(): void {
  bundledIds.clear();
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
    method.type === HandlerType.headersMiddleFn
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
  if (method.middleFnIds && method.middleFnIds.length) entry.middleFnIds = method.middleFnIds;
  return entry;
}
