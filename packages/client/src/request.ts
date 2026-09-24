/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {ResponseBody} from '@mionjs/router';
import {
  ClientOptions,
  MiddlewareSubRequest,
  SubRequest,
  RouteSubRequest,
  RequestErrors,
  PrefilledMiddlewaresCache,
} from './types.ts';
import type {RunTypeError} from '@mionjs/core';
import {
  RpcError,
  isRpcError,
  MION_ROUTES,
  MION_BATCH_KEY,
  HandlerType,
  HeadersSubset,
  toBase64Url,
  BUILD_VERSION_HEADER,
} from '@mionjs/core';
import type {SerializableMethodsData} from '@mionjs/core';
import {getRoutePath} from '@mionjs/core';
import {hasApiVersionMismatch, noteServerApiVersion} from './lib/apiBuildVersion.ts';
import {getMethod, hasMethod} from './lib/methods.ts';
import {loadMetadataFromServer, metadataCacheHooks} from './lib/metadataFromServerLoader.ts';
import {validateSubRequests} from './lib/validation.ts';
import {createSyncSubRequest, learnSyncRoutes, sendsSyncIds, syncRefusalOf} from './lib/syncRoutes.ts';
import type {RouteSyncRefusal} from './lib/syncRoutes.ts';
import {sanitizeSubRequests} from './lib/sanitize.ts';
import {serializeRequestBody, deserializeResponseBody} from './lib/serializer.ts';
import {MAX_GET_URL_LENGTH, CLIENT_REQUEST_ERROR_ID} from './constants.ts';
import {headersToRecord, hasHeadersSubsetParam} from './lib/headers.ts';

export class MionClientRequest<RR extends RouteSubRequest<any>, MiddlewareRequestsList extends MiddlewareSubRequest<any>[]> {
  readonly path: string;
  readonly requestId: string;
  readonly subRequestList: {[key: string]: SubRequest<any>} = {};
  /** ids whose error is thrown/undeclared rather than a declared response */
  readonly thrownErrorIds = new Set<string>();
  response: Response | undefined;
  /** bounds the stale-metadata relearn below to one attempt per request */
  private purgedStaleMetadata = false;
  /** one resend after a build-version mismatch; a second failure is reported */
  private retriedAfterMismatch = false;
  /** ids this request asked the server to confirm after a build-version mismatch */
  private verifying: string[] | undefined;
  /** one resend after a `route-sync-required` refusal */
  private resentWithSyncIds = false;

  constructor(
    public readonly options: ClientOptions,
    private readonly prefilledMiddlewaresCache: PrefilledMiddlewaresCache,
    public readonly route?: RR,
    public readonly middlewares?: MiddlewareRequestsList,
    public readonly batchSubRequests?: RouteSubRequest<any>[],
    /** Build-injected id of the batch; the only thing the batch wire carries besides the body */
    public readonly batchId?: string,
    /** Composed abort signal for this request */
    public readonly signal?: AbortSignal
  ) {
    if (batchSubRequests && batchSubRequests.length > 0) {
      const batchPath = getRoutePath([MION_BATCH_KEY], this.options);
      this.path = `${batchPath}?id=${encodeURIComponent(batchId ?? '')}`;
      this.requestId = MION_BATCH_KEY;
      batchSubRequests.forEach((sr) => this.addSubRequest(sr));
    } else {
      this.path = route ? getRoutePath(route.pointer, this.options) : 'no-route';
      this.requestId = route ? route.id : 'no-route';
      if (route) this.addSubRequest(route);
    }
    if (middlewares) middlewares.forEach((middleware) => this.addSubRequest(middleware));
  }

  async call(): Promise<ResponseBody> {
    if (this.signal?.aborted) {
      const errors: RequestErrors = new Map();
      this.onError(this.signal.reason ?? new DOMException('This operation was aborted', 'AbortError'), 'Request aborted', errors);
      return Promise.reject(errors);
    }
    return this.makeCall();
  }

