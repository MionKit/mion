/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {DEFAULT_CLIENT_OPTIONS, MIDDLEWARE_HOOKS} from './constants.ts';
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
import {TypedEvent} from './lib/typedEvent.ts';
import {MionSubRequest} from './subRequest.ts';
import {getBundleApiMode} from './lib/bundleApiMode.ts';
import {setApiBuildVersion, takeApiVersionError} from './lib/apiBuildVersion.ts';
import {setInjectedRouterOptions} from './lib/syncRoutes.ts';
import {registerBundledApi, takeBundledApiError} from '#bundled-api';
import {metadataCacheHooks} from './lib/metadataFromServerLoader.ts';

/** Under `bundleApi` the build injects every route's metadata and functions, so the client never asks the server.
 *  The build fills `buildVersion` and `routerOptions` from the API type, never by hand. */
export function initClient<RM extends RemoteApi>(
  options: InitClientOptions,
  buildVersion?: InjectBuildVersion<RM>,
  routerOptions?: InjectRouterOptions<RM>
): {client: MionClient; routes: ClientRoutes<RM>; middlewares: ClientMiddlewares<RM>} {
  setApiBuildVersion(buildVersion);
  setInjectedRouterOptions(options.baseURL, routerOptions);
  const clientOptions = {...DEFAULT_CLIENT_OPTIONS, ...options};
  const client = new MionClient(clientOptions);
  return {
    client,
    routes: new MethodProxy([], client, false).proxy as ClientRoutes<RM>,
    middlewares: new MethodProxy([], client, true).proxy as ClientMiddlewares<RM>,
  };
}

export class MionClient {
  readonly handlersRegistry = new HandlersRegistry();

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
    signal?: AbortSignal,
    timeout?: number
  ): Promise<any> {
    return this.executeRequest(routeSubRequest, batchSubRequests, batchId, signal, timeout);
  }

  private async executeRequest<Routes extends RouteSubRequest<any>[]>(
    routeSubRequest: RouteSubRequest<any> | undefined,
    batchSubRequests: Routes | undefined,
    batchId: string | undefined,
    signal?: AbortSignal,
    timeout?: number
  ): Promise<any> {
    // Before any await, so an abort() while onRequest runs is respected
    const composedSignal = this.composeSignal(signal, timeout);
    const request = new MionClientRequest(
      this.clientOptions,
      this.handlersRegistry,
      routeSubRequest,
      batchSubRequests,
      batchId,
      composedSignal
    );

    let errors: RequestErrors | undefined;
    try {
      await request.call();
    } catch (requestErrors: any) {
      errors = requestErrors;
    }
    const routeIds = this.getRouteIds(routeSubRequest, batchSubRequests);
    const middlewares = this.getAllMiddlewaresFromRequest(request, routeIds);
    this.processMiddlewaresResponses(middlewares, errors, request.thrownErrorIds);
    return this.buildResult(routeSubRequest, batchSubRequests, middlewares, errors, request.thrownErrorIds);
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

  private getAllMiddlewaresFromRequest(request: MionClientRequest, excludedIds: Set<string>): MiddlewareSubRequest<any>[] {
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
        this.handlersRegistry.executeResponseHandler(middleware.id, middleware.resolvedValue);
      }
    }
  }

  /** The dispatch contract of [result, error, undeclared, middlewareResults, middlewareErrors]:
   * - slot 1: ONLY the route's own declared errors | ValidationError (a thrown route error does not qualify)
   * - slot 4: each middleware's DECLARED errors | ValidationError by id, one entry each, so several failures are kept
   * - slot 2: what NOBODY declared (a thrown route or middleware error, transport/platform/framework, an error for a
   *   middleware not part of this request); when several exist, the first in execution order (middlewares before the route)
   * - slot 0: the route result whatever else failed; no error ever crosses into another slot */
  private buildResult<Routes extends RouteSubRequest<any>[]>(
    routeSubRequest: RouteSubRequest<any> | undefined,
    batchSubRequests: Routes | undefined,
    middlewares: MiddlewareSubRequest<any>[],
    errors: RequestErrors | undefined,
    thrownErrorIds: ReadonlySet<string>
  ): BatchResult<Routes> | Result<any, any> {
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
    const request = new MionClientRequest(this.clientOptions, this.handlersRegistry);
    return request.validateParams(subRequest);
  }

  destroy(): void {
    this.abort();
    this.handlersRegistry.clearAll();
  }
}

const middlewareHooks = new Set<string>(MIDDLEWARE_HOOKS);

class MethodProxy {
  propsProxies: Record<string, MethodProxy> = {};
  private events?: TypedEvent<any, any>;
  handler = {
    apply: (_target: any, _thisArg: any, argArray?: any): RouteSubRequest<any> & MiddlewareSubRequest<any> => {
      const handlerId = getRouterItemId(this.parentProps);
      return new MionSubRequest(this.parentProps, handlerId, argArray, this.client);
    },

    // On the middlewares tree hook names win, so no middleware can be named after one
    get: (_target: any, prop: string): any => {
      if (this.isMiddleware && middlewareHooks.has(prop)) return this.getEvents()[prop].bind(this.events);
      const existing = this.propsProxies[prop];
      if (existing) return existing.proxy;
      const newMethodProxy = new MethodProxy([...this.parentProps, prop], this.client, this.isMiddleware);
      this.propsProxies[prop] = newMethodProxy;
      return newMethodProxy.proxy;
    },
  };

  proxy: typeof Proxy;

  constructor(
    public parentProps: string[],
    private client: MionClient,
    private isMiddleware: boolean
  ) {
    const target = () => null;
    this.proxy = new Proxy(target, this.handler);
  }

  private getEvents(): TypedEvent<any, any> {
    if (!this.events) {
      const createSubRequest = (params: any[]) => this.handler.apply(null, null, params);
      this.events = new TypedEvent(getRouterItemId(this.parentProps), this.client.handlersRegistry, createSubRequest);
    }
    return this.events;
  }
}
