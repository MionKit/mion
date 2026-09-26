/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {ResponseBody} from '@mionjs/router';
import type {
  BatchResult,
  ClientCallContext,
  ClientOptions,
  MiddlewareContext,
  MiddlewareSubRequest,
  RequestErrors,
  Result,
  RouteSubRequest,
  SubRequest,
} from './types.ts';
import type {HandlersRegistry, RequestHandlerEntry} from './lib/handlersRegistry.ts';
import type {RunTypeError} from '@mionjs/core';
import {RpcError, isRpcError, MION_ROUTES, toBase64Url, BUILD_VERSION_HEADER, ROUTER_ITEM_SEPARATOR_CHAR} from '@mionjs/core';
import {addSubRequest, createCallContext, getRouteIds, getRoutePointers} from './callContext.ts';
import {noteServerApiVersion, reportApiVersionMismatch, takeApiVersionError} from './lib/apiBuildVersion.ts';
import {getMethod, hasMethod} from './lib/methods.ts';
import {getMetadataFetcher, type MetadataCall, type MetadataFetcher} from './lib/metadataFetcher.ts';
import {validateSubRequests} from './lib/validation.ts';
import {sanitizeSubRequests} from './lib/sanitize.ts';
import {serializeRequestBody, deserializeResponseBody} from './lib/serializer.ts';
import {MAX_GET_URL_LENGTH, CLIENT_REQUEST_ERROR_ID} from './constants.ts';
import {extractRequestHeaders, headersToRecord, reconstructHeadersSubsetFromResponse} from './lib/headers.ts';
import {takeBundledApiError} from '#bundled-api';

/** One call's retry state: it belongs to the dispatch, never to the context onRequest hooks see */
interface DispatchState {
  readonly context: ClientCallContext;
  readonly handlersRegistry: HandlersRegistry;
  /** set only when the client set up `useMethodsMetadata` */
  readonly fetcher: MetadataFetcher | undefined;
  readonly metadataId: string | undefined;
  readonly metadata: MetadataCall | undefined;
  /** middlewares whose onRequest already ran, so a retry never asks twice */
  readonly askedRequestHandlers: Set<string>;
  /** the current attempt reached fetch, so the server may have run its routes */
  sent: boolean;
}

// ############# DISPATCH #############

export async function dispatchCall(
  context: ClientCallContext,
  handlersRegistry: HandlersRegistry
): Promise<BatchResult<any> | Result<any, any>> {
  const fetcher = getMetadataFetcher(handlersRegistry);
  const state: DispatchState = {
    context,
    handlersRegistry,
    fetcher,
    metadataId: fetcher?.id,
    metadata: fetcher?.startCall(context),
    askedRequestHandlers: new Set<string>(),
    sent: false,
  };
  // a middleware whose hook asked for a retry never gets another one in this call
  const retriedBy = new Set<string>();
  for (;;) {
    let errors: RequestErrors | undefined;
    try {
      await runCall(state);
    } catch (requestErrors: any) {
      errors = requestErrors;
    }
    // before any hook sees the failed attempt: a resend with fresh rows is the metadata's own, not a hook's
    if (fetcher && (await resendsForMetadata(state, fetcher.id, errors, retriedBy))) {
      retriedBy.add(fetcher.id);
      resetForMetadataResend(state);
      continue;
    }
    const middlewares = getMiddlewareSubRequests(context);
    const hooks = await runMiddlewareResponses(state, middlewares, errors, retriedBy);
    if (!hooks.retryIds.length) return buildResult(state, middlewares, hooks.errors);
    hooks.retryIds.forEach((id) => retriedBy.add(id));
    resetForMiddlewareRetry(state);
  }
}

/** Validates params locally without sending anything */
export async function dispatchTypeErrors(
  options: ClientOptions,
  subRequests: SubRequest<any>[],
  handlersRegistry: HandlersRegistry
): Promise<RunTypeError[]> {
  const context = createCallContext(options);
  subRequests.forEach((subRequest) => addSubRequest(context, subRequest));
  const errors: RequestErrors = new Map();
  try {
    const subRequestIds = Object.keys(context.subRequestList);
    await loadMethodsMetadata(getMetadataFetcher(handlersRegistry), context, subRequestIds);
    sanitizeSubRequests(subRequestIds, context);
    validateSubRequests(subRequestIds, context, errors, false);
    return Object.values(context.subRequestList)
      .map((subRequest) => subRequest.error?.errorData?.typeErrors || [])
      .flat();
  } catch (error: any) {
    onError(context, error, 'Error preparing request', errors);
    return Promise.reject(errors);
  }
}