  private async makeCall(skipOptimistic?: boolean): Promise<ResponseBody> {
    const errors: RequestErrors = new Map();
    const subRequestIds = Object.keys(this.subRequestList);
    let allCached = subRequestIds.every((id) => hasMethod(id));
    let isOptimistic = false;

    try {
      // One indexed read settles an id this page never heard of; guessing wrong costs a round trip AND its retry.
      // Hydration runs once per baseURL and never rejects, so a missing or blocked store just leaves this false.
      if (!allCached) {
        const lane = await loadMetadataFromServer();
        await lane.hydrateMetadataCache(this.options);
        if (this.signal?.aborted) {
          this.onError(
            this.signal.reason ?? new DOMException('This operation was aborted', 'AbortError'),
            'Request aborted',
            errors
          );
          return Promise.reject(errors);
        }
        allCached = subRequestIds.every((id) => hasMethod(id));
      }
      // Optimistic sends plain wire forms; what a decoder cannot read errors, and the retry sends the real encoder.
      isOptimistic = !allCached && !skipOptimistic;
      if (isOptimistic) {
        // No chain before metadata, so the route pointer picks prefills by scope; a missed one costs the retry, an extra is ignored.
        this.restoreScopedPrefilledMiddlewares();
        // Storing the server's copy over a BUNDLED method would let a later purge drop it for good.
        const missingIds = Object.keys(this.subRequestList).filter((id) => !hasMethod(id));
        this.addSubRequest((await loadMetadataFromServer()).createMetadataSubRequest(missingIds));
      } else {
        // After a version mismatch each route is confirmed once, on its first use, riding this request.
        if (hasApiVersionMismatch(this.options.baseURL)) {
          const lane = await loadMetadataFromServer();
          const unverified = lane.unverifiedIds(this.options.baseURL, subRequestIds);
          if (unverified.length) {
            this.verifying = unverified;
            this.addSubRequest(lane.createVerifySubRequest(unverified));
          }
        }
        await this.loadMethodsMetadata(subRequestIds, this.signal);
        this.restorePrefilledMiddlewares(errors);
        if (errors.size) return Promise.reject(errors);
        sanitizeSubRequests(subRequestIds, this);
        validateSubRequests(subRequestIds, this, errors);
        if (errors.size) return Promise.reject(errors);
        // an optimistic call has no rows to compute ids from: the server refuses it and sends them
        if (sendsSyncIds(this.options.baseURL)) this.addSubRequest(createSyncSubRequest(this.getRouteIds()));
      }
    } catch (error: any) {
      this.onError(error, 'Error preparing request', errors);
      return Promise.reject(errors);
    }

    try {
      let serialized: ReturnType<typeof serializeRequestBody>;
      try {
        serialized = serializeRequestBody(this, isOptimistic);
      } catch (serializeError) {
        if (isOptimistic) {
          // Plain JSON.stringify failed; the standard path fetches metadata first.
          delete this.subRequestList[MION_ROUTES.methodsMetadata];
          return this.makeCall(true);
        }
        throw serializeError;
      }

      const headersFromParams = extractRequestHeaders(this);
      const url = new URL(this.path, this.options.baseURL);
      const fetchOptions = buildFetchOptions(
        url,
        serialized,
        headersFromParams,
        this.options,
        isOptimistic,
        this.isQueryRoute(),
        this.signal
      );
      this.response = await fetch(url, fetchOptions);
    } catch (error: any) {
      this.onError(error, 'Error executing request', errors);
      return Promise.reject(errors);
    }

    try {
      // A body read after an in-flight abort may be truncated, so report the abort instead.
      if (this.signal?.aborted) {
        this.onError(this.signal.reason, 'Request aborted', errors);
        return Promise.reject(errors);
      }
      const deserialized = await deserializeResponseBody(this.response, this.options, !!this.verifying);
      if (this.handlePlatformError(deserialized, errors)) return Promise.reject(errors);
      const syncRefusal = this.takeSyncRefusal(deserialized);
      if (syncRefusal) return this.handleSyncRefusal(syncRefusal, errors);

      const callFailed = this.shouldRetryWithProperSerialization(deserialized);
      // A client carrying build-compiled routes replaces them when the server's version differs.
      const mismatch = noteServerApiVersion(this.options.baseURL, this.response.headers.get(BUILD_VERSION_HEADER));
      const rows = this.verifying && metadataRowsOf(deserialized[MION_ROUTES.methodsMetadata]);
      if (rows?.methods) {
        (await loadMetadataFromServer()).verifyMethodRows(this.options.baseURL, this.verifying!, rows);
        delete deserialized[MION_ROUTES.methodsMetadata];
      }
      // Only a FAILED call is repeated: it already ran server-side, and repeating a successful mutation would run it twice.
      if (mismatch && callFailed && !this.retriedAfterMismatch && !this.signal?.aborted) {
        this.retriedAfterMismatch = true;
        return this.retryWithProperSerialization();
      }

      if (!this.signal?.aborted && callFailed) {
        if (isOptimistic) return this.retryWithProperSerialization();
        // Stored metadata can predate the server's current build and nothing else would correct it.
        const cache = metadataCacheHooks();
        if (cache && !this.purgedStaleMetadata && subRequestIds.some((id) => cache.wasHydratedFromCache(id, this.options))) {
          this.purgedStaleMetadata = true;
          await cache.purgeHydratedMetadata(subRequestIds, this.options);
          return this.retryWithProperSerialization();
        }
      }

      this.resolveSubRequests(deserialized, errors, isOptimistic ? MION_ROUTES.methodsMetadata : undefined);
      if (errors.size) return Promise.reject(errors);
      return deserialized;
    } catch (error) {
      this.onError(error, 'Error parsing response', errors);
      return Promise.reject(errors);
    }
  }

