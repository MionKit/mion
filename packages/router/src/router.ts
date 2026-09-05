/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/** Lightweight path join for error messages (avoids Node's 'path' module for edge compatibility) */
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
  BUILT_IN_SERIALIZER,
  HandlerType,
  SerializerModes,
  SerializerCode,
  isTestEnv,
  resetRoutesCache,
  getOrCreateGlobal,
  resolveSerializerOption,
  strategyFromJitFns,
} from '@mionjs/core';
import type {MethodWithJitFns, ResolvedSerializer, SerializerOption} from '@mionjs/core';
import {getRawMethodReflection, getHandlerReflection, ensureBinaryJitFns} from './lib/reflection.ts';
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
import {mionClientRoutes, mionClientMiddleFns} from './routes/client.routes.ts';
import {mionErrorsRoutes} from './routes/errors.routes.ts';
import {clearBatches} from './batches.ts';
import {clearContextPool} from './callContext.ts';
import {headersFn, middleFn, mutation, query, rawMiddleFn, route} from './lib/handlers.ts';
import type {
  HeadersFnHelper,
  MiddleFnHelper,
  MionRouter,
  RawMiddleFnHelper,
  RouteHelper,
  RouterOptionsInput,
  SerializerIsLiteral,
} from './types/mionRouter.ts';

type RouterKeyEntryList = [string, RouterEntry][];
type RoutesWithId = {
  pathPointer: string[];
  routes: Routes;
};
/** The middleFns that ride a binary wire, and in which direction, collected while the chains are flattened. */
type BinaryMiddleFns = Map<string, {params: boolean; return: boolean}>;

// ############# PRIVATE STATE #############

const mionInternalRoutes = Object.values(MION_ROUTES) as string[];
const flatRouter = getOrCreateGlobal('mion.router.flatRouter', () => new Map<string, MethodsExecutionChain>()); // Main Router
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

/** Global middleFns to be run before and after any other middleFns or routes set through `mion.initRoutes` */
const defaultStartMiddleFns = {
  mionDeserializeRequest: serializerMiddleFns.mionDeserializeRequest,
};
const defaultEndMiddleFns = {
  ...mionClientMiddleFns,
  mionSerializeResponse: serializerMiddleFns.mionSerializeResponse,
};
let startMiddleFnsDef: MiddleFnsCollection = {...defaultStartMiddleFns};
let endMiddleFnsDef: MiddleFnsCollection = {...defaultEndMiddleFns};
export let startMiddleFns: RemoteMethod[] = [];
export let endMiddleFns: RemoteMethod[] = [];

// ############# PUBLIC METHODS #############

export const getRouteExecutionChain = (path: string) => flatRouter.get(path);
export const getRouteEntries = () => flatRouter.entries();
export const geRoutesSize = () => flatRouter.size;
export const getRouteExecutable = (id: string) => routesById.get(id);
export const getMiddleFnExecutable = (id: string) => middleFnsById.get(id);
export const geMiddleFnsSize = () => middleFnsById.size;
export const getComplexity = () => complexity;
export const getRouterOptions = <Opts extends RouterOptions>(): Readonly<Opts> => routerOptions as Opts;
export const getAnyExecutable = (id: string) => routesById.get(id) || middleFnsById.get(id) || rawMiddleFnsById.get(id);

/** Sets platform adapter config. Called automatically by platform adapters. */
export function setPlatformConfig(config: Record<string, unknown>): void {
  platformConfig = config;
}

/** Returns the platform adapter config set by setPlatformConfig(). */
export const getPlatformConfig = (): Readonly<Record<string, unknown>> | undefined => platformConfig;

export const resetRouter = () => {
  flatRouter.clear();
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
  isRouterInitialized = false;
  isRouterCreated = false;
  allExecutablesIds = undefined;
  platformConfig = undefined;
  resetRemoteMethodsMetadata();
  resetRoutesCache();
  clearContextPool();
  clearBatches();
  // Note: We intentionally do NOT call resetJitFnCaches() here because:
  // 1. JIT function caches are global and should persist across router resets
  // 2. The serializableClassRegistry (cleared by resetJitFnCaches) is needed for
  //    serialization/deserialization of classes like RpcError
  // resetJitFnCaches() should only be called in specific test scenarios that need
  // to test AOT cache loading behavior
};