async function runCall(state: DispatchState): Promise<ResponseBody> {
  const {signal} = state.context;
  if (signal?.aborted) {
    const errors: RequestErrors = new Map();
    onError(
      state.context,
      signal.reason ?? new DOMException('This operation was aborted', 'AbortError'),
      'Request aborted',
      errors
    );
    return Promise.reject(errors);
  }
  return makeCall(state);
}

async function makeCall(state: DispatchState, skipOptimistic?: boolean): Promise<ResponseBody> {
  const {context, metadata} = state;
  const {options, signal} = context;
  const errors: RequestErrors = new Map();
  const subRequestIds = Object.keys(context.subRequestList).filter((id) => id !== state.metadataId);
  let isOptimistic = false;

  try {
    if (metadata) isOptimistic = (await metadata.prepare(subRequestIds)) && !skipOptimistic;
    if (signal?.aborted) {
      onError(context, signal.reason ?? new DOMException('This operation was aborted', 'AbortError'), 'Request aborted', errors);
      return Promise.reject(errors);
    }
    if (isOptimistic) {
      // No chain before metadata, so scope picks the middlewares; a missed one costs the resend, an extra is ignored.
      const running = runRequestHandlers(state, getScopedRequestHandlerIds(state));
      if (running) await running;
      if (signal?.aborted) {
        onError(context, signal.reason, 'Request aborted', errors);
        return Promise.reject(errors);
      }
      metadata!.askRows(Object.keys(context.subRequestList));
    } else {
      await loadMethodsMetadata(state.fetcher, context, subRequestIds, signal);
      const chainIds = getChainMiddlewareIds(context, errors);
      if (errors.size) return Promise.reject(errors);
      const beforeHandlers = new Set(Object.keys(context.subRequestList));
      const running = runRequestHandlers(state, chainIds);
      if (running) await running;
      if (signal?.aborted) {
        onError(context, signal.reason, 'Request aborted', errors);
        return Promise.reject(errors);
      }
      const addedIds = Object.keys(context.subRequestList).filter((id) => !beforeHandlers.has(id));
      const allIds = [...subRequestIds, ...addedIds];
      await loadMethodsMetadata(state.fetcher, context, allIds, signal);
      sanitizeSubRequests(allIds, context);
      validateSubRequests(allIds, context, errors);
      if (errors.size) return Promise.reject(errors);
    }
  } catch (error: any) {
    onError(context, error, 'Error preparing request', errors);
    return Promise.reject(errors);
  }

  let response: Response;
  try {
    let serialized: ReturnType<typeof serializeRequestBody>;
    try {
      serialized = serializeRequestBody(context, isOptimistic);
    } catch (serializeError) {
      // plain JSON.stringify failed and nothing was sent: fetch the rows first, then send the real encoders
      if (isOptimistic) return makeCall(state, true);
      throw serializeError;
    }

    const headersFromParams = extractRequestHeaders(context);
    const url = new URL(context.path, options.baseURL);
    const fetchOptions = buildFetchOptions(
      url,
      serialized,
      headersFromParams,
      options,
      isOptimistic,
      isQueryRoute(context),
      signal
    );
    state.sent = true;
    response = await fetch(url, fetchOptions);
    context.response = response;
  } catch (error: any) {
    onError(context, error, 'Error executing request', errors);
    return Promise.reject(errors);
  }

  try {
    // A body read after an in-flight abort may be truncated, so report the abort instead.
    if (signal?.aborted) {
      onError(context, signal.reason, 'Request aborted', errors);
      return Promise.reject(errors);
    }
    const deserialized = await deserializeResponseBody(response, options, metadata && ((body) => metadata.readRows(body)));
    if (handlePlatformError(context, deserialized, errors)) return Promise.reject(errors);
    // without the metadata middleware the client cannot check routes one by one, so the whole API is reported
    if (noteServerApiVersion(options.baseURL, response.headers.get(BUILD_VERSION_HEADER)) && !metadata)
      reportApiVersionMismatch(options.baseURL);
    resolveSubRequests(context, deserialized, errors);
    if (errors.size) return Promise.reject(errors);
    return deserialized;
  } catch (error) {
    onError(context, error, 'Error parsing response', errors);
    return Promise.reject(errors);
  }
}

