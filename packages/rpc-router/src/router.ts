/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Route, RouterOptions, Routes, RouterEntry} from './types/general.ts';
import type {
  RemoteMethod,
  MethodsExecutionChain,
  RawMethod,
  HeadersMethod,
  MiddlewareMethod,
  RouteMethod,
} from './types/remoteMethods.ts';
import type {PublicApi, PrivateDef, MiddlewaresCollection} from './types/publicMethods.ts';
import type {InjectBuildVersion} from '@mionjs/run-types';
import type {HeadersMiddlewareDef, MiddlewareDef, RawMiddlewareDef} from './types/definitions.ts';
import {DEFAULT_ROUTE_OPTIONS, MAX_ROUTE_NESTING} from './constants.ts';
import {
  isRawMiddlewareDef,
  isHeadersMiddlewareDef,
  isExecutable,
  isMiddlewareDef,
  isRoute,
  isRoutes,
  isAnyMiddlewareDef,
  isPublicExecutable,
} from './types/guards.ts';
import {
  BUILD_VERSION_HEADER,
  HandlerType,
  isTestEnv,
  resetRoutesCache,
  getOrCreateGlobal,
  resolveParser,
  DEFAULT_MAX_BODY_SIZE,
} from '@mionjs/core';
import {getRawMethodReflection, getHandlerReflection, assertCompiledParser} from './lib/reflection.ts';
import {resolveChainMaxBodySize} from './lib/bodyLimit.ts';
import {callerForType} from './dispatch.ts';
import {serializerMiddlewares} from './routes/serializer.routes.ts';
import {
  getRouterItemId,
  getRoutePath,
  getENV,
  MION_ROUTES,
  MION_BATCH_KEY,
  routesCache,
  isUnsafePropertyName,
} from '@mionjs/core';
import {setErrorOptions} from '@mionjs/core';
import {getPublicApi, resetRemoteMethodsMetadata} from './lib/remoteMethods.ts';
import {
  mionClientRoutes,
  mionClientMiddlewares,
  mionInternalRouteIds,
  useOnDemandMetadataCaller,
} from './routes/client.routes.ts';
import {mionErrorsRoutes, notFoundMiddleware, batchNotFoundMiddleware} from './routes/errors.routes.ts';
import {capBatchBodySizes, clearBatches, getMaxBatchBodySize, refreshBatchChainBodyLimits} from './batches.ts';
import {headersFn, middleware, mutation, query, rawMiddleware, route} from './lib/handlers.ts';
import type {
  HeadersFnHelper,
  MiddlewareHelper,
  MionRouter,
  RawMiddlewareHelper,
  RouteHelper,
  RouterOptionsInput,
  RouterOptionsArg,
} from './types/mionRouter.ts';

type RouterKeyEntryList = [string, RouterEntry][];
type RoutesWithId = {
  pathPointer: string[];
  routes: Routes;
};

// ############# PRIVATE STATE #############

const flatRouter = getOrCreateGlobal('mion.router.flatRouter', () => new Map<string, MethodsExecutionChain>()); // Main Router
/** mion's two not-found chains (an unknown path, an unknown batch id) are NOT routes and not in the
 *  router above: each is the global middleware behind a first member that throws, and is rebuilt on
 *  every registration because that middleware is. */
const notFoundChains = getOrCreateGlobal('mion.router.notFoundChains', () => new Map<string, MethodsExecutionChain>());
const middlewaresById = getOrCreateGlobal(
  'mion.router.middlewaresById',
  () => new Map<string, MiddlewareMethod | HeadersMethod | RawMethod>()
);
const routesById = getOrCreateGlobal('mion.router.routesById', () => new Map<string, RouteMethod>());
const rawMiddlewaresById = getOrCreateGlobal('mion.router.rawMiddlewaresById', () => new Map<string, RawMethod>());
const middlewareNames = getOrCreateGlobal('mion.router.middlewareNames', () => new Set<string>());
const routeNames = getOrCreateGlobal('mion.router.routeNames', () => new Set<string>());
let complexity = 0;
let routerOptions: RouterOptions = {...DEFAULT_ROUTE_OPTIONS};
let isRouterInitialized = false;
let isRouterCreated = false;
let allExecutablesIds: string[] | undefined;
let platformConfig: Record<string, unknown> | undefined;
/** Merged once by initRouter and then only read, so no request rebuilds it. */
let globalResponseHeaders: Readonly<Record<string, string>> = Object.freeze({});
/** One merge per adapter defaults object, emptied whenever globalResponseHeaders is replaced. */
let mergedResponseHeaders = new WeakMap<object, Readonly<Record<string, string>>>();
/** The adapter's `maxBodySize` under its `maxBodySizeCap`, settled by setPlatformConfig (the default with no adapter). */
let platformMaxBodySize = DEFAULT_MAX_BODY_SIZE;

