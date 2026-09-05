/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {DEFAULT_PREFILL_OPTIONS} from './constants.ts';
import {
  ClientOptions,
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
import type {RpcError} from '@mionjs/core';
import {getRouterItemId} from '@mionjs/core';
import {MionClientRequest} from './request.ts';
import type {RunTypeError} from '@mionjs/core';
import {HandlersRegistry} from './lib/handlersRegistry.ts';
import {MionSubRequest} from './subRequest.ts';

export function initClient<RM extends RemoteApi>(
  options: InitClientOptions
): {client: MionClient; routes: ClientRoutes<RM>; middleFns: ClientMiddleFns<RM>} {
  const clientOptions = {
    ...DEFAULT_PREFILL_OPTIONS,
    ...options,
  };
  const client = new MionClient(clientOptions);
  const rootProxy = new MethodProxy([], client, clientOptions);
  return {
    client,
    routes: rootProxy.proxy as ClientRoutes<RM>,
    middleFns: rootProxy.proxy as ClientMiddleFns<RM>,
  };
}

export class MionClient {
  /** Shared registry for persistent middleFn error handlers */
  readonly handlersRegistry = new HandlersRegistry();

  /** In-memory cache for prefilled middleFn subrequests (keyed by baseURL:middleFnId) */
  readonly prefilledMiddleFnsCache = new Map<string, SubRequest<any>>();

  /** Tracks in-flight prefill operations to avoid race conditions */
  private pendingPrefills: Promise<void>[] = [];

  private globalAbortController = new AbortController();
  private get globalSignal(): AbortSignal {
    return this.globalAbortController.signal;
  }

  constructor(private clientOptions: ClientOptions) {}

  /** Aborts all in-flight requests. New requests after this call work normally. */
  abort(): void {
    this.globalAbortController.abort();
    this.globalAbortController = new AbortController();
  }

  /** Composes a single AbortSignal from global, per-request, and timeout signals */
  private composeSignal(signal?: AbortSignal, timeout?: number): AbortSignal {
    const signals: AbortSignal[] = [this.globalSignal];
    if (signal) signals.push(signal);
    const effectiveTimeout = timeout ?? this.clientOptions.timeout;
    if (effectiveTimeout !== undefined) signals.push(AbortSignal.timeout(effectiveTimeout));
    return AbortSignal.any(signals);
  }

  /** Executes a single route call, or a batch (its routes + the build-injected batch id), with optional middleFns */
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

    // Wait for any in-flight prefill operations to complete before executing the request
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

  /** Named record entries keep their names; middleFns that took part in the request but are not in the
   * record (restored prefills) are added under their id, so their results/errors are never dropped */
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

  /** Get route IDs from single route or batch routes */
  private getRouteIds(
    routeSubRequest: RouteSubRequest<any> | undefined,
    batchSubRequests: RouteSubRequest<any>[] | undefined
  ): Set<string> {
    const routeIds = new Set<string>();
    if (routeSubRequest) routeIds.add(routeSubRequest.id);
    if (batchSubRequests) batchSubRequests.forEach((sr) => routeIds.add(sr.id));
    return routeIds;
  }

  /** Get all middleFns from the request's subRequestList, excluding the route(s) */
  private getAllMiddleFnsFromRequest(
    request: MionClientRequest<any, any>,
    excludedIds: Set<string>
  ): MiddlewareSubRequest<any>[] {
    return Object.entries(request.subRequestList)
      .filter(([id]) => !excludedIds.has(id))
      .map(([, subRequest]) => subRequest as MiddlewareSubRequest<any>);
  }

  /** Process all middleFn responses - call success or error handlers for each middleFn individually.
   * onError listeners are the typed channel: they fire only for a middleFn's declared (returned) errors,
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

  /** Build the result 5-tuple [result, error, fatal, middleFnResults, middleFnErrors] per the dispatch contract:
   * - slot 1 gets ONLY the route's own declared errors | ValidationError (thrown route errors do not qualify)
   * - slot 4 gets each middleFn's DECLARED errors | ValidationError, keyed by name - one entry per middleFn,
   *   so no information is lost when several fail
   * - slot 2 (fatal) gets what NOBODY declared: a thrown/undeclared error (route or middleFn), request-scoped
   *   transport/platform/framework errors, and errors for middleFns that were not part of this request. When
   *   several exist it holds the first in execution order (middleFns run before the route)
   * - slot 0 keeps the route result whatever else failed; no error ever crosses into another slot */
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
    let fatalPart: RpcError<string> | undefined;
    const middleFnEntries: [string, MiddlewareSubRequest<any>][] = Array.isArray(middleFns)
      ? middleFns.map((middleFn) => [middleFn.id, middleFn])
      : Object.entries(middleFns);
    for (const [name, middleFn] of middleFnEntries) {
      processedIds.add(middleFn.id);
      if (middleFn.resolvedValue !== undefined) middleFnsResults[name] = middleFn.resolvedValue;
      const middleFnError = errors?.get(middleFn.id);
      if (!middleFnError) continue;
      if (thrownErrorIds.has(middleFn.id)) {
        // a middleFn's thrown/undeclared error is fatal - its typed record cannot carry it
        if (fatalPart === undefined) fatalPart = middleFnError;
      } else {
        middleFnsErrors[name] = middleFnError;
      }
    }

    if (errors && fatalPart === undefined) {
      // the route's own thrown/undeclared error
      for (const id of routeIds) {
        const routeThrownError = errors.get(id);
        if (routeThrownError && thrownErrorIds.has(id)) {
          fatalPart = routeThrownError;
          break;
        }
      }
    }
    if (errors && fatalPart === undefined) {
      // request-scoped errors (transport, platform, framework) and errors keyed to ids that were
      // not part of this request (e.g. a required middleFn the caller never sent)
      for (const [id, error] of errors) {
        if (!processedIds.has(id)) {
          fatalPart = error;
          break;
        }
      }
    }

    return [routeResultPart, routeErrorPart, fatalPart, middleFnsResults, middleFnsErrors] as any;
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

  /** Clear all error handlers from the registry and abort in-flight requests */
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