  private async loadMethodsMetadata(methodIds: string[], signal?: AbortSignal): Promise<void> {
    if (methodIds.every((id) => hasMethod(id))) return;
    const lane = await loadMetadataFromServer();
    await lane.fetchRemoteMethodsMetadata(methodIds, this.options, signal);
  }

  private shouldRetryWithProperSerialization(deserialized: ResponseBody): boolean {
    const thrownErrors = (deserialized[MION_ROUTES.thrownErrors] ?? {}) as Record<string, RpcError<string>>;
    const isRetryError = (value: any): boolean =>
      isRpcError(value) &&
      (value.type === 'serialization-error' || value.type === 'validation-error' || value.type === 'parsing-json-request-error');
    return Object.values(deserialized).some(isRetryError) || Object.values(thrownErrors).some(isRetryError);
  }

  /** The sync slot is answered only on a refusal, never as a middleware result. */
  private takeSyncRefusal(deserialized: ResponseBody): RouteSyncRefusal | undefined {
    const answer = deserialized[MION_ROUTES.syncRoutes];
    delete deserialized[MION_ROUTES.syncRoutes];
    delete this.subRequestList[MION_ROUTES.syncRoutes];
    return syncRefusalOf(answer);
  }

  /** Missing ids are resent once with the refusal's rows; no handler ran, so resending is safe.
   *  Different ids are reported: the code expects other types, and no resend fixes that. */
  private async handleSyncRefusal(
    refusal: RouteSyncRefusal,
    errors: RequestErrors
  ): Promise<ResponseBody> {
    if (!this.signal?.aborted) {
      // a row restored from the store can predate the server: relearning it is the one thing a resend can fix
      const refusedIds = refusal.errorData?.routeIds ?? this.getRouteIds();
      const cache = metadataCacheHooks();
      if (cache && !this.purgedStaleMetadata && refusedIds.some((id) => cache.wasHydratedFromCache(id, this.options))) {
        this.purgedStaleMetadata = true;
        await cache.purgeHydratedMetadata(refusedIds, this.options);
        return this.retryWithProperSerialization();
      }
      if (refusal.type === 'route-sync-required' && !this.resentWithSyncIds) {
        this.resentWithSyncIds = true;
        learnSyncRoutes(this.options.baseURL);
        const rows = refusal.errorData?.metadata;
        if (rows?.methods) (await loadMetadataFromServer()).installMethodRows(rows, Object.keys(rows.methods));
        return this.retryWithProperSerialization();
      }
    }
    Object.values(this.subRequestList).forEach((subRequest) => (subRequest.isResolved = true));
    this.setUndeclaredError(MION_ROUTES.syncRoutes, refusal, errors);
    return Promise.reject(errors);
  }

  private async retryWithProperSerialization(): Promise<ResponseBody> {
    delete this.subRequestList[MION_ROUTES.methodsMetadata];
    delete this.subRequestList[MION_ROUTES.syncRoutes];
    // each attempt asks again: a stale flag would set the next answer's rows aside instead of caching them
    this.verifying = undefined;
    this.thrownErrorIds.clear();
    Object.values(this.subRequestList).forEach((sr) => {
      sr.isResolved = false;
      sr.resolvedValue = undefined;
      sr.error = undefined;
    });
    return this.makeCall();
  }

  async validateParams(subReqList?: SubRequest<any>[]): Promise<RunTypeError[]> {
    if (subReqList) subReqList.forEach((subRequest) => this.addSubRequest(subRequest));
    const errors: RequestErrors = new Map();
    try {
      const subRequestIds = Object.keys(this.subRequestList);
      await this.loadMethodsMetadata(subRequestIds);
      sanitizeSubRequests(subRequestIds, this);
      validateSubRequests(subRequestIds, this, errors, false);
      return Object.values(this.subRequestList)
        .map((subRequest) => subRequest.error?.errorData?.typeErrors || [])
        .flat();
    } catch (error: any) {
      this.onError(error, 'Error preparing request', errors);
      return Promise.reject(errors);
    }
  }