/** Run before and after every middleware or route set through `mion.initRoutes` */
const defaultStartMiddlewares = {
  mionDeserializeRequest: serializerMiddlewares.mionDeserializeRequest,
};
const defaultEndMiddlewares = {
  ...mionClientMiddlewares,
  mionSerializeResponse: serializerMiddlewares.mionSerializeResponse,
};
/** True once any registered method answers with a promise. */
let hasAsyncMethods = false;
/** What the dispatcher reads per request: both inputs are fixed once registration is done (the options
 *  are frozen, no further method can register), so it is resolved there rather than on every call. */
let alwaysAwait = false;
let startMiddlewaresDef: MiddlewaresCollection = {...defaultStartMiddlewares};
let endMiddlewaresDef: MiddlewaresCollection = {...defaultEndMiddlewares};
export let startMiddlewares: RemoteMethod[] = [];
export let endMiddlewares: RemoteMethod[] = [];

// ############# PUBLIC METHODS #############

export const getRouteExecutionChain = (path: string) => flatRouter.get(path);
/** The chain that answers an unknown path or an unknown batch id, by its `MION_ROUTES` id. */
export const getNotFoundExecutionChain = (id: string) => notFoundChains.get(id);
export const getRouteEntries = () => flatRouter.entries();
export const geRoutesSize = () => flatRouter.size;
export const getRouteExecutable = (id: string) => routesById.get(id);
export const getMiddlewareExecutable = (id: string) => middlewaresById.get(id);
export const getMiddlewaresSize = () => middlewaresById.size;
export const getComplexity = () => complexity;
/** False means the whole router is synchronous, so the dispatcher can skip its awaits. */
export const getHasAsyncMethods = () => hasAsyncMethods;
/** The `alwaysAwait` option asks for it, and it is only honoured when there is something async to wait for. */
export const getAlwaysAwait = () => alwaysAwait;
export const getRouterOptions = <Opts extends RouterOptions>(): Readonly<Opts> => routerOptions as Opts;
/** The headers every response starts with. Adapters read it through getResponseDefaults. */
export const getGlobalResponseHeaders = (): Readonly<Record<string, string>> => globalResponseHeaders;

/** Merged once per `own`, so no request rebuilds it; `base` names are the adapter's own, a global may replace them. */
export function getResponseDefaults(
  own: Record<string, string>,
  base?: Record<string, string>
): Readonly<Record<string, string>> {
  let merged = mergedResponseHeaders.get(own);
  if (!merged) {
    merged = Object.freeze({...base, ...globalResponseHeaders, ...own});
    mergedResponseHeaders.set(own, merged);
  }
  return merged;
}
export const getAnyExecutable = (id: string) => routesById.get(id) || middlewaresById.get(id) || rawMiddlewaresById.get(id);

/** Called automatically by platform adapters: the adapter's `maxBodySize` and `maxBodySizeCap` are
 *  settled here, once, so no request reads the config. */
export function setPlatformConfig(config: Record<string, unknown>): void {
  platformConfig = config;
  const published = config.maxBodySize;
  platformMaxBodySize = Math.min(
    typeof published === 'number' ? published : DEFAULT_MAX_BODY_SIZE,
    readMaxBodySizeCap(config) ?? Infinity
  );
  if (isRouterInitialized) applyMaxBodySizeCap();
  // Unconditional, and NOT inside applyMaxBodySizeCap: that returns early when the adapter published no
  // cap, while platformMaxBodySize still changed under every chain that declared nothing of its own.
  refreshChainBodyLimits();
}

export const getPlatformConfig = (): Readonly<Record<string, unknown>> | undefined => platformConfig;