/** Rows missing for any id: fetched when the client set up metadata fetching, a clear error otherwise. */
async function loadMethodsMetadata(
  fetcher: MetadataFetcher | undefined,
  context: ClientCallContext,
  methodIds: string[],
  signal?: AbortSignal
): Promise<void> {
  const missing = methodIds.filter((id) => !hasMethod(id));
  if (!missing.length) return;
  if (fetcher) return fetcher.fetchRows(missing, context.options, signal);
  throw new RpcError({
    type: 'route-metadata-not-found',
    publicMessage:
      `No metadata for ${missing.map((id) => `'${id}'`).join(', ')}: the build did not bundle it and the client does not fetch it. ` +
      `Call the route where the build can see it, or set up useMethodsMetadata from '@mionjs/client/middlewares'.`,
  });
}

/** A metadata resend fixes an attempt that failed on the wire, once per call, never re-running a success. */
async function resendsForMetadata(
  state: DispatchState,
  metadataId: string,
  errors: RequestErrors | undefined,
  retriedBy: ReadonlySet<string>
): Promise<boolean> {
  if (!errors || !state.sent || retriedBy.has(metadataId) || !state.metadata) return false;
  if (!(await state.metadata.shouldResend(failedOnWire(errors)))) return false;
  return isRetrySafe(state, errors);
}

/** The errors plain wire forms or stale rows cause: the server could not read what the client wrote. */
function failedOnWire(errors: RequestErrors): boolean {
  for (const error of errors.values()) {
    const type = error?.type;
    if (type === 'serialization-error' || type === 'validation-error' || type === 'parsing-json-request-error') return true;
  }
  return false;
}

/** A platform error is request-scoped: one entry, not one per subrequest */
function handlePlatformError(context: ClientCallContext, deserialized: ResponseBody, errors: RequestErrors): boolean {
  if (!(MION_ROUTES.platformError in deserialized)) return false;
  const platformError = deserialized[MION_ROUTES.platformError];
  Object.values(context.subRequestList).forEach((methodMeta) => (methodMeta.isResolved = true));
  setUndeclaredError(context, CLIENT_REQUEST_ERROR_ID, platformError as RpcError<string>, errors);
  return true;
}

function setUndeclaredError(context: ClientCallContext, id: string, error: RpcError<string>, errors: RequestErrors): void {
  errors.set(id, error);
  context.thrownErrorIds.add(id);
}

/** Body entries are declared, [MION_ROUTES.thrownErrors] unexpected; 'validation-error' is thrown yet always declared */
function resolveSubRequests(context: ClientCallContext, deserialized: ResponseBody, errors: RequestErrors): void {
  const thrownErrors = (deserialized[MION_ROUTES.thrownErrors] ?? {}) as Record<string, RpcError<string>>;
  Object.entries(thrownErrors).forEach(([id, thrownError]) => {
    const subRequest = context.subRequestList[id];
    if (subRequest) {
      subRequest.isResolved = true;
      subRequest.error = thrownError;
    }
    errors.set(id, thrownError);
    if (thrownError.type !== 'validation-error') context.thrownErrorIds.add(id);
  });

  Object.entries(context.subRequestList).forEach(([id, methodMeta]) => {
    if (errors.has(id)) return;
    const resp = getResponseValueFromBodyOrHeader(id, deserialized, (context.response as Response).headers);
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
    if (!(id in context.subRequestList) && isRpcError(value)) setUndeclaredError(context, id, value, errors);
  });
}

