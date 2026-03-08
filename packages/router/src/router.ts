/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {join} from 'path';
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
import {DEFAULT_ROUTE_OPTIONS, MAX_ROUTE_NESTING, WORKFLOW_KEY} from './constants.ts';
import {
    isRawMiddleFnDef,
    isHeadersMiddleFnDef,
    isExecutable,
    isMiddleFnDef,
    isRoute,
    isRoutes,
    isAnyMiddleFnDef,
} from './types/guards.ts';
import {HandlerType, SerializerModes, SerializerCode, SerializerMode, isTestEnv, resetRoutesCache} from '@mionjs/core';
import {getRawMethodReflection, getHandlerReflection} from './lib/reflection.ts';
import {serializerMiddleFns} from './routes/serializer.routes.ts';
import {getRouterItemId, getRoutePath, getENV, MION_ROUTES, routesCache} from '@mionjs/core';
import {setErrorOptions} from '@mionjs/core';
import {getPublicApi, resetRemoteMethodsMetadata} from './lib/remoteMethods.ts';
import {addToPersistedMethods, getPersistedMethod, resetPersistedMethods} from './lib/methodsCache.ts';
import {mionClientRoutes} from './routes/client.routes.ts';
import {mionErrorsRoutes} from './routes/errors.routes.ts';
import {clearRoutesFlowCache} from './routesFlow.ts';
import {clearContextPool} from './callContext.ts';

type RouterKeyEntryList = [string, RouterEntry][];
type RoutesWithId = {
    pathPointer: string[];
    routes: Routes;
};

// ############# PRIVATE STATE #############

const flatRouter: Map<string, MethodsExecutionChain> = new Map(); // Main Router
const middleFnsById: Map<string, MiddleFnMethod | HeadersMethod | RawMethod> = new Map();
const routesById: Map<string, RouteMethod> = new Map();
const rawMiddleFnsById: Map<string, RawMethod> = new Map();
const middleFnNames: Set<string> = new Set();
const routeNames: Set<string> = new Set();
let complexity = 0;
let routerOptions: RouterOptions = {...DEFAULT_ROUTE_OPTIONS};
let isRouterInitialized = false;
let allExecutablesIds: string[] | undefined;

/** Global middleFns to be run before and after any other middleFns or routes set using `registerRoutes` */
const defaultStartMiddleFns = {
    mionDeserializeRequest: serializerMiddleFns.mionDeserializeRequest,
};
const defaultEndMiddleFns = {
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
    allExecutablesIds = undefined;
    resetRemoteMethodsMetadata();
    resetPersistedMethods();
    resetRoutesCache();
    clearContextPool();
    clearRoutesFlowCache();
    // Note: We intentionally do NOT call resetJitFnCaches() here because:
    // 1. JIT function caches are global and should persist across router resets
    // 2. The serializableClassRegistry (cleared by resetJitFnCaches) is needed for
    //    serialization/deserialization of classes like RpcError
    // resetJitFnCaches() should only be called in specific test scenarios that need
    // to test AOT cache loading behavior
};

// simpler router initialization
export async function initMionRouter<R extends Routes>(routes: R, opts?: Partial<RouterOptions>): Promise<PublicApi<R>> {
    await initRouter(opts);
    const publicApi = await registerRoutes(routes);
    // Emit AOT caches once after ALL routes (error, client, user) are registered
    await emitAOTCaches();
    return publicApi;
}

/**
 * Initializes the Router.
 * @param application
 * @param contextDataFactory a factory function that returns an object to be shared in the `callContext.shared`
 * @param routerOptions
 * @returns
 */
export async function initRouter(opts?: Partial<RouterOptions>): Promise<Readonly<RouterOptions>> {
    if (isRouterInitialized) throw new Error('Router has already been initialized');
    routerOptions = {...routerOptions, ...opts};
    validateSharedDataFactory(routerOptions);
    Object.freeze(routerOptions);
    setErrorOptions(routerOptions);
    if (routerOptions.aot) await loadAOTCaches();
    isRouterInitialized = true;
    await registerRoutes({...mionErrorsRoutes});
    if (!routerOptions.skipClientRoutes) await registerRoutes({...mionClientRoutes});
    if (!isTestEnv()) console.log('mion router initialized', {routerOptions});
    return routerOptions;
}