/**
 * Creates the router: the ONE way to initialize it and to declare routes and middleFns.
 * The options are written once and carried BY TYPE into every helper the factory returns
 * (`mion.route`, `mion.query`, `mion.mutation`, `mion.middleFn`, `mion.headersFn`, `mion.rawMiddleFn`),
 * so a handler's `ctx.shared` is typed from `contextDataFactory` and a later feature can read
 * router-wide defaults at build time. `mion.initRoutes(routes)` then initializes the singleton
 * router with those options and registers the routes.
 *
 * The helpers are plain closures (no `this`), so destructuring them is fine:
 * `const {route, middleFn} = createMionRouter({...})`.
 *
 * Create the router once per app: a second call throws until `resetRouter()` (tests) clears it.
 */
export function createMionRouter<const O extends RouterOptionsInput = RouterOptionsInput>(
  // the serializer default is read by the BUILD off this literal: one strategy per direction, or the call fails to type
  opts?: O & NoInfer<SerializerIsLiteral<O>>
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
    query: query as RouteHelper<O>,
    mutation: mutation as RouteHelper<O>,
    middleFn: middleFn as MiddleFnHelper<O>,
    headersFn: headersFn as HeadersFnHelper<O>,
    rawMiddleFn: rawMiddleFn as RawMiddleFnHelper<O>,
    initRoutes<R extends Routes>(routes: R): PublicApi<R> {
      initRouter(options);
      return registerRoutes(routes);
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
  const binaryMiddlewares: BinaryMiddleFns = new Map();
  recursiveFlatRoutes(routes, [], [], [], binaryMiddlewares, 0);
  allExecutablesIds = undefined; // the memoized id list must see the routes registered by this call
  if (binaryMiddlewares.size > 0) compileBinaryForMiddleware(binaryMiddlewares);
  if (shouldFullGenerateSpec()) {
    return getPublicApi(routes);
  }
  return {} as PublicApi<R>;
}

/** Add middleFns at the start af the ExecutionChain, adds them before any other existing start middleFns by default */
export function addStartMiddleFns(middleFnsDef: MiddleFnsCollection, appendBeforeExisting = true) {
  if (isRouterInitialized) throw new Error('Can not add start middleFns after the router has been initialized');
  if (appendBeforeExisting) {
    startMiddleFnsDef = {...middleFnsDef, ...startMiddleFnsDef};
    return;
  }
  startMiddleFnsDef = {...startMiddleFnsDef, ...middleFnsDef};
}

/** Add middleFns at the end af the ExecutionChain, adds them after any other existing end middleFns by default */
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

/** Whether the client needs metadata for an executable, which is what the metadata route hands out.
 *  Every route answers (routes ARE the public API), and so does every middleFn that takes params or
 *  headers or returns data: the client has to know how to encode the call and decode the answer.
 *  A raw middleFn, and a middleFn with neither params nor return data, never touch the wire, so
 *  there is nothing to describe. This is not an access control: hidden routes are not a feature. */
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

export function getRouteExecutableFromPath(path: string): RouteMethod {
  const executionChain = flatRouter.get(path);
  if (!executionChain) {
    // Return the not-found route executable
    return getAnyExecutable(MION_ROUTES.notFound) as RouteMethod;
  }
  return executionChain.methods[executionChain.routeIndex] as RouteMethod;
}

// ############# PRIVATE METHODS #############

/**
 * Optimized algorithm to flatten the routes object into a list of Executable objects.
 * @param routes
 * @param currentPointer current pointer in the routes object i.e. ['users', 'get']
 * @param preMiddleFns middleFns one level up preceding current pointer
 * @param postMiddleFns middleFns one level up  following the current pointer
 * @param nestLevel
 */
function recursiveFlatRoutes(
  routes: Routes,
  currentPointer: string[] = [],
  preMiddleFns: RemoteMethod[] = [],
  postMiddleFns: RemoteMethod[] = [],
  binaryMiddlewares: BinaryMiddleFns = new Map(),
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
    // create the executable items
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

    // generates a middleFn
    if (isAnyMiddleFnDef(item)) {
      routeEntry = getExecutableFromAnyMiddleFn(item, newPointer, nestLevel);
      if (middleFnNames.has(routeEntry.id))
        throw new Error(`Invalid middleFn: ${joinPath(...newPointer)}. Naming collision, Naming collision, duplicated middleFn.`);
      middleFnNames.add(routeEntry.id);
    }

    // generates a route
    else if (isRoute(item)) {
      routeEntry = getExecutableFromRoute(item, newPointer, nestLevel);
      if (routeNames.has(routeEntry.id))
        throw new Error(`Invalid route: ${joinPath(...newPointer)}. Naming collision, duplicated route`);
      routeNames.add(routeEntry.id);
    }

    // generates structure required to go one level down
    else if (isRoutes(item)) {
      routeEntry = {
        pathPointer: newPointer,
        routes: item,
      };
    }

    // throws an error if the route is invalid
    else {
      const itemType = typeof item;
      throw new Error(`Invalid route: ${joinPath(...newPointer)}. Type <${itemType}> is not a valid route.`);
    }

    // recurse into sublevels
    minus1Props = recursiveCreateExecutionChain(
      routeEntry,
      newPointer,
      preMiddleFns,
      postMiddleFns,
      binaryMiddlewares,
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
  binaryMiddlewares: BinaryMiddleFns,
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
    const executionChain: MethodsExecutionChain = {
      routeIndex: startMiddleFns.length + preMiddleFns.length + props.preLevelMiddleFns.length,
      methods,
      serializer: framingForChain(routeMethod, methods),
    };
    const middleFnIds = getPublicMiddleFnIds(methods);
    // add middleware functions deps, so can be serialized with the router
    if (middleFnIds.length) routeMethod.middleFnIds = middleFnIds;
    flatRouter.set(path, executionChain);
    // Collect the middleFns riding a binary wire, per direction, so their binary pairs are checked once registered.
    // The internal mion members never ride it: the metadata middleFn frames its own answer as stringifyJson.
    const routeSerializer = routeMethod.options.serializer;
    if (routeSerializer.params === 'binary' || routeSerializer.return === 'binary') {
      for (const method of methods) {
        if (method.type !== HandlerType.middleFn && method.type !== HandlerType.headersMiddleFn) continue;
        if (mionInternalRoutes.includes(method.id)) continue;
        const needs = binaryMiddlewares.get(method.id) ?? {params: false, return: false};
        binaryMiddlewares.set(method.id, {
          params: needs.params || routeSerializer.params === 'binary',
          return: needs.return || routeSerializer.return === 'binary',
        });
      }
    }
  } else if (!isExec) {
    recursiveFlatRoutes(
      routeEntry.routes,
      routeEntry.pathPointer,
      [...preMiddleFns, ...props.preLevelMiddleFns],
      [...props.postLevelMiddleFns, ...postMiddleFns],
      binaryMiddlewares,
      nestLevel + 1
    );
  }

  return props;
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
    const reflectionData = getHandlerReflection(
      middleFn,
      middleFnId,
      routerOptions,
      middleFn.options ?? {},
      isHeader,
      middleFn.options?.strictTypes
    );
    executable = {
      id: middleFnId,
      type: isHeader ? HandlerType.headersMiddleFn : HandlerType.middleFn,
      nestLevel,
      handler: middleFn.handler,
      pointer: middleFnPointer,
      ...reflectionData,
      options: {
        runOnError: !!middleFn.options?.runOnError,
        validateParams: middleFn.options?.validateParams ?? true,
        validateReturn: middleFn.options?.validateReturn ?? false,
        description: middleFn.options?.description,
        serializer: resolveMethodSerializer(middleFnId, middleFn.options?.serializer, reflectionData),
        strictTypes: middleFn.options?.strictTypes ?? routerOptions.strictTypes,
        sanitizeParams: middleFn.options?.sanitizeParams ?? routerOptions.sanitizeParams,
      },
    };
  }

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
    ...reflectionData,
    options: {
      runOnError: !!middleFn.options?.runOnError,
      validateParams: false,
      validateReturn: false,
      description: middleFn.options?.description,
    },
  };
  rawMiddleFnsById.set(middleFnId, executable);
  routesCache.setMethodJitFns(middleFnId, executable as any);
  return executable;
}