  async prefill(subReqList?: SubRequest<any>[]): Promise<void> {
    if (subReqList) subReqList.forEach((subRequest) => this.addSubRequest(subRequest));
    const errors: RequestErrors = new Map();
    try {
      const subRequestIds = Object.keys(this.subRequestList);
      await this.loadMethodsMetadata(subRequestIds);

      sanitizeSubRequests(subRequestIds, this);
      validateSubRequests(subRequestIds, this, errors, false);
      if (errors.size) return Promise.reject(errors);

      serializeRequestBody(this);

      this.storePrefilledMiddlewares(errors);
      if (errors.size) return Promise.reject(errors);

      return;
    } catch (error: any) {
      this.onError(error, 'Error preparing request', errors);
      return Promise.reject(errors);
    }
  }

  async removePrefill(subRequests?: SubRequest<any>[]): Promise<void> {
    if (subRequests) subRequests.forEach((subRequest) => this.addSubRequest(subRequest));
    this.removePrefilledMiddlewares();
  }

  addSubRequest(subRequest: SubRequest<any>) {
    if (subRequest.isResolved) throw new Error(`SubRequest ${subRequest.id} is already resolved`);
    this.subRequestList[subRequest.id] = subRequest;
  }

  /** A platform error is request-scoped: recorded once under CLIENT_REQUEST_ERROR_ID, not per subrequest */
  private handlePlatformError(deserialized: ResponseBody, errors: RequestErrors): boolean {
    if (!(MION_ROUTES.platformError in deserialized)) return false;
    const platformError = deserialized[MION_ROUTES.platformError];
    Object.values(this.subRequestList).forEach((methodMeta) => (methodMeta.isResolved = true));
    this.setUndeclaredError(CLIENT_REQUEST_ERROR_ID, platformError as RpcError<string>, errors);
    return true;
  }

  private setUndeclaredError(id: string, error: RpcError<string>, errors: RequestErrors): void {
    errors.set(id, error);
    this.thrownErrorIds.add(id);
  }

  /** Keeps the wire's split: body entries are declared responses, [MION_ROUTES.thrownErrors] ones unexpected.
   * 'validation-error' is thrown server-side but is by design part of every handler's expected union. */
  private resolveSubRequests(deserialized: ResponseBody, errors: RequestErrors, skipId?: string): void {
    const thrownErrors = (deserialized[MION_ROUTES.thrownErrors] ?? {}) as Record<string, RpcError<string>>;
    Object.entries(thrownErrors).forEach(([id, thrownError]) => {
      const subRequest = this.subRequestList[id];
      if (subRequest) {
        subRequest.isResolved = true;
        subRequest.error = thrownError;
      }
      errors.set(id, thrownError);
      if (thrownError.type !== 'validation-error') this.thrownErrorIds.add(id);
    });

    Object.entries(this.subRequestList).forEach(([id, methodMeta]) => {
      if (id === skipId || errors.has(id)) return;
      const resp = this.getResponseValueFromBodyOrHeader(id, deserialized, (this.response as Response).headers);
      methodMeta.isResolved = true;
      if (isRpcError(resp)) {
        methodMeta.error = resp;
        errors.set(id, resp);
      } else {
        methodMeta.resolvedValue = resp;
      }
    });

    Object.entries(deserialized).forEach(([id, value]) => {
      if (id === MION_ROUTES.thrownErrors) return;
      // an error for an id this request never asked for is nobody's declared response
      if (!(id in this.subRequestList) && isRpcError(value)) this.setUndeclaredError(id, value, errors);
    });
  }