export const resetRouter = () => {
  flatRouter.clear();
  notFoundChains.clear();
  middlewaresById.clear();
  routesById.clear();
  rawMiddlewaresById.clear();
  middlewareNames.clear();
  routeNames.clear();
  complexity = 0;
  routerOptions = {...DEFAULT_ROUTE_OPTIONS};
  startMiddlewaresDef = {...defaultStartMiddlewares};
  endMiddlewaresDef = {...defaultEndMiddlewares};
  startMiddlewares = [];
  endMiddlewares = [];
  hasAsyncMethods = false;
  alwaysAwait = false;
  isRouterInitialized = false;
  isRouterCreated = false;
  allExecutablesIds = undefined;
  platformConfig = undefined;
  globalResponseHeaders = Object.freeze({});
  mergedResponseHeaders = new WeakMap();
  platformMaxBodySize = DEFAULT_MAX_BODY_SIZE;
  resetRemoteMethodsMetadata();
  resetRoutesCache();
  clearBatches();
  // resetJitFnCaches() is deliberately NOT called: the JIT caches are global, and the
  // serializableClassRegistry it clears is needed to (de)serialize classes like RpcError.
  // Only a test of AOT cache loading calls it.
};

/** The ONE way to initialize the router and to declare routes and middlewares: the options are written once
 *  and carried BY TYPE into every helper the factory returns, so a handler's `ctx.shared` is typed from
 *  `contextDataFactory` and router-wide defaults can be read at build time. The helpers are plain closures
 *  (no `this`), so destructuring them is fine. Create the router once per app: a second call throws until
 *  `resetRouter()` (tests) clears it. */
export function createMionRouter<const O extends RouterOptionsInput = RouterOptionsInput>(
  opts?: RouterOptionsArg<O>
): MionRouter<O> {
  if (isRouterCreated)
    throw new Error(
      'createMionRouter has already been called: create the router once per app (resetRouter() clears it in tests)'
    );
  isRouterCreated = true;
  const options = Object.freeze({...opts}) as Readonly<O>;
  return {
    options,
    route: route as RouteHelper<O>,
    query: query as RouteHelper<O, false>,
    mutation: mutation as RouteHelper<O, true>,
    middleware: middleware as MiddlewareHelper<O>,
    headersFn: headersFn as HeadersFnHelper<O>,
    rawMiddleware: rawMiddleware as RawMiddlewareHelper<O>,
    initRoutes<R extends Routes>(routes: R, buildVersion?: InjectBuildVersion<PublicApi<R>>): PublicApi<R> {
      initRouter(options, buildVersion);
      const api = registerRoutes(routes);
      if (platformConfig) applyMaxBodySizeCap();
      refreshChainBodyLimits();
      return api;
    },
  };
}

/** Initializes the router options and the internal error / client routes. Once per app (`resetRouter()` clears it). */
function initRouter(opts: RouterOptionsInput, buildVersion?: string): void {
  if (isRouterInitialized) throw new Error('Router has already been initialized');
  // still compiles next to any other option, and ignoring it would silently turn the check off
  if (Object.hasOwn(opts, 'syncRoutes'))
    throw new Error(
      "The syncRoutes option was removed: put mionSyncRoutes from '@mionjs/router/middlewares' first in your routes."
    );
  routerOptions = {...routerOptions, ...opts};
  const versionHeader = routerOptions.apiVersionCheck && buildVersion ? {[BUILD_VERSION_HEADER]: buildVersion} : undefined;
  globalResponseHeaders = Object.freeze({...versionHeader, ...routerOptions.globalResponseHeaders});
  mergedResponseHeaders = new WeakMap();
  validateSharedDataFactory(routerOptions);
  Object.freeze(routerOptions);
  setErrorOptions(routerOptions);
  isRouterInitialized = true;
  registerRoutes({...mionErrorsRoutes});
  if (!routerOptions.skipClientRoutes) registerRoutes({...mionClientRoutes});
  if (!isTestEnv()) console.log('mion router initialized', {routerOptions});
}