/** Checks the binary pairs of the middleFns riding a binary wire, once every executable is registered. */
function compileBinaryForMiddleware(binaryMiddlewares: BinaryMiddleFns): void {
  for (const [id, needs] of binaryMiddlewares) {
    const method = middleFnsById.get(id);
    if (method) ensureBinaryJitFns(method as MiddleFnMethod, needs);
  }
}

export function getExecutableFromRoute(route: Route, routePointer: string[], nestLevel: number): RouteMethod {
  const routeId = getRouterItemId(routePointer);
  const existing = routesById.get(routeId);
  if (existing) return existing as RouteMethod;

  let executable: RouteMethod;
  {
    const reflectionData = getHandlerReflection(
      route,
      routeId,
      routerOptions,
      route.options ?? {},
      false,
      route.options?.strictTypes
    );
    executable = {
      id: routeId,
      type: HandlerType.route,
      nestLevel,
      handler: route.handler,
      pointer: routePointer,
      ...reflectionData,
      options: {
        runOnError: false,
        validateParams: route.options?.validateParams ?? true,
        validateReturn: route.options?.validateReturn ?? false,
        description: route.options?.description,
        serializer: resolveMethodSerializer(routeId, route.options?.serializer, reflectionData),
        isMutation: route.options?.isMutation,
        strictTypes: route.options?.strictTypes ?? routerOptions.strictTypes,
        sanitizeParams: route.options?.sanitizeParams ?? routerOptions.sanitizeParams,
      },
    };
  }
  routesById.set(routeId, executable);
  routesCache.setMethodJitFns(routeId, executable as any);
  return executable;
}

