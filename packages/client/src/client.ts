/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {DEFAULT_PREFILL_OPTIONS} from './constants.ts';
import {
  BundleApiMode,
  ClientOptions,
  InjectedApiMetadata,
  MiddlewareSubRequest,
  InitClientOptions,
  RouteSubRequest,
  SubRequest,
  RequestErrors,
  ClientRoutes,
  ClientMiddlewares,
  Result,
  BatchResult,
} from './types.ts';
import type {RemoteApi} from '@mionjs/router';
import type {InjectBuildVersion, InjectRouterOptions} from '@mionjs/run-types';
import {RpcError} from '@mionjs/core';
import {getRouterItemId} from '@mionjs/core';
import {MionClientRequest} from './request.ts';
import type {RunTypeError} from '@mionjs/core';
import {HandlersRegistry} from './lib/handlersRegistry.ts';
import {MionSubRequest} from './subRequest.ts';
import {getBundleApiMode} from './lib/bundleApiMode.ts';
import {setApiBuildVersion, takeApiVersionError} from './lib/apiBuildVersion.ts';
import {setInjectedRouterOptions} from './lib/syncRoutes.ts';
import {registerBundledApi, takeBundledApiError} from '#bundled-api';
import {metadataCacheHooks} from './lib/metadataFromServerLoader.ts';

/** Under the build's `bundleApi` option the metadata and compiled functions of every route are injected
 * at the call sites, so the client never asks the server; that module comes from the build, not this call.
 * `buildVersion` and `routerOptions` are filled by the build from the API type, never by hand. */
export function initClient<RM extends RemoteApi>(
  options: InitClientOptions,
  buildVersion?: InjectBuildVersion<RM>,
  routerOptions?: InjectRouterOptions<RM>
): {client: MionClient; routes: ClientRoutes<RM>; middlewares: ClientMiddlewares<RM>} {
  setApiBuildVersion(buildVersion);
  setInjectedRouterOptions(options.baseURL, routerOptions);
  const clientOptions = {...DEFAULT_PREFILL_OPTIONS, ...options};
  const client = new MionClient(clientOptions);
  const rootProxy = new MethodProxy([], client, clientOptions);
  return {
    client,
    routes: rootProxy.proxy as ClientRoutes<RM>,
    middlewares: rootProxy.proxy as ClientMiddlewares<RM>,
  };
}

export class MionClient {
  readonly handlersRegistry = new HandlersRegistry();

  /** prefilled middleware subrequests, keyed `baseURL:middlewareId` */
  readonly prefilledMiddlewaresCache = new Map<string, SubRequest<any>>();

  /** in-flight prefills, awaited before a request executes */
  private pendingPrefills: Promise<void>[] = [];

  private globalAbortController = new AbortController();
  private get globalSignal(): AbortSignal {
    return this.globalAbortController.signal;
  }

  constructor(private clientOptions: ClientOptions) {}

  /** The lane the build put this client on; undefined means the fetched lane. */
  get bundleApiMode(): BundleApiMode | undefined {
    return getBundleApiMode();
  }

  /** Registers the metadata and compiled functions a dispatch point received from the build. */
  useBundledApi(apiMetadata: InjectedApiMetadata | undefined): void {
    if (apiMetadata !== undefined) registerBundledApi(apiMetadata);
  }

  /** Aborts all in-flight requests. New requests after this call work normally. */
  abort(): void {
    this.globalAbortController.abort();
    this.globalAbortController = new AbortController();
  }

  private composeSignal(signal?: AbortSignal, timeout?: number): AbortSignal {
    const signals: AbortSignal[] = [this.globalSignal];
    if (signal) signals.push(signal);
    const effectiveTimeout = timeout ?? this.clientOptions.timeout;
    if (effectiveTimeout !== undefined) signals.push(AbortSignal.timeout(effectiveTimeout));
    return AbortSignal.any(signals);
  }

  execute(
    routeSubRequest?: RouteSubRequest<any>,
    batchSubRequests?: RouteSubRequest<any>[],
    batchId?: string,
    middlewaresRecord?: Record<string, MiddlewareSubRequest<any>>,
    signal?: AbortSignal,
    timeout?: number
  ): Promise<any> {
    return this.executeRequest(routeSubRequest, batchSubRequests, batchId, middlewaresRecord, signal, timeout);
  }

