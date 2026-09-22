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
  ClientMiddleFns,
  Result,
  BatchResult,
} from './types.ts';
import type {RemoteApi} from '@mionjs/router';
import type {InjectBuildVersion} from '@mionjs/run-types';
import {RpcError} from '@mionjs/core';
import {getRouterItemId} from '@mionjs/core';
import {MionClientRequest} from './request.ts';
import type {RunTypeError} from '@mionjs/core';
import {HandlersRegistry} from './lib/handlersRegistry.ts';
import {MionSubRequest} from './subRequest.ts';
import {getBundleApiMode} from './lib/bundleApiMode.ts';
import {setApiBuildVersion, takeApiVersionError} from './lib/apiBuildVersion.ts';
import {registerBundledApi, takeBundledApiError} from '#bundled-api';
import {metadataCacheHooks} from './lib/metadataFromServerLoader.ts';

/** Under the build's `bundleApi` option the metadata and compiled functions of every route are injected
 * at the call sites, so the client never asks the server; that module comes from the build, not this call. */
export function initClient<RM extends RemoteApi>(
  options: InitClientOptions,
  buildVersion?: InjectBuildVersion<RM>
): {client: MionClient; routes: ClientRoutes<RM>; middleFns: ClientMiddleFns<RM>} {
  setApiBuildVersion(buildVersion);
  const clientOptions = {...DEFAULT_PREFILL_OPTIONS, ...options};
  const client = new MionClient(clientOptions);
  const rootProxy = new MethodProxy([], client, clientOptions);
  return {
    client,
    routes: rootProxy.proxy as ClientRoutes<RM>,
    middleFns: rootProxy.proxy as ClientMiddleFns<RM>,
  };
}

export class MionClient {
  readonly handlersRegistry = new HandlersRegistry();