function registerRoutes<R extends Routes>(routes: R): PublicApi<R> {
  if (!isRouterInitialized) throw new Error('the router must be initialized first');
  startMiddlewares = getExecutablesFromMiddlewaresCollection(startMiddlewaresDef);
  endMiddlewares = getExecutablesFromMiddlewaresCollection(endMiddlewaresDef);
  // the metadata middleware is in every chain: give it the caller that skips its params pipeline unless a
  // client asked for metadata
  const metadataMiddleware = middlewaresById.get(MION_ROUTES.methodsMetadata);
  if (metadataMiddleware) useOnDemandMetadataCaller(metadataMiddleware as RemoteMethod);
  recursiveFlatRoutes(routes, [], [], [], 0);
  buildNotFoundChains();
  // every method this call could register is registered and the options are frozen, so the await rule is
  // settled here instead of on every request
  alwaysAwait = routerOptions.alwaysAwait && hasAsyncMethods;
  allExecutablesIds = undefined; // the memoized id list must see the routes registered by this call
  if (shouldFullGenerateSpec()) {
    return getPublicApi(routes);
  }
  return {} as PublicApi<R>;
}

/** Adds middlewares at the start of the ExecutionChain, before the existing start middlewares by default */
export function addStartMiddlewares(middlewaresDef: MiddlewaresCollection, appendBeforeExisting = true) {
  if (isRouterInitialized) throw new Error('Can not add start middlewares after the router has been initialized');
  if (appendBeforeExisting) {
    startMiddlewaresDef = {...middlewaresDef, ...startMiddlewaresDef};
    return;
  }
  startMiddlewaresDef = {...startMiddlewaresDef, ...middlewaresDef};
}

/** Adds middlewares at the end of the ExecutionChain, after the existing end middlewares by default */
export function addEndMiddlewares(middlewaresDef: MiddlewaresCollection, prependAfterExisting = true) {
  if (isRouterInitialized) throw new Error('Can not add end middlewares after the router has been initialized');
  if (prependAfterExisting) {
    endMiddlewaresDef = {...endMiddlewaresDef, ...middlewaresDef};
    return;
  }
  endMiddlewaresDef = {...middlewaresDef, ...endMiddlewaresDef};
}

export function isPrivateDefinition(entry: RouterEntry, id: string): entry is PrivateDef {
  if (isRoute(entry)) return false;
  if (isRawMiddlewareDef(entry)) return true;
  try {
    const executable = getMiddlewareExecutable(id) || getRouteExecutable(id);
    if (!executable) throw new Error(`Route or Middleware ${id} not found. Please check you have called mion.initRoutes first.`);
    return !isPublicExecutable(executable);
  } catch {
    // a Routes object has no handler, so no executable is found
    return false;
  }
}

export function getTotalExecutables(): number {
  return routesById.size + middlewaresById.size + rawMiddlewaresById.size;
}

export function getAllExecutablesIds(): string[] {
  if (allExecutablesIds) return allExecutablesIds;
  allExecutablesIds = [...routesById.keys(), ...middlewaresById.keys(), ...rawMiddlewaresById.keys()];
  return allExecutablesIds;
}

// used by codegen
export function shouldFullGenerateSpec(): boolean {
  return routerOptions.getPublicRoutesData || getENV('GENERATE_ROUTER_SPEC') === 'true';
}

// ############# PRIVATE METHODS #############

/** Flattens the routes object into a list of Executable objects. `currentPointer` is the position in that
 *  object (i.e. ['users', 'get']); `preMiddlewares` / `postMiddlewares` are the middlewares one level up, before
 *  and after that position. */