  private async executeRequest<Routes extends RouteSubRequest<any>[], H extends Record<string, MiddlewareSubRequest<any>>>(
    routeSubRequest: RouteSubRequest<any> | undefined,
    batchSubRequests: Routes | undefined,
    batchId: string | undefined,
    middlewaresRecord: H | undefined,
    signal?: AbortSignal,
    timeout?: number
  ): Promise<any> {
    // Capture the signal before any async work so abort() during prefill await is respected
    const composedSignal = this.composeSignal(signal, timeout);

    if (this.pendingPrefills.length > 0) await Promise.allSettled(this.pendingPrefills);

    const middlewareSubRequests = middlewaresRecord ? Object.values(middlewaresRecord) : [];
    const request = new MionClientRequest(
      this.clientOptions,
      this.prefilledMiddlewaresCache,
      routeSubRequest,
      middlewareSubRequests,
      batchSubRequests,
      batchId,
      composedSignal
    );

    try {
      await request.call();
      const routeIds = this.getRouteIds(routeSubRequest, batchSubRequests);
      const allMiddlewares = this.getAllMiddlewaresFromRequest(request, routeIds);
      this.processMiddlewaresResponses(allMiddlewares, undefined, request.thrownErrorIds);
      return this.buildResult(
        routeSubRequest,
        batchSubRequests,
        this.mergeMiddlewares(middlewaresRecord, allMiddlewares),
        undefined,
        request.thrownErrorIds
      );
    } catch (errors: any) {
      const routeIds = this.getRouteIds(routeSubRequest, batchSubRequests);
      const allMiddlewares = this.getAllMiddlewaresFromRequest(request, routeIds);
      this.processMiddlewaresResponses(allMiddlewares, errors, request.thrownErrorIds);
      return this.buildResult(
        routeSubRequest,
        batchSubRequests,
        this.mergeMiddlewares(middlewaresRecord, allMiddlewares),
        errors,
        request.thrownErrorIds
      );
    }
  }

  /** A restored prefill is not in the record, so it is added under its id and its result is never dropped */
  private mergeMiddlewares(
    middlewaresRecord: Record<string, MiddlewareSubRequest<any>> | undefined,
    allMiddlewares: MiddlewareSubRequest<any>[]
  ): Record<string, MiddlewareSubRequest<any>> | MiddlewareSubRequest<any>[] {
    if (!middlewaresRecord) return allMiddlewares;
    const recordIds = new Set(Object.values(middlewaresRecord).map((middleware) => middleware.id));
    const merged: Record<string, MiddlewareSubRequest<any>> = {...middlewaresRecord};
    for (const middleware of allMiddlewares) if (!recordIds.has(middleware.id)) merged[middleware.id] = middleware;
    return merged;
  }

  private getRouteIds(
    routeSubRequest: RouteSubRequest<any> | undefined,
    batchSubRequests: RouteSubRequest<any>[] | undefined
  ): Set<string> {
    const routeIds = new Set<string>();
    if (routeSubRequest) routeIds.add(routeSubRequest.id);
    if (batchSubRequests) batchSubRequests.forEach((sr) => routeIds.add(sr.id));
    return routeIds;
  }

  private getAllMiddlewaresFromRequest(
    request: MionClientRequest<any, any>,
    excludedIds: Set<string>
  ): MiddlewareSubRequest<any>[] {
    return Object.entries(request.subRequestList)
      .filter(([id]) => !excludedIds.has(id))
      .map(([, subRequest]) => subRequest as MiddlewareSubRequest<any>);
  }

  /** onError listeners are the typed channel: they fire only for a middleware's declared (returned) errors,
   * never for thrown/undeclared ones, which reach the unexpected slot only */
  private processMiddlewaresResponses(
    middlewareSubRequests: MiddlewareSubRequest<any>[],
    errors: RequestErrors | undefined,
    thrownErrorIds: ReadonlySet<string>
  ): void {
    for (const middleware of middlewareSubRequests) {
      const middlewareError = errors?.get(middleware.id);
      if (middlewareError) {
        if (!thrownErrorIds.has(middleware.id)) this.handlersRegistry.executeHandler(middleware.id, middlewareError);
      } else if (middleware.resolvedValue !== undefined) {
        this.handlersRegistry.executeSuccessHandler(middleware.id, middleware.resolvedValue);
      }
    }
  }

