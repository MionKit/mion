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
  ClientRoutes,
  ClientMiddlewares,
} from './types.ts';
import type {RemoteApi} from '@mionjs/router';
import type {InjectBuildVersion} from '@mionjs/run-types';
import {getRouterItemId} from '@mionjs/core';
import {createCallContext} from './callContext.ts';
import {dispatchCall, dispatchTypeErrors} from './dispatch.ts';
import type {RunTypeError} from '@mionjs/core';
import {HandlersRegistry} from './lib/handlersRegistry.ts';
import {TypedEvent} from './lib/typedEvent.ts';
import {MionSubRequest} from './subRequest.ts';
import {getBundleApiMode} from './lib/bundleApiMode.ts';
import {setApiBuildVersion} from './lib/apiBuildVersion.ts';
import {registerBundledApi} from '#bundled-api';
import {MIDDLEWARE_TARGET, type MiddlewareTarget} from './lib/metadataFetcher.ts';

/** A bundled route needs nothing from the server; `buildVersion` is build-filled, never by hand. */
export function initClient<RM extends RemoteApi>(
  options: InitClientOptions,
  buildVersion?: InjectBuildVersion<RM>
): {client: MionClient; routes: ClientRoutes<RM>; middlewares: ClientMiddlewares<RM>} {
  setApiBuildVersion(buildVersion);
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

  async execute(
    routeSubRequest?: RouteSubRequest<any>,
    batchSubRequests?: RouteSubRequest<any>[],
    batchId?: string,
    signal?: AbortSignal,
    timeout?: number
  ): Promise<any> {
    // Before any await, so an abort() while onRequest runs is respected
    const composedSignal = this.composeSignal(signal, timeout);
    const context = createCallContext(this.clientOptions, routeSubRequest, batchSubRequests, batchId, composedSignal);
    return dispatchCall(context, this.handlersRegistry);
  }

  typeErrors<List extends SubRequest<any>[]>(...subRequest: List): Promise<RunTypeError[]> {
    return dispatchTypeErrors(this.clientOptions, subRequest, this.handlersRegistry);
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
      if (this.isMiddleware && prop === (MIDDLEWARE_TARGET as unknown)) {
        return {id: getRouterItemId(this.parentProps), registry: this.client.handlersRegistry} satisfies MiddlewareTarget;
      }
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