function onError(context: ClientCallContext, error: any, stageMessage: string, errors: RequestErrors): void {
  // Check signal.reason before the isRpcError return: a later stage may have wrapped the abort as an RpcError.
  const reason = context.signal?.aborted ? context.signal.reason : undefined;
  if (reason instanceof DOMException) {
    if (reason.name === 'TimeoutError') {
      setUndeclaredError(
        context,
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
      setUndeclaredError(
        context,
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
    setUndeclaredError(context, CLIENT_REQUEST_ERROR_ID, error, errors);
    return;
  }
  const message = error?.message ? `${stageMessage}: ${error.message}` : `${stageMessage}: Unknown Error`;
  setUndeclaredError(
    context,
    CLIENT_REQUEST_ERROR_ID,
    new RpcError({
      type: error?.name || 'unknown-error',
      publicMessage: message,
      originalError: error instanceof Error ? error : undefined,
    }),
    errors
  );
}

function getResponseValueFromBodyOrHeader(id: string, respBody: ResponseBody, headers: Headers): any {
  const headersSubset = reconstructHeadersSubsetFromResponse(id, headers);
  if (headersSubset) return headersSubset;
  return respBody[id];
}

function isQueryRoute(context: ClientCallContext): boolean {
  if (context.batchSubRequests) return false;
  const meta = getMethod(context.requestId);
  // strict false value required for queries
  return meta?.options?.isMutation === false;
}

// ############# ON REQUEST HOOKS #############

/** The middlewares the cached metadata lists in the route's chain (standard flow) */
function getChainMiddlewareIds(context: ClientCallContext, errors: RequestErrors): string[] {
  const routeIds = new Set(getRouteIds(context));
  const chainIds = new Set<string>();
  for (const routeId of routeIds) {
    const methodMeta = getMethod(routeId);
    if (!methodMeta) {
      setUndeclaredError(
        context,
        routeId,
        new RpcError({
          type: 'route-metadata-not-found',
          publicMessage: `Metadata for Route '${routeId}' not found.`,
        }),
        errors
      );
      continue;
    }
    methodMeta.middlewareIds?.forEach((id) => !!id && !routeIds.has(id) && chainIds.add(id));
  }
  return [...chainIds];
}

/** Optimistic flow: the chain is not cached yet, but a middleware's group is part of its pointer */
function getScopedRequestHandlerIds(state: DispatchState): string[] {
  const routeIds = new Set(getRouteIds(state.context));
  const routePointers = getRoutePointers(state.context);
  return state.handlersRegistry.getRequestHandlerIds().filter((id) => {
    if (routeIds.has(id)) return false;
    const middlewarePointer = id.split(ROUTER_ITEM_SEPARATOR_CHAR);
    return routePointers.some((routePointer) => isMiddlewareInScope(middlewarePointer, routePointer));
  });
}

/** Runs each middleware's onRequest once per call, in chain order; awaits only when one returns a promise */
function runRequestHandlers(state: DispatchState, ids: string[]): Promise<void> | void {
  const pending: Promise<void>[] = [];
  for (const id of ids) {
    if (state.context.subRequestList[id] || state.askedRequestHandlers.has(id)) continue;
    const entry = state.handlersRegistry.getRequestHandler(id);
    if (!entry) continue;
    state.askedRequestHandlers.add(id);
    const running = runRequestHandler(state.context, id, entry);
    if (running) pending.push(running);
  }
  if (pending.length) return Promise.all(pending).then(() => undefined);
}

function runRequestHandler(context: ClientCallContext, id: string, entry: RequestHandlerEntry): Promise<void> | void {
  let subRequest: SubRequest<any> | undefined;
  let isOpen = true;
  // the last call wins; a call after the handler finished belongs to no request
  const call = (...params: any[]) => {
    if (isOpen) subRequest = entry.createSubRequest(params);
  };
  const finish = () => {
    isOpen = false;
    if (subRequest) addSubRequest(context, subRequest);
  };
  const fail = (error: unknown): never => {
    isOpen = false;
    throw requestHandlerError(id, error);
  };
  let returned: void | Promise<void>;
  try {
    returned = entry.handler(call, context);
  } catch (error) {
    return fail(error);
  }
  if (!isPromiseLike(returned)) return finish();
  return Promise.resolve(returned).then(finish, fail);
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return !!value && typeof (value as PromiseLike<unknown>).then === 'function';
}

/** Kept or wrapped, the error lands in the undeclared slot */
function requestHandlerError(id: string, error: unknown): RpcError<string> {
  if (isRpcError(error)) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new RpcError({
    type: 'middleware-on-request-failed',
    publicMessage: `onRequest for middleware '${id}' failed: ${message}`,
    originalError: error instanceof Error ? error : undefined,
  });
}

/** A middleware's scope is its pointer minus the last segment; a route is in scope when its pointer starts with it */
export function isMiddlewareInScope(middlewarePointer: string[], routePointer: string[]): boolean {
  const groupDepth = middlewarePointer.length - 1;
  if (groupDepth >= routePointer.length) return false;
  for (let i = 0; i < groupDepth; i++) if (middlewarePointer[i] !== routePointer[i]) return false;
  return true;
}

// ############# FETCH #############

/** GET only for a JSON query whose URL fits MAX_GET_URL_LENGTH; mutations, optimistic calls and batches POST */
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

// ############# RESULT #############

function getMiddlewareSubRequests(context: ClientCallContext): MiddlewareSubRequest<any>[] {
  const routeIds = new Set<string>();
  if (context.route) routeIds.add(context.route.id);
  if (context.batchSubRequests) context.batchSubRequests.forEach((sr) => routeIds.add(sr.id));
  return Object.entries(context.subRequestList)
    .filter(([id]) => !routeIds.has(id))
    .map(([, subRequest]) => subRequest as MiddlewareSubRequest<any>);
}

interface MiddlewareResponsesOutcome {
  errors: RequestErrors | undefined;
  /** middlewares whose hook asked for a retry that was allowed */
  retryIds: string[];
}

/** onError fires only for a middleware's declared (returned) errors; thrown ones reach the undeclared slot only */
async function runMiddlewareResponses(
  state: DispatchState,
  middlewareSubRequests: MiddlewareSubRequest<any>[],
  errors: RequestErrors | undefined,
  retriedBy: ReadonlySet<string>
): Promise<MiddlewareResponsesOutcome> {
  const {context, handlersRegistry} = state;
  const retryIds: string[] = [];
  const pending: Promise<void>[] = [];
  let retrySafe: boolean | undefined;
  /** Records the retry and says whether it will happen; the rule is worked out once per attempt */
  const requestRetry = (id: string): boolean => {
    if (retriedBy.has(id)) return false;
    retrySafe ??= isRetrySafe(state, errors);
    if (!retrySafe) return false;
    if (!retryIds.includes(id)) retryIds.push(id);
    return true;
  };
  // every middleware gets this context, with its own retry
  const baseContext: MiddlewareContext = {
    route: context.route,
    batchSubRequests: context.batchSubRequests,
    subRequestList: context.subRequestList,
    options: context.options,
    signal: context.signal,
    retry: () => false,
  };
  for (const middleware of middlewareSubRequests) {
    const id = middleware.id;
    const middlewareError = errors?.get(id);
    const isErrorHandler = !!middlewareError;
    if (isErrorHandler && context.thrownErrorIds.has(id)) continue;
    if (!isErrorHandler && middleware.resolvedValue === undefined) continue;
    // a retry asked after the handler finished belongs to no attempt
    let isOpen = true;
    const middlewareContext: MiddlewareContext = {...baseContext, retry: () => isOpen && requestRetry(id)};
    const handlerName = isErrorHandler ? 'onError' : 'onResponse';
    const fail = (error: unknown) => {
      isOpen = false;
      errors ??= new Map();
      if (!errors.has(CLIENT_REQUEST_ERROR_ID))
        errors.set(CLIENT_REQUEST_ERROR_ID, middlewareHandlerError(handlerName, id, error));
    };
    let returned: unknown;
    try {
      returned = isErrorHandler
        ? handlersRegistry.executeHandler(id, middlewareError, middlewareContext)
        : handlersRegistry.executeResponseHandler(id, middleware.resolvedValue, middlewareContext);
    } catch (error) {
      fail(error);
      continue;
    }
    if (!isPromiseLike(returned)) {
      isOpen = false;
      continue;
    }
    pending.push(
      Promise.resolve(returned).then(
        () => {
          isOpen = false;
        },
        (error) => fail(error)
      )
    );
  }
  if (pending.length) await Promise.all(pending);
  // a failed handler ends the call: its error is the answer, not a resend
  if (errors?.has(CLIENT_REQUEST_ERROR_ID) && retryIds.length) retryIds.length = 0;
  return {errors, retryIds};
}

/** Safe when nothing was sent, or when every route is a query or did not succeed */
function isRetrySafe(state: DispatchState, errors: RequestErrors | undefined): boolean {
  if (!state.sent) return true;
  return getRouteIds(state.context).every(
    (id) => getMethod(id)?.options?.isMutation === false || !routeSucceeded(state.context, id, errors)
  );
}

/** A void route answers nothing, so any error in the response counts it as failed */
function routeSucceeded(context: ClientCallContext, routeId: string, errors: RequestErrors | undefined): boolean {
  if (errors?.has(routeId)) return false;
  if (context.subRequestList[routeId]?.resolvedValue !== undefined) return true;
  return !errors?.size;
}

/** Hook-driven retries ask every onRequest again: a hook usually retries because what it sends changed */
function resetForMiddlewareRetry(state: DispatchState): void {
  const {context} = state;
  const routeIds = new Set(getRouteIds(context));
  for (const id of Object.keys(context.subRequestList)) {
    if (!routeIds.has(id)) delete context.subRequestList[id];
  }
  Object.values(context.subRequestList).forEach((sr) => {
    sr.isResolved = false;
    sr.resolvedValue = undefined;
    sr.error = undefined;
  });
  context.thrownErrorIds.clear();
  context.response = undefined;
  state.askedRequestHandlers.clear();
  state.sent = false;
}

/** A metadata resend keeps what onRequest hooks sent: the params did not change, only how they are written */
function resetForMetadataResend(state: DispatchState): void {
  const {context} = state;
  delete context.subRequestList[state.metadataId!];
  Object.values(context.subRequestList).forEach((sr) => {
    sr.isResolved = false;
    sr.resolvedValue = undefined;
    sr.error = undefined;
  });
  context.thrownErrorIds.clear();
  context.response = undefined;
  state.sent = false;
}

/** Kept or wrapped, the error lands in the undeclared slot */
function middlewareHandlerError(handlerName: 'onResponse' | 'onError', id: string, error: unknown): RpcError<string> {
  if (isRpcError(error)) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new RpcError({
    type: handlerName === 'onError' ? 'middleware-on-error-failed' : 'middleware-on-response-failed',
    publicMessage: `${handlerName} for middleware '${id}' failed: ${message}`,
    originalError: error instanceof Error ? error : undefined,
  });
}

/** Slot rules are pinned in test/errorDispatch.spec.ts; slot 2 takes the first undeclared error, middlewares first */
function buildResult(
  state: DispatchState,
  middlewares: MiddlewareSubRequest<any>[],
  errors: RequestErrors | undefined
): BatchResult<RouteSubRequest<any>[]> | Result<any, any> {
  const {context} = state;
  const {route: routeSubRequest, batchSubRequests, thrownErrorIds} = context;
  const middlewaresResults = {} as Record<string, any>;
  const processedIds = new Set<string>();
  const expectedErrorFor = (id: string): RpcError<string> | undefined => {
    const error = errors?.get(id);
    return error && !thrownErrorIds.has(id) ? error : undefined;
  };

  let routeResultPart: any;
  let routeErrorPart: any;
  const routeIds: string[] = [];

  if (routeSubRequest) {
    routeIds.push(routeSubRequest.id);
    routeErrorPart = expectedErrorFor(routeSubRequest.id);
    routeResultPart = routeSubRequest.resolvedValue;
  } else if (batchSubRequests) {
    const routeResults: any[] = [];
    const routeErrors: any[] = [];
    for (const batchRoute of batchSubRequests) {
      routeIds.push(batchRoute.id);
      routeErrors.push(expectedErrorFor(batchRoute.id));
      routeResults.push(batchRoute.resolvedValue);
    }
    routeResultPart = routeResults.some((r) => r !== undefined) ? routeResults : undefined;
    routeErrorPart = routeErrors.some((e) => e !== undefined) ? routeErrors : undefined;
  }
  routeIds.forEach((id) => processedIds.add(id));

  const middlewaresErrors = {} as Record<string, any>;
  let undeclaredPart: RpcError<string> | undefined;
  for (const middleware of middlewares) {
    const name = middleware.id;
    processedIds.add(name);
    if (middleware.resolvedValue !== undefined) middlewaresResults[name] = middleware.resolvedValue;
    const middlewareError = errors?.get(middleware.id);
    if (!middlewareError) continue;
    if (thrownErrorIds.has(middleware.id)) {
      // a middleware's thrown error is undeclared, its typed record cannot carry it
      if (undeclaredPart === undefined) undeclaredPart = middlewareError;
    } else {
      middlewaresErrors[name] = middlewareError;
    }
  }

  if (errors && undeclaredPart === undefined) {
    for (const id of routeIds) {
      const routeThrownError = errors.get(id);
      if (routeThrownError && thrownErrorIds.has(id)) {
        undeclaredPart = routeThrownError;
        break;
      }
    }
  }
  if (errors && undeclaredPart === undefined) {
    // request-scoped errors (transport, platform, framework) and ids outside this request
    for (const [id, error] of errors) {
      if (!processedIds.has(id)) {
        undeclaredPart = error;
        break;
      }
    }
  }

  // Framework errors the router never saw take the first free undeclared slot rather than rejecting: the call ran.
  if (undeclaredPart === undefined) undeclaredPart = takeBundledApiError();
  if (undeclaredPart === undefined) undeclaredPart = takeApiVersionError();
  if (undeclaredPart === undefined) undeclaredPart = state.fetcher?.takeError();

  return [routeResultPart, routeErrorPart, undeclaredPart, middlewaresResults, middlewaresErrors] as any;
}