export async function registerRoutes<R extends Routes>(routes: R): Promise<PublicApi<R>> {
    if (!isRouterInitialized) throw new Error('initRouter should be called first');
    startMiddleFns = await getExecutablesFromMiddleFnsCollection(startMiddleFnsDef);
    endMiddleFns = await getExecutablesFromMiddleFnsCollection(endMiddleFnsDef);
    await recursiveFlatRoutes(routes);
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
        if (!executable)
            throw new Error(`Route or MiddleFn ${id} not found. Please check you have called router.registerRoutes first.`);
        return isPrivateExecutable(executable);
    } catch {
        // error thrown because entry is a Routes object and does not have any handler
        return false;
    }
}

export function isPrivateExecutable(executable: RemoteMethod): boolean {
    if (executable.type === HandlerType.rawMiddleFn) return true;
    if (executable.type === HandlerType.route) return false;
    const hasPublicParams = !!executable.paramNames?.length;
    const hasHeaderParams = !!(executable as HeadersMethod).headersParam?.headerNames?.length;
    return !hasPublicParams && !hasHeaderParams && !executable.hasReturnData;
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
    return routerOptions.getPublicRoutesData || getENV('GENERATE_ROUTER_SPEC') === 'true' || getENV('MION_COMPILE') === 'true';
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

async function loadAOTCaches() {
    const loader = await import('./lib/aotCacheLoader.ts');
    return loader.loadAOTCaches();
}

async function emitAOTCaches() {
    if (getENV('MION_COMPILE') !== 'true') return;
    // Dynamic import resolves relative to this source file.
    // This only runs via vite-node (MION_COMPILE=true), which always resolves from source.
    const aotEmitter = await import('./lib/aotEmitter.ts');
    return aotEmitter.emitAOTCaches();
}

/**
 * Optimized algorithm to flatten the routes object into a list of Executable objects.
 * @param routes
 * @param currentPointer current pointer in the routes object i.e. ['users', 'get']
 * @param preMiddleFns middleFns one level up preceding current pointer
 * @param postMiddleFns middleFns one level up  following the current pointer
 * @param nestLevel
 */
async function recursiveFlatRoutes(
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
        throw new Error(`Invalid route: ${currentPointer.length ? join(...currentPointer) : '*'}. Can Not define empty routes`);

    let minus1Props: ReturnType<typeof getRouteEntryProperties> | null = null;
    for (let index = 0; index < entries.length; index++) {
        const [key, item] = entries[index];
        // create the executable items
        const newPointer = [...currentPointer, key];
        let routeEntry: RemoteMethod | RoutesWithId;
        if (typeof key !== 'string' || !isNaN(key as any))
            throw new Error(`Invalid route: ${join(...newPointer)}. Numeric route names are not allowed`);
        if (key.includes(',')) throw new Error(`Invalid route: ${join(...newPointer)}. Route names cannot contain commas.`);
        if (key === WORKFLOW_KEY)
            throw new Error(`Invalid route: ${join(...newPointer)}. '${WORKFLOW_KEY}' is a reserved mion route name.`);

        // generates a middleFn
        if (isAnyMiddleFnDef(item)) {
            routeEntry = await getExecutableFromAnyMiddleFn(item, newPointer, nestLevel);
            if (middleFnNames.has(routeEntry.id))
                throw new Error(
                    `Invalid middleFn: ${join(...newPointer)}. Naming collision, Naming collision, duplicated middleFn.`
                );
            middleFnNames.add(routeEntry.id);
        }

        // generates a route
        else if (isRoute(item)) {
            routeEntry = await getExecutableFromRoute(item, newPointer, nestLevel);
            if (routeNames.has(routeEntry.id))
                throw new Error(`Invalid route: ${join(...newPointer)}. Naming collision, duplicated route`);
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
            throw new Error(`Invalid route: ${join(...newPointer)}. Type <${itemType}> is not a valid route.`);
        }

        // recurse into sublevels
        minus1Props = await recursiveCreateExecutionChainAsync(
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

async function recursiveCreateExecutionChainAsync(
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
            const executable = await getExecutableFromAnyMiddleFn(entry, newPointer, nestLevel);
            if (i < index) props.preLevelMiddleFns.push(executable);
            if (i > index) props.postLevelMiddleFns.push(executable);
        }
    }
    const isExec = isExecutable(routeEntry);

    if (isExec && props.isRoute) {
        const path = getRoutePath(routeEntry.pointer, routerOptions);
        const routeMethod = routeEntry as RouteMethod;
        const levelMethods = [
            ...preMiddleFns,
            ...props.preLevelMiddleFns,
            routeEntry,
            ...props.postLevelMiddleFns,
            ...postMiddleFns,
        ];
        const methods = [...startMiddleFns, ...levelMethods, ...endMiddleFns];
        const executionChain: MethodsExecutionChain = {
            routeIndex: startMiddleFns.length + preMiddleFns.length + props.preLevelMiddleFns.length,
            methods,
            serializer: getSerializerCodeFromMode(routeMethod.options.serializer),
        };
        flatRouter.set(path, executionChain);
    } else if (!isExec) {
        await recursiveFlatRoutes(
            routeEntry.routes,
            routeEntry.pathPointer,
            [...preMiddleFns, ...props.preLevelMiddleFns],
            [...props.postLevelMiddleFns, ...postMiddleFns],
            nestLevel + 1
        );
    }

    return props;
}

async function getExecutableFromAnyMiddleFn(
    middleFn: MiddleFnDef | HeadersMiddleFnDef | RawMiddleFnDef,
    middleFnPointer: string[],
    nestLevel: number
) {
    if (isRawMiddleFnDef(middleFn)) return getExecutableFromRawMiddleFn(middleFn, middleFnPointer, nestLevel);
    return getExecutableFromMiddleFn(middleFn, middleFnPointer, nestLevel);
}

export async function getExecutableFromMiddleFn(
    middleFn: MiddleFnDef | HeadersMiddleFnDef,
    middleFnPointer: string[],
    nestLevel: number
): Promise<MiddleFnMethod | HeadersMethod> {
    const isHeader = isHeadersMiddleFnDef(middleFn);
    // todo fix header id should be same as any other one and then maybe map from id to header name
    const middleFnId = getRouterItemId(middleFnPointer);
    const existing = middleFnsById.get(middleFnId);
    if (existing) return existing as MiddleFnMethod;

    type MixedMiddleFn = (Omit<MiddleFnMethod, 'type'> | Omit<HeadersMethod, 'type'>) & {
        type: typeof HandlerType.middleFn | typeof HandlerType.headersMiddleFn;
    };

    const compiledMethod = getPersistedMethod(middleFnId, middleFn.handler);
    let executable: MixedMiddleFn;
    if (compiledMethod) {
        executable = compiledMethod as MixedMiddleFn;
    } else {
        const reflectionData = await getHandlerReflection(middleFn.handler, middleFnId, routerOptions, isHeader);
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
            },
        };
        addToPersistedMethods(middleFnId, executable);
    }

    middleFnsById.set(middleFnId, executable as any);
    routesCache.setMethodJitFns(middleFnId, executable as any);
    return executable as any;
}