/** Returns IDs of public middleware methods from the execution chain, excluding internal mion routes. */
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

/**
 * Validates that a contextDataFactory returns a valid context data object.
 * @param contextDataFactory The factory function to validate
 * @throws Error if the factory doesn't return a plain object with at least one property
 */
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

// ############# SERIALIZER STRATEGIES #############

/**
 * Resolves a method's serializer (its option, else the router default, else the built-in pair) and checks it
 * against what the build actually compiled for it. The build read the same literals off the types, so the two only
 * disagree when a value was not the literal the type said: a cast, a dynamic factory options object, or a build
 * made against other options. Failing here keeps a route from encoding with a family the client will not decode.
 */
function resolveMethodSerializer(
  id: string,
  option: SerializerOption | undefined,
  compiled: Pick<MethodWithJitFns, 'paramsJitFns' | 'returnJitFns'>
): ResolvedSerializer {
  const wanted = resolveSerializerOption(option, resolveSerializerOption(routerOptions.serializer, BUILT_IN_SERIALIZER));
  const built: ResolvedSerializer = {
    params: strategyFromJitFns(compiled.paramsJitFns),
    return: strategyFromJitFns(compiled.returnJitFns),
  };
  for (const direction of ['params', 'return'] as const) {
    if (built[direction] === wanted[direction]) continue;
    throw new Error(
      `mion: '${id}' was compiled with the ${direction} serializer '${built[direction]}' but resolves to '${wanted[direction]}' at runtime. ` +
        `The build reads the serializer off the route options and the createMionRouter options as literals: ` +
        `write them inline or as an \`as const\` preset, and initialize the router with the same options the routes were declared with.`
    );
  }
  return wanted;
}

/**
 * The response framing of an execution chain, derived from what its members compiled: a binary return on the route
 * frames the response as binary; a `direct` return on the route or on a user middleFn (a JSON string) makes the
 * router join the strings; otherwise every member hands the platform a value to stringify. The internal mion
 * members are left out: the metadata middleFn sits in every chain and forces the stringifyJson framing itself, at
 * runtime, only when it has data to answer.
 */
export function framingForChain(routeMethod: RouteMethod, methods: RemoteMethod[]): SerializerCode {
  const routeReturn = routeMethod.options.serializer.return;
  if (routeReturn === 'binary') return SerializerModes.binary;
  if (routeReturn === 'direct') return SerializerModes.stringifyJson;
  for (const method of methods) {
    if (method === routeMethod || !method.hasReturnData || mionInternalRoutes.includes(method.id)) continue;
    if (method.returnJitFns.json.strategy === 'direct') return SerializerModes.stringifyJson;
  }
  return SerializerModes.json;
}

/** Path replacement as is not available in edge runtime */
function joinPath(...parts: string[]): string {
  return parts.filter(Boolean).join('/');
}