  /** The dispatch contract of [result, error, undeclared, middlewareResults, middlewareErrors]:
   * - slot 1: ONLY the route's own declared errors | ValidationError (a thrown route error does not qualify)
   * - slot 4: each middleware's DECLARED errors | ValidationError by name, one entry each, so several failures are kept
   * - slot 2: what NOBODY declared (a thrown route or middleware error, transport/platform/framework, an error for a
   *   middleware not part of this request); when several exist, the first in execution order (middlewares before the route)
   * - slot 0: the route result whatever else failed; no error ever crosses into another slot */
  private buildResult<Routes extends RouteSubRequest<any>[], H extends Record<string, MiddlewareSubRequest<any>>>(
    routeSubRequest: RouteSubRequest<any> | undefined,
    batchSubRequests: Routes | undefined,
    middlewares: H | MiddlewareSubRequest<any>[],
    errors: RequestErrors | undefined,
    thrownErrorIds: ReadonlySet<string>
  ): BatchResult<Routes, H> | Result<any, any> {
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

    // middlewares can be a named record (from call({middlewares}) / batch) or an array (from executeCall)
    const middlewaresErrors = {} as Record<string, any>;
    let undeclaredPart: RpcError<string> | undefined;
    const middlewareEntries: [string, MiddlewareSubRequest<any>][] = Array.isArray(middlewares)
      ? middlewares.map((middleware) => [middleware.id, middleware])
      : Object.entries(middlewares);
    for (const [name, middleware] of middlewareEntries) {
      processedIds.add(middleware.id);
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
      // the route's own thrown/undeclared error
      for (const id of routeIds) {
        const routeThrownError = errors.get(id);
        if (routeThrownError && thrownErrorIds.has(id)) {
          undeclaredPart = routeThrownError;
          break;
        }
      }
    }
    if (errors && undeclaredPart === undefined) {
      // request-scoped errors (transport, platform, framework) and errors keyed to ids not part of this request
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
    if (undeclaredPart === undefined) undeclaredPart = metadataCacheHooks()?.takeMetadataCacheError();

    return [routeResultPart, routeErrorPart, undeclaredPart, middlewaresResults, middlewaresErrors] as any;
  }

  typeErrors<List extends SubRequest<any>[]>(...subRequest: List): Promise<RunTypeError[]> {
    const request = new MionClientRequest(this.clientOptions, this.prefilledMiddlewaresCache);
    return request.validateParams(subRequest);
  }

  prefill<List extends MiddlewareSubRequest<any>[]>(...subRequest: List): Promise<void> {
    const request = new MionClientRequest(this.clientOptions, this.prefilledMiddlewaresCache);
    const promise = request.prefill(subRequest);
    this.pendingPrefills.push(promise);
    void promise.finally(() => {
      const index = this.pendingPrefills.indexOf(promise);
      if (index >= 0) void this.pendingPrefills.splice(index, 1);
    });
    return promise;
  }

  removePrefill<List extends MiddlewareSubRequest<any>[]>(...subRequest: List): Promise<void> {
    const request = new MionClientRequest(this.clientOptions, this.prefilledMiddlewaresCache);
    return request.removePrefill(subRequest);
  }

  destroy(): void {
    this.abort();
    this.handlersRegistry.clearAll();
  }
}

class MethodProxy {
  propsProxies: Record<string, MethodProxy> = {};
  handler = {
    apply: (_target: any, _thisArg: any, argArray?: any): RouteSubRequest<any> & MiddlewareSubRequest<any> => {
      const handlerId = getRouterItemId(this.parentProps);
      return new MionSubRequest(this.parentProps, handlerId, argArray, this.client);
    },

    get: (_target: any, prop: string): typeof Proxy => {
      const existing = this.propsProxies[prop];
      if (existing) return existing.proxy;
      const newMethodProxy = new MethodProxy([...this.parentProps, prop], this.client, this.clientOptions);
      this.propsProxies[prop] = newMethodProxy;
      return newMethodProxy.proxy;
    },
  };

  proxy: typeof Proxy;

  constructor(
    public parentProps: string[],
    private client: MionClient,
    private clientOptions: ClientOptions
  ) {
    const target = () => null;
    this.proxy = new Proxy(target, this.handler);
  }
}