  private onError(error: any, stageMessage: string, errors: RequestErrors): void {
    // Check signal.reason before the isRpcError return: a later stage may have wrapped the abort as an RpcError.
    const reason = this.signal?.aborted ? this.signal.reason : undefined;
    if (reason instanceof DOMException) {
      if (reason.name === 'TimeoutError') {
        this.setUndeclaredError(
          CLIENT_REQUEST_ERROR_ID,
          new RpcError({
            type: 'request-timeout',
            publicMessage: 'Request timed out',
            originalError: error instanceof Error ? error : undefined,
          }),
          errors
        );
        return;
      }
      if (reason.name === 'AbortError') {
        this.setUndeclaredError(
          CLIENT_REQUEST_ERROR_ID,
          new RpcError({
            type: 'request-aborted',
            publicMessage: 'Request was aborted',
            originalError: error instanceof Error ? error : undefined,
          }),
          errors
        );
        return;
      }
    }
    if (isRpcError(error)) {
      this.setUndeclaredError(CLIENT_REQUEST_ERROR_ID, error, errors);
      return;
    }
    const message = error?.message ? `${stageMessage}: ${error.message}` : `${stageMessage}: Unknown Error`;
    this.setUndeclaredError(
      CLIENT_REQUEST_ERROR_ID,
      new RpcError({
        type: error?.name || 'unknown-error',
        publicMessage: message,
        originalError: error instanceof Error ? error : undefined,
      }),
      errors
    );
  }

  private getResponseValueFromBodyOrHeader(id: string, respBody: ResponseBody, headers: Headers): any {
    const headersSubset = reconstructHeadersSubsetFromResponse(id, headers);
    if (headersSubset) return headersSubset;
    return respBody[id];
  }

  private getRouteIds(): string[] {
    if (this.batchSubRequests && this.batchSubRequests.length > 0) return this.batchSubRequests.map((sr) => sr.id);
    return [this.requestId];
  }

  /** Restores the prefilled middlewares the cached metadata lists in the route's chain (standard flow) */
  private restorePrefilledMiddlewares(errors: RequestErrors): void {
    const routeIds = new Set(this.getRouteIds());
    for (const routeId of routeIds) {
      const methodMeta = getMethod(routeId);
      if (!methodMeta) {
        this.setUndeclaredError(
          routeId,
          new RpcError({
            type: 'route-metadata-not-found',
            publicMessage: `Metadata for Route '${routeId}' not found.`,
          }),
          errors
        );
        continue;
      }
      const missingIds = methodMeta.middlewareIds?.filter((id) => !!id && !routeIds.has(id)) || [];
      missingIds.forEach((id) => this.restorePrefilledMiddleware(id));
    }
  }

  /** The pointers of the route(s) this request calls, in the same order as getRouteIds() */
  private getRoutePointers(): string[][] {
    if (this.batchSubRequests && this.batchSubRequests.length > 0) return this.batchSubRequests.map((sr) => sr.pointer);
    return this.route ? [this.route.pointer] : [];
  }

  /** Optimistic flow: the chain is not cached yet, but a middleware's group is part of its pointer */
  private restoreScopedPrefilledMiddlewares(): void {
    const routeIds = new Set(this.getRouteIds());
    const routePointers = this.getRoutePointers();
    for (const [cacheKey, cachedSubRequest] of this.prefilledMiddlewaresCache) {
      const id = cachedSubRequest.id;
      // the cache is keyed by baseURL too: only this client's own prefills ride along
      if (routeIds.has(id) || cacheKey !== this.getPrefilledMiddlewareCacheKey(id)) continue;
      if (!routePointers.some((routePointer) => isMiddlewareInScope(cachedSubRequest.pointer, routePointer))) continue;
      this.restorePrefilledMiddleware(id);
    }
  }

  private restorePrefilledMiddleware(id: string): void {
    if (this.subRequestList[id]) return;
    const cachedSubRequest = this.prefilledMiddlewaresCache.get(this.getPrefilledMiddlewareCacheKey(id));
    if (!cachedSubRequest) return;
    const clonedSubRequest: SubRequest<any> = {
      ...cachedSubRequest,
      isResolved: false,
      resolvedValue: undefined,
      error: undefined,
    };
    this.addSubRequest(clonedSubRequest);
  }

  private storePrefilledMiddlewares(errors: RequestErrors): void {
    Object.keys(this.subRequestList).forEach((id) => {
      const subRequest = this.subRequestList[id];
      const methodMeta = getMethod(id);
      if (!methodMeta) throw new Error(`Remote method ${id} not found.`);
      if (methodMeta.type === HandlerType.route) {
        errors.set(
          id,
          new RpcError({
            type: 'routes-cant-be-prefilled',
            publicMessage: `Remote method ${id} is a route and can't be prefilled.`,
          })
        );
        return;
      }
      const cacheKey = this.getPrefilledMiddlewareCacheKey(id);
      this.prefilledMiddlewaresCache.set(cacheKey, subRequest);
    });
  }

  private removePrefilledMiddlewares(): void {
    Object.keys(this.subRequestList).forEach((id) => {
      const cacheKey = this.getPrefilledMiddlewareCacheKey(id);
      this.prefilledMiddlewaresCache.delete(cacheKey);
    });
  }