export async function getExecutableFromRawMiddleFn(
    middleFn: RawMiddleFnDef,
    middleFnPointer: string[],
    nestLevel: number
): Promise<RawMethod> {
    const middleFnId = getRouterItemId(middleFnPointer);
    const existing = rawMiddleFnsById.get(middleFnId);
    if (existing) return existing as RawMethod;
    const reflectionData = await getRawMethodReflection(middleFn.handler, middleFnId, routerOptions);
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

export async function getExecutableFromRoute(route: Route, routePointer: string[], nestLevel: number): Promise<RouteMethod> {
    const routeId = getRouterItemId(routePointer);
    const existing = routesById.get(routeId);
    if (existing) return existing as RouteMethod;

    const compiledMethod = getPersistedMethod(routeId, route.handler);
    let executable: RouteMethod;
    if (compiledMethod) {
        executable = compiledMethod as RouteMethod;
    } else {
        const reflectionData = await getHandlerReflection(route.handler, routeId, routerOptions);
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
                serializer: route.options?.serializer ?? routerOptions.serializer,
                isMutation: route.options?.isMutation,
            },
        };
        addToPersistedMethods(routeId, executable);
    }
    routesById.set(routeId, executable);
    routesCache.setMethodJitFns(routeId, executable as any);
    return executable;
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

async function getExecutablesFromMiddleFnsCollection(
    middleFnsDef: MiddleFnsCollection
): Promise<(RawMethod | MiddleFnMethod | HeadersMethod)[]> {
    const results: (RawMethod | MiddleFnMethod | HeadersMethod)[] = [];
    for (const [key, middleFn] of Object.entries(middleFnsDef)) {
        if (isRawMiddleFnDef(middleFn)) {
            results.push(await getExecutableFromRawMiddleFn(middleFn, [key], 0));
        } else if (isHeadersMiddleFnDef(middleFn) || isMiddleFnDef(middleFn)) {
            results.push(await getExecutableFromMiddleFn(middleFn, [key], 0));
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

/** Maps serializer mode string to response body type code */
function getSerializerCodeFromMode(mode: SerializerMode | undefined): SerializerCode {
    switch (mode) {
        case 'binary':
            return SerializerModes.binary;
        case 'stringifyJson':
            return SerializerModes.stringifyJson;
        case 'json':
        default:
            return SerializerModes.json;
    }
}