function recursiveFlatRoutes(
  routes: Routes,
  currentPointer: string[] = [],
  preMiddlewares: RemoteMethod[] = [],
  postMiddlewares: RemoteMethod[] = [],
  nestLevel = 0
) {
  if (nestLevel > MAX_ROUTE_NESTING)
    throw new Error('Too many nested routes, you can only nest routes ${MAX_ROUTE_NESTING} levels');

  const entries = Object.entries(routes);
  if (entries.length === 0)
    throw new Error(`Invalid route: ${currentPointer.length ? joinPath(...currentPointer) : '*'}. Can Not define empty routes`);

  let minus1Props: ReturnType<typeof getRouteEntryProperties> | null = null;
  for (let index = 0; index < entries.length; index++) {
    const [key, item] = entries[index];
    const newPointer = [...currentPointer, key];
    let routeEntry: RemoteMethod | RoutesWithId;
    if (typeof key !== 'string' || !isNaN(key as any))
      throw new Error(`Invalid route: ${joinPath(...newPointer)}. Numeric route names are not allowed`);
    if (key.includes(',')) throw new Error(`Invalid route: ${joinPath(...newPointer)}. Route names cannot contain commas.`);
    // a route id is used as an object key on both ends of the wire, so a prototype name can never be one
    if (isUnsafePropertyName(key))
      throw new Error(`Invalid route: ${joinPath(...newPointer)}. '${key}' is not a valid route name.`);
    if (key === MION_BATCH_KEY)
      throw new Error(`Invalid route: ${joinPath(...newPointer)}. '${MION_BATCH_KEY}' is a reserved mion route name.`);

    if (isAnyMiddlewareDef(item)) {
      // a start or end middleware already owns this id, and would otherwise be silently reused in its place
      if (nestLevel === 0 && (Object.hasOwn(startMiddlewaresDef, key) || Object.hasOwn(endMiddlewaresDef, key)))
        throw new Error(`Invalid middleware: ${joinPath(...newPointer)}. '${key}' is a reserved mion middleware name.`);
      routeEntry = getExecutableFromAnyMiddleware(item, newPointer, nestLevel);
      if (middlewareNames.has(routeEntry.id))
        throw new Error(
          `Invalid middleware: ${joinPath(...newPointer)}. Naming collision, Naming collision, duplicated middleware.`
        );
      middlewareNames.add(routeEntry.id);
    } else if (isRoute(item)) {
      routeEntry = getExecutableFromRoute(item, newPointer, nestLevel);
      if (routeNames.has(routeEntry.id))
        throw new Error(`Invalid route: ${joinPath(...newPointer)}. Naming collision, duplicated route`);
      routeNames.add(routeEntry.id);
    } else if (isRoutes(item)) {
      routeEntry = {
        pathPointer: newPointer,
        routes: item,
      };
    } else {
      const itemType = typeof item;
      throw new Error(`Invalid route: ${joinPath(...newPointer)}. Type <${itemType}> is not a valid route.`);
    }

    minus1Props = recursiveCreateExecutionChain(
      routeEntry,
      newPointer,
      preMiddlewares,
      postMiddlewares,
      nestLevel,
      index,
      entries,
      minus1Props
    );

    complexity++;
  }
}

function recursiveCreateExecutionChain(
  routeEntry: RemoteMethod | RoutesWithId,
  currentPointer: string[],
  preMiddlewares: RemoteMethod[],
  postMiddlewares: RemoteMethod[],
  nestLevel: number,
  index: number,
  routeKeyedEntries: RouterKeyEntryList,
  minus1Props: ReturnType<typeof getRouteEntryProperties> | null
) {
  const minus1 = getEntry(index - 1, routeKeyedEntries);
  const plus1 = getEntry(index + 1, routeKeyedEntries);
  const props = getRouteEntryProperties(minus1, routeEntry, plus1);

  if (props.isBetweenRoutes && minus1Props) {
    props.preLevelMiddlewares = minus1Props.preLevelMiddlewares;
    props.postLevelMiddlewares = minus1Props.postLevelMiddlewares;
  } else {
    for (let i = 0; i < routeKeyedEntries.length; i++) {
      const [k, entry] = routeKeyedEntries[i];
      complexity++;
      if (!isAnyMiddlewareDef(entry)) continue;
      const newPointer = [...currentPointer.slice(0, -1), k];
      const executable = getExecutableFromAnyMiddleware(entry, newPointer, nestLevel);
      if (i < index) props.preLevelMiddlewares.push(executable);
      if (i > index) props.postLevelMiddlewares.push(executable);
    }
  }
  const isExec = isExecutable(routeEntry);

  if (isExec && props.isRoute) {
    const path = getRoutePath(routeEntry.pointer, routerOptions);
    const routeMethod = routeEntry as RouteMethod;
    const levelMethods = [
      ...preMiddlewares,
      ...props.preLevelMiddlewares,
      routeEntry,
      ...props.postLevelMiddlewares,
      ...postMiddlewares,
    ];
    const methods = [...startMiddlewares, ...levelMethods, ...endMiddlewares];
    // internal error routes are never client-called: platform's size, not their no-params tuple's tiny one
    const maxBodySize = mionInternalRouteIds.has(routeMethod.id)
      ? routeMethod.options.maxBodySize
      : resolveChainMaxBodySize(methods, routeMethod, routerOptions);
    // published in the metadata; undefined means the platform's, filled in when the metadata is read
    if (maxBodySize !== undefined) routeMethod.options.maxBodySize = maxBodySize;
    const executionChain: MethodsExecutionChain = {
      routeIndex: startMiddlewares.length + preMiddlewares.length + props.preLevelMiddlewares.length,
      methods,
      path,
      declaredBodySize: maxBodySize,
      maxBodySize: maxBodySize ?? platformMaxBodySize,
      readsBody: true,
    };
    // route-level only: a global start/end middleware is not in the API type, so a built client never lists it
    const middlewareIds = getPublicMiddlewareIds(levelMethods);
    // add middleware deps, so can be serialized with the router
    if (middlewareIds.length) routeMethod.middlewareIds = middlewareIds;
    flatRouter.set(path, executionChain);
  } else if (!isExec) {
    recursiveFlatRoutes(
      routeEntry.routes,
      routeEntry.pathPointer,
      [...preMiddlewares, ...props.preLevelMiddlewares],
      [...props.postLevelMiddlewares, ...postMiddlewares],
      nestLevel + 1
    );
  }

  return props;
}

