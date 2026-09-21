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
  MiddleFnMethod,
  RouteMethod,
} from './types/remoteMethods.ts';
import type {PublicApi, PrivateDef, MiddleFnsCollection} from './types/publicMethods.ts';
import type {HeadersMiddleFnDef, MiddleFnDef, RawMiddleFnDef} from './types/definitions.ts';
import {DEFAULT_ROUTE_OPTIONS, MAX_ROUTE_NESTING} from './constants.ts';
import {
  isRawMiddleFnDef,
  isHeadersMiddleFnDef,
  isExecutable,
  isMiddleFnDef,
  isRoute,
  isRoutes,
  isAnyMiddleFnDef,
  isPublicExecutable,
} from './types/guards.ts';
import {
  HandlerType,
  isTestEnv,
  resetRoutesCache,
  getOrCreateGlobal,
  resolveParser,
  DEFAULT_MAX_BODY_SIZE,
  SerializerModes,
} from '@mionjs/core';
import {getRawMethodReflection, getHandlerReflection, assertCompiledParser} from './lib/reflection.ts';
import {resolveChainMaxBodySize} from './lib/bodyLimit.ts';
import {callerForType} from './dispatch.ts';
import {serializerMiddleFns} from './routes/serializer.routes.ts';
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
import {mionClientRoutes, mionClientMiddleFns, useOnDemandMetadataCaller} from './routes/client.routes.ts';
import {mionErrorsRoutes, notFoundMiddleFn, batchNotFoundMiddleFn} from './routes/errors.routes.ts';
import {capBatchBodySizes, clearBatches, getMaxBatchBodySize, refreshBatchChainBodyLimits} from './batches.ts';
import {headersFn, middleFn, mutation, query, rawMiddleFn, route} from './lib/handlers.ts';
import type {
  HeadersFnHelper,
  MiddleFnHelper,
  MionRouter,
  RawMiddleFnHelper,
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

const mionInternalRoutes = Object.values(MION_ROUTES) as string[];
const flatRouter = getOrCreateGlobal('mion.router.flatRouter', () => new Map<string, MethodsExecutionChain>()); // Main Router
/** mion's two not-found chains (an unknown path, an unknown batch id) are NOT routes and not in the
 *  router above: each is the global middleFns behind a first member that throws, and is rebuilt on
 *  every registration because those middleFns are. */
const notFoundChains = getOrCreateGlobal('mion.router.notFoundChains', () => new Map<string, MethodsExecutionChain>());
const middleFnsById = getOrCreateGlobal(
  'mion.router.middleFnsById',
  () => new Map<string, MiddleFnMethod | HeadersMethod | RawMethod>()
);
const routesById = getOrCreateGlobal('mion.router.routesById', () => new Map<string, RouteMethod>());
const rawMiddleFnsById = getOrCreateGlobal('mion.router.rawMiddleFnsById', () => new Map<string, RawMethod>());
const middleFnNames = getOrCreateGlobal('mion.router.middleFnNames', () => new Set<string>());
const routeNames = getOrCreateGlobal('mion.router.routeNames', () => new Set<string>());
let complexity = 0;
let routerOptions: RouterOptions = {...DEFAULT_ROUTE_OPTIONS};
let isRouterInitialized = false;
let isRouterCreated = false;
let allExecutablesIds: string[] | undefined;
let platformConfig: Record<string, unknown> | undefined;
/** The adapter's `maxBodySize` under its `maxBodySizeCap`, settled by setPlatformConfig (the default with no adapter). */
let platformMaxBodySize = DEFAULT_MAX_BODY_SIZE;

/** Run before and after every middleFn or route set through `mion.initRoutes` */
const defaultStartMiddleFns = {
  mionDeserializeRequest: serializerMiddleFns.mionDeserializeRequest,
};
const defaultEndMiddleFns = {
  ...mionClientMiddleFns,
  mionSerializeResponse: serializerMiddleFns.mionSerializeResponse,
};
/** True once any registered method answers with a promise. */
let hasAsyncMethods = false;
/** What the dispatcher reads per request: both inputs are fixed once registration is done (the options
 *  are frozen, no further method can register), so it is resolved there rather than on every call. */
let alwaysAwait = false;
let startMiddleFnsDef: MiddleFnsCollection = {...defaultStartMiddleFns};
let endMiddleFnsDef: MiddleFnsCollection = {...defaultEndMiddleFns};
export let startMiddleFns: RemoteMethod[] = [];
export let endMiddleFns: RemoteMethod[] = [];

// ############# PUBLIC METHODS #############

export const getRouteExecutionChain = (path: string) => flatRouter.get(path);
/** The chain that answers an unknown path or an unknown batch id, by its `MION_ROUTES` id. */
export const getNotFoundExecutionChain = (id: string) => notFoundChains.get(id);
export const getRouteEntries = () => flatRouter.entries();
export const geRoutesSize = () => flatRouter.size;
export const getRouteExecutable = (id: string) => routesById.get(id);
export const getMiddleFnExecutable = (id: string) => middleFnsById.get(id);
export const geMiddleFnsSize = () => middleFnsById.size;
export const getComplexity = () => complexity;
/** False means the whole router is synchronous, so the dispatcher can skip its awaits. */
export const getHasAsyncMethods = () => hasAsyncMethods;
/** The `alwaysAwait` option asks for it, and it is only honoured when there is something async to wait for. */
export const getAlwaysAwait = () => alwaysAwait;
export const getRouterOptions = <Opts extends RouterOptions>(): Readonly<Opts> => routerOptions as Opts;
export const getAnyExecutable = (id: string) => routesById.get(id) || middleFnsById.get(id) || rawMiddleFnsById.get(id);

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
  middleFnsById.clear();
  routesById.clear();
  rawMiddleFnsById.clear();
  middleFnNames.clear();
  routeNames.clear();
  complexity = 0;
  routerOptions = {...DEFAULT_ROUTE_OPTIONS};
  startMiddleFnsDef = {...defaultStartMiddleFns};
  endMiddleFnsDef = {...defaultEndMiddleFns};
  startMiddleFns = [];
  endMiddleFns = [];
  hasAsyncMethods = false;
  alwaysAwait = false;
  isRouterInitialized = false;
  isRouterCreated = false;
  allExecutablesIds = undefined;
  platformConfig = undefined;
  platformMaxBodySize = DEFAULT_MAX_BODY_SIZE;
  resetRemoteMethodsMetadata();
  resetRoutesCache();
  clearBatches();
  // resetJitFnCaches() is deliberately NOT called: the JIT caches are global, and the
  // serializableClassRegistry it clears is needed to (de)serialize classes like RpcError.
  // Only a test of AOT cache loading calls it.
};