  private isQueryRoute(): boolean {
    if (this.batchSubRequests) return false;
    const meta = getMethod(this.requestId);
    // strict false value required for queries
    return meta?.options?.isMutation === false;
  }

  private getPrefilledMiddlewareCacheKey(id: string): string {
    return `${this.options.baseURL}:${id}`;
  }
}

/** A middleware's scope is its pointer minus the last segment; a route is in scope when its pointer starts with it */
export function isMiddlewareInScope(middlewarePointer: string[], routePointer: string[]): boolean {
  const groupDepth = middlewarePointer.length - 1;
  if (groupDepth >= routePointer.length) return false;
  for (let i = 0; i < groupDepth; i++) if (middlewarePointer[i] !== routePointer[i]) return false;
  return true;
}

/** GET with the body as `?data=<base64url>` for a JSON query whose URL fits MAX_GET_URL_LENGTH.
 * POST for everything else: mutations, optimistic requests, batches, and a URL over the limit. */
function buildFetchOptions(
  url: URL,
  serialized: ReturnType<typeof serializeRequestBody>,
  headersFromParams: Record<string, string>,
  options: ClientOptions,
  isOptimistic: boolean,
  isQuery: boolean,
  signal?: AbortSignal
): RequestInit {
  if (!isOptimistic && isQuery && serialized.contentType.includes('json')) {
    const encoded = toBase64Url(serialized.body as string);
    const testUrl = new URL(url.pathname + url.search, url.origin);
    testUrl.searchParams.set('data', encoded);

    if (testUrl.toString().length <= MAX_GET_URL_LENGTH) {
      url.searchParams.set('data', encoded);
      return {
        ...options.fetchOptions,
        method: 'GET',
        headers: {...headersToRecord(options.fetchOptions.headers), ...headersFromParams},
        body: undefined,
        signal,
      };
    }
  }

  return {
    ...options.fetchOptions,
    method: 'POST',
    headers: {...headersToRecord(options.fetchOptions.headers), ...headersFromParams, 'Content-Type': serialized.contentType},
    body: serialized.body as BodyInit,
    signal,
  };
}

function extractRequestHeaders(req: MionClientRequest<any, any>): Record<string, string> {
  const headers: Record<string, string> = {};
  const subRequestIds = Object.keys(req.subRequestList);

  for (let i = 0; i < subRequestIds.length; i++) {
    const id = subRequestIds[i];
    const subRequest = req.subRequestList[id];
    if (!subRequest || !hasHeadersSubsetParam(id, subRequest.params)) continue;
    Object.assign(headers, extractHeadersFromParams(subRequest.params));
  }

  return headers;
}

function extractHeadersFromParams(params: any[]): Record<string, string> {
  if (!params || params.length === 0) {
    throw new RpcError({
      type: 'missing-headers-param',
      publicMessage: 'HeadersFn requires a HeadersSubset parameter.',
    });
  }

  const firstParam = params[0];

  if (firstParam instanceof HeadersSubset) {
    return firstParam.headers as Record<string, string>;
  }

  if (firstParam && typeof firstParam === 'object' && 'headers' in firstParam && typeof firstParam.headers === 'object') {
    return firstParam.headers as Record<string, string>;
  }

  throw new RpcError({
    type: 'invalid-headers-param',
    publicMessage: 'HeadersFn first parameter must be a HeadersSubset instance or object with headers property.',
  });
}

function reconstructHeadersSubsetFromResponse(
  methodId: string,
  responseHeaders: Headers
): HeadersSubset<string, string> | undefined {
  const method = getMethod(methodId);

  if (!method?.headersReturn?.headerNames || method.headersReturn.headerNames.length === 0) {
    return undefined;
  }

  const headerNames = method.headersReturn.headerNames;
  const headersMap: Record<string, string> = {};

  for (const name of headerNames) {
    const value = responseHeaders.get(name);
    if (value !== undefined && value !== null) {
      headersMap[name] = value;
    }
  }

  if (Object.keys(headersMap).length > 0) {
    return new HeadersSubset(headersMap);
  }

  return undefined;
}

/** The metadata middleware declares a union, so its answer arrives as an `[index, value]` envelope. */
function metadataRowsOf(slot: unknown): SerializableMethodsData | undefined {
  const value = Array.isArray(slot) ? slot[1] : slot;
  return value && typeof value === 'object' ? (value as SerializableMethodsData) : undefined;
}