/** The thrower goes first so the dispatcher skips every later non-`alwaysRun` member; body size is the platform's. */
function buildNotFoundChains(): void {
  notFoundChains.clear();
  const throwers = [
    [MION_ROUTES.notFound, notFoundMiddleware],
    [MION_ROUTES.batchNotFound, batchNotFoundMiddleware],
  ] as const;
  for (const [id, middlewareDef] of throwers) {
    const methods = [getExecutableFromRawMiddleware(middlewareDef, [id], 0), ...startMiddlewares, ...endMiddlewares];
    notFoundChains.set(id, {
      routeIndex: -1, // there is no route in this chain
      methods,
      // a shared chain answers for many paths, so the request brings its own
      path: undefined,
      declaredBodySize: undefined,
      maxBodySize: platformMaxBodySize,
      readsBody: false,
    });
  }
}

function getExecutableFromAnyMiddleware(
  middleware: MiddlewareDef | HeadersMiddlewareDef | RawMiddlewareDef,
  middlewarePointer: string[],
  nestLevel: number
) {
  if (isRawMiddlewareDef(middleware)) return getExecutableFromRawMiddleware(middleware, middlewarePointer, nestLevel);
  return getExecutableFromMiddleware(middleware, middlewarePointer, nestLevel);
}

export function getExecutableFromMiddleware(
  middleware: MiddlewareDef | HeadersMiddlewareDef,
  middlewarePointer: string[],
  nestLevel: number
): MiddlewareMethod | HeadersMethod {
  const isHeader = isHeadersMiddlewareDef(middleware);
  // todo fix header id should be same as any other one and then maybe map from id to header name
  const middlewareId = getRouterItemId(middlewarePointer);
  const existing = middlewaresById.get(middlewareId);
  if (existing) return existing as MiddlewareMethod;

  type MixedMiddleware = (Omit<MiddlewareMethod, 'type'> | Omit<HeadersMethod, 'type'>) & {
    type: typeof HandlerType.middleware | typeof HandlerType.headersMiddleware;
  };

  let executable: MixedMiddleware;
  {
    const parser = resolveParser(middleware.options?.parser, routerOptions.parser, middlewareId);
    const reflectionData = getHandlerReflection(middleware, middlewareId, routerOptions, middleware.options ?? {}, isHeader);
    assertCompiledParser(middlewareId, parser, reflectionData);
    const middlewareType = isHeader ? HandlerType.headersMiddleware : HandlerType.middleware;
    executable = {
      id: middlewareId,
      type: middlewareType,
      nestLevel,
      handler: middleware.handler,
      pointer: middlewarePointer,
      // resolved here so the dispatch loop reads a field instead of deriving them per request
      methodCaller: callerForType(middlewareType),
      alwaysRun: !!middleware.options?.alwaysRun,
      quotedId: JSON.stringify(middlewareId),
      ...reflectionData,
      options: {
        alwaysRun: !!middleware.options?.alwaysRun,
        validateParams: middleware.options?.validateParams ?? true,
        validateReturn: middleware.options?.validateReturn ?? false,
        description: middleware.options?.description,
        parser,
        sanitizeParams: middleware.options?.sanitizeParams ?? routerOptions.sanitizeParams,
      },
    };
    // a middleware's maxBodySize is its OWN contribution to every chain it sits in, never resolved;
    // written only when set, so the metadata a client receives carries no `undefined` key
    if (middleware.options?.maxBodySize !== undefined) executable.options.maxBodySize = middleware.options.maxBodySize;
  }

  if (executable.isAsync) hasAsyncMethods = true;
  middlewaresById.set(middlewareId, executable as any);
  routesCache.setMethodJitFns(middlewareId, executable as any);
  return executable as any;
}