/** The ONE way to initialize the router and to declare routes and middleFns: the options are written once
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
    middleFn: middleFn as MiddleFnHelper<O>,
    headersFn: headersFn as HeadersFnHelper<O>,
    rawMiddleFn: rawMiddleFn as RawMiddleFnHelper<O>,
    initRoutes<R extends Routes>(routes: R): PublicApi<R> {
      initRouter(options);
      const api = registerRoutes(routes);
      if (platformConfig) applyMaxBodySizeCap();
      refreshChainBodyLimits();
      return api;
    },
  };
}

/** Initializes the router options and the internal error / client routes. Once per app (`resetRouter()` clears it). */
function initRouter(opts: RouterOptionsInput): void {
  if (isRouterInitialized) throw new Error('Router has already been initialized');
  routerOptions = {...routerOptions, ...opts};
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
  startMiddleFns = getExecutablesFromMiddleFnsCollection(startMiddleFnsDef);
  endMiddleFns = getExecutablesFromMiddleFnsCollection(endMiddleFnsDef);
  // the metadata middleFn is in every chain: give it the caller that skips its params pipeline unless a
  // client asked for metadata
  const metadataMiddleFn = middleFnsById.get(MION_ROUTES.methodsMetadata);
  if (metadataMiddleFn) useOnDemandMetadataCaller(metadataMiddleFn as RemoteMethod);
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

/** Adds middleFns at the start of the ExecutionChain, before the existing start middleFns by default */
export function addStartMiddleFns(middleFnsDef: MiddleFnsCollection, appendBeforeExisting = true) {
  if (isRouterInitialized) throw new Error('Can not add start middleFns after the router has been initialized');
  if (appendBeforeExisting) {
    startMiddleFnsDef = {...middleFnsDef, ...startMiddleFnsDef};
    return;
  }
  startMiddleFnsDef = {...startMiddleFnsDef, ...middleFnsDef};
}

/** Adds middleFns at the end of the ExecutionChain, after the existing end middleFns by default */
export function addEndMiddleFns(middleFnsDef: MiddleFnsCollection, prependAfterExisting = true) {
  if (isRouterInitialized) throw new Error('Can not add end middleFns after the router has been initialized');
  if (prependAfterExisting) {
    endMiddleFnsDef = {...endMiddleFnsDef, ...middleFnsDef};
    return;
  }
  endMiddleFnsDef = {...middleFnsDef, ...endMiddleFnsDef};
}

export function isPrivateDefinition(entry: RouterEntry, id: string): entry is PrivateDef {
  if (isRoute(entry)) return false;
  if (isRawMiddleFnDef(entry)) return true;
  try {
    const executable = getMiddleFnExecutable(id) || getRouteExecutable(id);
    if (!executable) throw new Error(`Route or MiddleFn ${id} not found. Please check you have called mion.initRoutes first.`);
    return !hasClientMetadata(executable);
  } catch {
    // error thrown because entry is a Routes object and does not have any handler
    return false;
  }
}

/** What the metadata route hands out: every route (routes ARE the public API) plus every middleFn taking
 *  params or headers or returning data, since the client must encode the call and decode the answer. A raw
 *  middleFn, or one with neither params nor return data, never touches the wire. NOT access control. */
export function hasClientMetadata(executable: RemoteMethod): boolean {
  if (executable.type === HandlerType.rawMiddleFn) return false;
  if (executable.type === HandlerType.route) return true;
  const hasPublicParams = !!executable.paramsCount;
  const hasHeaderParams = !!(executable as HeadersMethod).headersParam?.headerNames?.length;
  return hasPublicParams || hasHeaderParams || executable.hasReturnData;
}

export function getTotalExecutables(): number {
  return routesById.size + middleFnsById.size + rawMiddleFnsById.size;
}

export function getAllExecutablesIds(): string[] {
  if (allExecutablesIds) return allExecutablesIds;
  allExecutablesIds = [...routesById.keys(), ...middleFnsById.keys(), ...rawMiddleFnsById.keys()];
  return allExecutablesIds;
}

// used by codegen
export function shouldFullGenerateSpec(): boolean {
  return routerOptions.getPublicRoutesData || getENV('GENERATE_ROUTER_SPEC') === 'true';
}

// ############# PRIVATE METHODS #############

/** Flattens the routes object into a list of Executable objects. `currentPointer` is the position in that
 *  object (i.e. ['users', 'get']); `preMiddleFns` / `postMiddleFns` are the middleFns one level up, before
 *  and after that position. */
function recursiveFlatRoutes(
  routes: Routes,
  currentPointer: string[] = [],
  preMiddleFns: RemoteMethod[] = [],
  postMiddleFns: RemoteMethod[] = [],
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

    if (isAnyMiddleFnDef(item)) {
      routeEntry = getExecutableFromAnyMiddleFn(item, newPointer, nestLevel);
      if (middleFnNames.has(routeEntry.id))
        throw new Error(`Invalid middleFn: ${joinPath(...newPointer)}. Naming collision, Naming collision, duplicated middleFn.`);
      middleFnNames.add(routeEntry.id);
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
      preMiddleFns,
      postMiddleFns,
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
  preMiddleFns: RemoteMethod[],
  postMiddleFns: RemoteMethod[],
  nestLevel: number,
  index: number,
  routeKeyedEntries: RouterKeyEntryList,
  minus1Props: ReturnType<typeof getRouteEntryProperties> | null
) {
  const minus1 = getEntry(index - 1, routeKeyedEntries);
  const plus1 = getEntry(index + 1, routeKeyedEntries);
  const props = getRouteEntryProperties(minus1, routeEntry, plus1);

  if (props.isBetweenRoutes && minus1Props) {
    props.preLevelMiddleFns = minus1Props.preLevelMiddleFns;
    props.postLevelMiddleFns = minus1Props.postLevelMiddleFns;
  } else {
    for (let i = 0; i < routeKeyedEntries.length; i++) {
      const [k, entry] = routeKeyedEntries[i];
      complexity++;
      if (!isAnyMiddleFnDef(entry)) continue;
      const newPointer = [...currentPointer.slice(0, -1), k];
      const executable = getExecutableFromAnyMiddleFn(entry, newPointer, nestLevel);
      if (i < index) props.preLevelMiddleFns.push(executable);
      if (i > index) props.postLevelMiddleFns.push(executable);
    }
  }
  const isExec = isExecutable(routeEntry);

  if (isExec && props.isRoute) {
    const path = getRoutePath(routeEntry.pointer, routerOptions);
    const routeMethod = routeEntry as RouteMethod;
    const levelMethods = [...preMiddleFns, ...props.preLevelMiddleFns, routeEntry, ...props.postLevelMiddleFns, ...postMiddleFns];
    const methods = [...startMiddleFns, ...levelMethods, ...endMiddleFns];
    // an internal error route (thrownErrors, platformError) is never called by a client, so it takes
    // the platform's number rather than the tiny one its own no-params tuple derives
    const maxBodySize = mionInternalRoutes.includes(routeMethod.id)
      ? routeMethod.options.maxBodySize
      : resolveChainMaxBodySize(methods, routeMethod, routerOptions);
    // the resolved number is what the route publishes in its metadata; undefined means the
    // platform's, filled in when the metadata is read (the adapter has started by then)
    if (maxBodySize !== undefined) routeMethod.options.maxBodySize = maxBodySize;
    const executionChain: MethodsExecutionChain = {
      routeIndex: startMiddleFns.length + preMiddleFns.length + props.preLevelMiddleFns.length,
      methods,
      serializer: SerializerModes.json,
      path,
      declaredBodySize: maxBodySize,
      maxBodySize: maxBodySize ?? platformMaxBodySize,
      readsBody: true,
    };
    const middleFnIds = getPublicMiddleFnIds(methods);
    // add middleware functions deps, so can be serialized with the router
    if (middleFnIds.length) routeMethod.middleFnIds = middleFnIds;
    flatRouter.set(path, executionChain);
  } else if (!isExec) {
    recursiveFlatRoutes(
      routeEntry.routes,
      routeEntry.pathPointer,
      [...preMiddleFns, ...props.preLevelMiddleFns],
      [...props.postLevelMiddleFns, ...postMiddleFns],
      nestLevel + 1
    );
  }

  return props;
}

/** The thrower goes first, so the dispatcher's own rule skips every later member that does not declare
 *  `alwaysRun`. Nothing is declared, so the request takes the platform adapter's number. */
function buildNotFoundChains(): void {
  notFoundChains.clear();
  const throwers = [
    [MION_ROUTES.notFound, notFoundMiddleFn],
    [MION_ROUTES.batchNotFound, batchNotFoundMiddleFn],
  ] as const;
  for (const [id, middleFnDef] of throwers) {
    const methods = [getExecutableFromRawMiddleFn(middleFnDef, [id], 0), ...startMiddleFns, ...endMiddleFns];
    notFoundChains.set(id, {
      routeIndex: -1, // there is no route in this chain
      methods,
      serializer: SerializerModes.json,
      // a shared chain answers for many paths, so the request brings its own
      path: undefined,
      declaredBodySize: undefined,
      maxBodySize: platformMaxBodySize,
      readsBody: false,
    });
  }
}

function getExecutableFromAnyMiddleFn(
  middleFn: MiddleFnDef | HeadersMiddleFnDef | RawMiddleFnDef,
  middleFnPointer: string[],
  nestLevel: number
) {
  if (isRawMiddleFnDef(middleFn)) return getExecutableFromRawMiddleFn(middleFn, middleFnPointer, nestLevel);
  return getExecutableFromMiddleFn(middleFn, middleFnPointer, nestLevel);
}

export function getExecutableFromMiddleFn(
  middleFn: MiddleFnDef | HeadersMiddleFnDef,
  middleFnPointer: string[],
  nestLevel: number
): MiddleFnMethod | HeadersMethod {
  const isHeader = isHeadersMiddleFnDef(middleFn);
  // todo fix header id should be same as any other one and then maybe map from id to header name
  const middleFnId = getRouterItemId(middleFnPointer);
  const existing = middleFnsById.get(middleFnId);
  if (existing) return existing as MiddleFnMethod;

  type MixedMiddleFn = (Omit<MiddleFnMethod, 'type'> | Omit<HeadersMethod, 'type'>) & {
    type: typeof HandlerType.middleFn | typeof HandlerType.headersMiddleFn;
  };

  let executable: MixedMiddleFn;
  {
    const parser = resolveParser(middleFn.options?.parser, routerOptions.parser, middleFnId);
    const reflectionData = getHandlerReflection(middleFn, middleFnId, routerOptions, middleFn.options ?? {}, isHeader);
    assertCompiledParser(middleFnId, parser, reflectionData);
    const middleFnType = isHeader ? HandlerType.headersMiddleFn : HandlerType.middleFn;
    executable = {
      id: middleFnId,
      type: middleFnType,
      nestLevel,
      handler: middleFn.handler,
      pointer: middleFnPointer,
      // resolved here so the dispatch loop reads a field instead of deriving them per request
      methodCaller: callerForType(middleFnType),
      alwaysRun: !!middleFn.options?.alwaysRun,
      quotedId: JSON.stringify(middleFnId),
      ...reflectionData,
      options: {
        alwaysRun: !!middleFn.options?.alwaysRun,
        validateParams: middleFn.options?.validateParams ?? true,
        validateReturn: middleFn.options?.validateReturn ?? false,
        description: middleFn.options?.description,
        parser,
        sanitizeParams: middleFn.options?.sanitizeParams ?? routerOptions.sanitizeParams,
      },
    };
    // a middleFn's maxBodySize is its OWN contribution to every chain it sits in, never resolved;
    // written only when set, so the metadata a client receives carries no `undefined` key
    if (middleFn.options?.maxBodySize !== undefined) executable.options.maxBodySize = middleFn.options.maxBodySize;
  }

  if (executable.isAsync) hasAsyncMethods = true;
  middleFnsById.set(middleFnId, executable as any);
  routesCache.setMethodJitFns(middleFnId, executable as any);
  return executable as any;
}

export function getExecutableFromRawMiddleFn(middleFn: RawMiddleFnDef, middleFnPointer: string[], nestLevel: number): RawMethod {
  const middleFnId = getRouterItemId(middleFnPointer);
  const existing = rawMiddleFnsById.get(middleFnId);
  if (existing) return existing as RawMethod;
  const reflectionData = getRawMethodReflection(middleFn.handler, middleFnId, routerOptions);
  const executable: RawMethod = {
    id: middleFnId,
    type: HandlerType.rawMiddleFn,
    nestLevel,
    handler: middleFn.handler,
    pointer: middleFnPointer,
    methodCaller: callerForType(HandlerType.rawMiddleFn),
    alwaysRun: !!middleFn.options?.alwaysRun,
    quotedId: JSON.stringify(middleFnId),
    ...reflectionData,
    options: {
      alwaysRun: !!middleFn.options?.alwaysRun,
      validateParams: false,
      validateReturn: false,
      description: middleFn.options?.description,
    },
  };
  if (executable.isAsync) hasAsyncMethods = true;
  rawMiddleFnsById.set(middleFnId, executable);
  routesCache.setMethodJitFns(middleFnId, executable as any);
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

function getPublicMiddleFnIds(methods: RemoteMethod[]): string[] {
  const ids = methods
    .filter((exec) => isPublicExecutable(exec))
    .map((exec) => getRouterItemId(exec.pointer))
    .filter((mfId) => {
      if (mionInternalRoutes.includes(mfId)) return false;
      const exec = getMiddleFnExecutable(mfId);
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
    preLevelMiddleFns: [] as RemoteMethod[],
    postLevelMiddleFns: [] as RemoteMethod[],
  };
}

function getExecutablesFromMiddleFnsCollection(
  middleFnsDef: MiddleFnsCollection
): (RawMethod | MiddleFnMethod | HeadersMethod)[] {
  const results: (RawMethod | MiddleFnMethod | HeadersMethod)[] = [];
  for (const [key, middleFn] of Object.entries(middleFnsDef)) {
    if (isRawMiddleFnDef(middleFn)) {
      results.push(getExecutableFromRawMiddleFn(middleFn, [key], 0));
    } else if (isHeadersMiddleFnDef(middleFn) || isMiddleFnDef(middleFn)) {
      results.push(getExecutableFromMiddleFn(middleFn, [key], 0));
    } else {
      throw new Error(`Invalid middleFn: ${key}. Invalid middleFn definition`);
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