  /** prefilled middleFn subrequests, keyed `baseURL:middleFnId` */
  readonly prefilledMiddleFnsCache = new Map<string, SubRequest<any>>();

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
    middleFnsRecord?: Record<string, MiddlewareSubRequest<any>>,
    signal?: AbortSignal,
    timeout?: number
  ): Promise<any> {
    return this.executeRequest(routeSubRequest, batchSubRequests, batchId, middleFnsRecord, signal, timeout);
  }

  private async executeRequest<Routes extends RouteSubRequest<any>[], H extends Record<string, MiddlewareSubRequest<any>>>(
    routeSubRequest: RouteSubRequest<any> | undefined,
    batchSubRequests: Routes | undefined,
    batchId: string | undefined,
    middleFnsRecord: H | undefined,
    signal?: AbortSignal,
    timeout?: number
  ): Promise<any> {
    // Capture the signal before any async work so abort() during prefill await is respected
    const composedSignal = this.composeSignal(signal, timeout);

    if (this.pendingPrefills.length > 0) await Promise.allSettled(this.pendingPrefills);

    const middleFnSubRequests = middleFnsRecord ? Object.values(middleFnsRecord) : [];
    const request = new MionClientRequest(
      this.clientOptions,
      this.prefilledMiddleFnsCache,
      routeSubRequest,
      middleFnSubRequests,
      batchSubRequests,
      batchId,
      composedSignal
    );

    try {
      await request.call();
      const routeIds = this.getRouteIds(routeSubRequest, batchSubRequests);
      const allMiddleFns = this.getAllMiddleFnsFromRequest(request, routeIds);
      this.processMiddleFnsResponses(allMiddleFns, undefined, request.thrownErrorIds);
      return this.buildResult(
        routeSubRequest,
        batchSubRequests,
        this.mergeMiddleFns(middleFnsRecord, allMiddleFns),
        undefined,
        request.thrownErrorIds
      );
    } catch (errors: any) {
      const routeIds = this.getRouteIds(routeSubRequest, batchSubRequests);
      const allMiddleFns = this.getAllMiddleFnsFromRequest(request, routeIds);
      this.processMiddleFnsResponses(allMiddleFns, errors, request.thrownErrorIds);
      return this.buildResult(
        routeSubRequest,
        batchSubRequests,
        this.mergeMiddleFns(middleFnsRecord, allMiddleFns),
        errors,
        request.thrownErrorIds
      );
    }
  }

  /** A restored prefill is not in the record, so it is added under its id and its result is never dropped */
  private mergeMiddleFns(
    middleFnsRecord: Record<string, MiddlewareSubRequest<any>> | undefined,
    allMiddleFns: MiddlewareSubRequest<any>[]
  ): Record<string, MiddlewareSubRequest<any>> | MiddlewareSubRequest<any>[] {
    if (!middleFnsRecord) return allMiddleFns;
    const recordIds = new Set(Object.values(middleFnsRecord).map((middleFn) => middleFn.id));
    const merged: Record<string, MiddlewareSubRequest<any>> = {...middleFnsRecord};
    for (const middleFn of allMiddleFns) if (!recordIds.has(middleFn.id)) merged[middleFn.id] = middleFn;
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

  private getAllMiddleFnsFromRequest(
    request: MionClientRequest<any, any>,
    excludedIds: Set<string>
  ): MiddlewareSubRequest<any>[] {
    return Object.entries(request.subRequestList)
      .filter(([id]) => !excludedIds.has(id))
      .map(([, subRequest]) => subRequest as MiddlewareSubRequest<any>);
  }

  /** onError listeners are the typed channel: they fire only for a middleFn's declared (returned) errors,
   * never for thrown/undeclared ones, which reach the unexpected slot only */
  private processMiddleFnsResponses(
    middleFnSubRequests: MiddlewareSubRequest<any>[],
    errors: RequestErrors | undefined,
    thrownErrorIds: ReadonlySet<string>
  ): void {
    for (const middleFn of middleFnSubRequests) {
      const middleFnError = errors?.get(middleFn.id);
      if (middleFnError) {
        if (!thrownErrorIds.has(middleFn.id)) this.handlersRegistry.executeHandler(middleFn.id, middleFnError);
      } else if (middleFn.resolvedValue !== undefined) {
        this.handlersRegistry.executeSuccessHandler(middleFn.id, middleFn.resolvedValue);
      }
    }
  }

  /** The dispatch contract of [result, error, undeclared, middleFnResults, middleFnErrors]:
   * - slot 1: ONLY the route's own declared errors | ValidationError (a thrown route error does not qualify)
   * - slot 4: each middleFn's DECLARED errors | ValidationError by name, one entry each, so several failures are kept
   * - slot 2: what NOBODY declared (a thrown route or middleFn error, transport/platform/framework, an error for a
   *   middleFn not part of this request); when several exist, the first in execution order (middleFns before the route)
   * - slot 0: the route result whatever else failed; no error ever crosses into another slot */
  private buildResult<Routes extends RouteSubRequest<any>[], H extends Record<string, MiddlewareSubRequest<any>>>(
    routeSubRequest: RouteSubRequest<any> | undefined,
    batchSubRequests: Routes | undefined,
    middleFns: H | MiddlewareSubRequest<any>[],
    errors: RequestErrors | undefined,
    thrownErrorIds: ReadonlySet<string>
  ): BatchResult<Routes, H> | Result<any, any> {
    const middleFnsResults = {} as Record<string, any>;
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

    // middleFns can be a named record (from call({middleFns}) / batch) or an array (from executeCall)
    const middleFnsErrors = {} as Record<string, any>;
    let undeclaredPart: RpcError<string> | undefined;
    const middleFnEntries: [string, MiddlewareSubRequest<any>][] = Array.isArray(middleFns)
      ? middleFns.map((middleFn) => [middleFn.id, middleFn])
      : Object.entries(middleFns);
    for (const [name, middleFn] of middleFnEntries) {
      processedIds.add(middleFn.id);
      if (middleFn.resolvedValue !== undefined) middleFnsResults[name] = middleFn.resolvedValue;
      const middleFnError = errors?.get(middleFn.id);
      if (!middleFnError) continue;
      if (thrownErrorIds.has(middleFn.id)) {
        // a middleFn's thrown error is undeclared, its typed record cannot carry it
        if (undeclaredPart === undefined) undeclaredPart = middleFnError;
      } else {
        middleFnsErrors[name] = middleFnError;
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

    return [routeResultPart, routeErrorPart, undeclaredPart, middleFnsResults, middleFnsErrors] as any;
  }

  typeErrors<List extends SubRequest<any>[]>(...subRequest: List): Promise<RunTypeError[]> {
    const request = new MionClientRequest(this.clientOptions, this.prefilledMiddleFnsCache);
    return request.validateParams(subRequest);
  }

  prefill<List extends MiddlewareSubRequest<any>[]>(...subRequest: List): Promise<void> {
    const request = new MionClientRequest(this.clientOptions, this.prefilledMiddleFnsCache);
    const promise = request.prefill(subRequest);
    this.pendingPrefills.push(promise);
    void promise.finally(() => {
      const index = this.pendingPrefills.indexOf(promise);
      if (index >= 0) void this.pendingPrefills.splice(index, 1);
    });
    return promise;
  }

  removePrefill<List extends MiddlewareSubRequest<any>[]>(...subRequest: List): Promise<void> {
    const request = new MionClientRequest(this.clientOptions, this.prefilledMiddleFnsCache);
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