export function getExecutableFromRawMiddleware(
  middleware: RawMiddlewareDef,
  middlewarePointer: string[],
  nestLevel: number
): RawMethod {
  const middlewareId = getRouterItemId(middlewarePointer);
  const existing = rawMiddlewaresById.get(middlewareId);
  if (existing) return existing as RawMethod;
  const reflectionData = getRawMethodReflection(middleware.handler, middlewareId, routerOptions);
  const executable: RawMethod = {
    id: middlewareId,
    type: HandlerType.rawMiddleware,
    nestLevel,
    handler: middleware.handler,
    pointer: middlewarePointer,
    methodCaller: callerForType(HandlerType.rawMiddleware),
    alwaysRun: !!middleware.options?.alwaysRun,
    quotedId: JSON.stringify(middlewareId),
    ...reflectionData,
    options: {
      alwaysRun: !!middleware.options?.alwaysRun,
      validateParams: false,
      validateReturn: false,
      description: middleware.options?.description,
    },
  };
  if (executable.isAsync) hasAsyncMethods = true;
  rawMiddlewaresById.set(middlewareId, executable);
  routesCache.setMethodJitFns(middlewareId, executable as any);
  return executable;
}

export function getExecutableFromRoute(route: Route, routePointer: string[], nestLevel: number): RouteMethod {
  const routeId = getRouterItemId(routePointer);
  const existing = routesById.get(routeId);
  if (existing) return existing as RouteMethod;

  let executable: RouteMethod;
  {
    const parser = resolveParser(route.options?.parser, routerOptions.parser, routeId);
    const reflectionData = getHandlerReflection(route, routeId, routerOptions, route.options ?? {}, false);
    assertCompiledParser(routeId, parser, reflectionData);
    executable = {
      id: routeId,
      type: HandlerType.route,
      nestLevel,
      handler: route.handler,
      pointer: routePointer,
      methodCaller: callerForType(HandlerType.route),
      alwaysRun: false,
      quotedId: JSON.stringify(routeId),
      ...reflectionData,
      options: {
        alwaysRun: false,
        validateParams: route.options?.validateParams ?? true,
        validateReturn: route.options?.validateReturn ?? false,
        description: route.options?.description,
        parser,
        isMutation: route.options?.isMutation,
        sanitizeParams: route.options?.sanitizeParams ?? routerOptions.sanitizeParams,
      },
    };
    // the route option as written; the chain resolution overwrites it with the resolved number
    if (route.options?.maxBodySize !== undefined) executable.options.maxBodySize = route.options.maxBodySize;
  }
  if (executable.isAsync) hasAsyncMethods = true;
  routesById.set(routeId, executable);
  routesCache.setMethodJitFns(routeId, executable as any);
  return executable;
}

function getPublicMiddlewareIds(methods: RemoteMethod[]): string[] {
  const ids = methods
    .filter((exec) => isPublicExecutable(exec))
    .map((exec) => getRouterItemId(exec.pointer))
    .filter((mfId) => {
      if (mionInternalRouteIds.has(mfId)) return false;
      const exec = getMiddlewareExecutable(mfId);
      return exec && isPublicExecutable(exec);
    });
  return ids;
}

function getEntry(index: number, keyEntryList: RouterKeyEntryList) {
  return keyEntryList[index]?.[1];
}

function getRouteEntryProperties(
  minus1: RouterEntry | undefined,
  zero: RemoteMethod | RoutesWithId,
  plus1: RouterEntry | undefined
) {
  const minus1IsRoute = minus1 && isRoute(minus1);
  const zeroIsRoute = (zero as RemoteMethod).type === HandlerType.route;
  const plus1IsRoute = plus1 && isRoute(plus1);

  const isExec = !!(zero as RemoteMethod).handler;

  return {
    isBetweenRoutes: minus1IsRoute && zeroIsRoute && plus1IsRoute,
    isExecutable: isExec,
    isRoute: zeroIsRoute,
    preLevelMiddlewares: [] as RemoteMethod[],
    postLevelMiddlewares: [] as RemoteMethod[],
  };
}

function getExecutablesFromMiddlewaresCollection(
  middlewaresDef: MiddlewaresCollection
): (RawMethod | MiddlewareMethod | HeadersMethod)[] {
  const results: (RawMethod | MiddlewareMethod | HeadersMethod)[] = [];
  for (const [key, middleware] of Object.entries(middlewaresDef)) {
    if (isRawMiddlewareDef(middleware)) {
      results.push(getExecutableFromRawMiddleware(middleware, [key], 0));
    } else if (isHeadersMiddlewareDef(middleware) || isMiddlewareDef(middleware)) {
      results.push(getExecutableFromMiddleware(middleware, [key], 0));
    } else {
      throw new Error(`Invalid middleware: ${key}. Invalid middleware definition`);
    }
  }
  return results;
}

function validateSharedDataFactory(opts?: Partial<RouterOptions>): void {
  if (!opts?.contextDataFactory) return;
  const testSharedData = opts.contextDataFactory();
  if (
    typeof testSharedData !== 'object' ||
    Array.isArray(testSharedData) ||
    testSharedData === null ||
    Object.keys(testSharedData).length === 0
  ) {
    throw new Error('contextDataFactory must return a plain object with at least one property');
  }
}

/** Hand-rolled: Node's 'path' module is not available in edge runtimes. */
function joinPath(...parts: string[]): string {
  return parts.filter(Boolean).join('/');
}

// ############# PLATFORM SIZE LIMITS #############

/** What a route takes when its own option is unset and its types cannot say: the adapter's `maxBodySize`,
 *  published with its config at start, else the shared default (a router driven with no adapter, as in tests). */
export const getPlatformMaxBodySize = (): number => platformMaxBodySize;

/** The platform's own request ceiling, when the adapter published one. */
export const getPlatformRequestCap = (): number | undefined => readMaxBodySizeCap(platformConfig);

/** The largest limit any registered route or batch resolves to: what a platform with ONE native,
 *  server-wide read limit (bun) starts with, so it never refuses a body a route allows. */
export function getMaxRouteBodySize(): number {
  let largest = getPlatformMaxBodySize();
  for (const chain of flatRouter.values()) largest = Math.max(largest, chain.maxBodySize);
  return Math.max(largest, getMaxBatchBodySize());
}

/** The platform's own request ceiling the adapter published, in bytes; undefined means none. */
function readMaxBodySizeCap(config: Record<string, unknown> | undefined): number | undefined {
  const cap = config?.maxBodySizeCap;
  return typeof cap === 'number' ? cap : undefined;
}

/** A limit above the platform's ceiling would promise a size the platform refuses before mion ever runs,
 *  so it is brought down. Applied once, when the adapter has published its config AND the routes are
 *  registered, whichever comes last. */
function applyMaxBodySizeCap(): void {
  const cap = readMaxBodySizeCap(platformConfig);
  if (cap === undefined) return;
  for (const chain of flatRouter.values()) {
    if (chain.declaredBodySize === undefined || chain.declaredBodySize <= cap) continue;
    chain.declaredBodySize = cap;
    const route = chain.methods[chain.routeIndex];
    if (route.options.maxBodySize !== undefined) route.options.maxBodySize = cap;
  }
  capBatchBodySizes(cap);
}

/** `maxBodySize` caches two inputs that both move after a chain is built: the cap above lowers what a
 *  chain declared, and `setPlatformConfig` replaces the fallback the chains that declared nothing read.
 *  Missing a refresh refuses bodies a route allows, or allows bodies past the platform's ceiling. */
function refreshChainBodyLimits(): void {
  for (const chain of flatRouter.values()) chain.maxBodySize = chain.declaredBodySize ?? platformMaxBodySize;
  for (const chain of notFoundChains.values()) chain.maxBodySize = chain.declaredBodySize ?? platformMaxBodySize;
  refreshBatchChainBodyLimits(platformMaxBodySize);
}
