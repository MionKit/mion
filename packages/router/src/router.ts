/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {join} from 'path';
import type {Route, RouterOptions, Routes, RouterEntry} from './types/general';
import type {
    RemoteMethod,
    MethodsExecutionList,
    RawMethod,
    HeaderMethod,
    LinkedFnMethod,
    RouteMethod,
} from './types/remoteMethods';
import type {PublicApi, PrivateDef, LinkedFnsCollection} from './types/publicMethods';
import type {HeaderLinkedFnDef, LinkedFnDef, RawLinkedFnDef} from './types/definitions';
import {DEFAULT_ROUTE_OPTIONS, MAX_ROUTE_NESTING} from './constants';
import {
    isRawLinkedFnDef,
    isHeaderLinkedFnDef,
    isExecutable,
    isLinkedFnDef,
    isRoute,
    isRoutes,
    isAnyLinkedFnDef,
} from './types/guards';
import {HandlerType, SerializerModes, SerializerCode, SerializerMode} from '@mionkit/core';
import {getRawMethodReflection, getHandlerReflection} from './lib/reflection';
import {serializerLinkedFns} from './routes/serializer.routes';
import {getRouterItemId, getRoutePath, getENV, MION_ROUTES} from '@mionkit/core';
import {setErrorOptions} from '@mionkit/core';
import {getPublicApi, resetRemoteMethodsMetadata} from './lib/remoteMethods';
import {
    addToPersistedMethods,
    getPersistedMethod,
    resetPersistedMethods,
    loadDefaultAOTCaches,
    resetDefaultAOTCachesState,
} from './lib/methodsCache';
import {mionClientRoutes} from './routes/client.routes';
import {mionErrorsRoutes} from './routes/errors.routes';

type RouterKeyEntryList = [string, RouterEntry][];
type RoutesWithId = {
    pathPointer: string[];
    routes: Routes;
};

// ############# PRIVATE STATE #############

const flatRouter: Map<string, MethodsExecutionList> = new Map(); // Main Router
const linkedFnsById: Map<string, LinkedFnMethod | HeaderMethod | RawMethod> = new Map();
const routesById: Map<string, RouteMethod> = new Map();
const rawLinkedFnsById: Map<string, RawMethod> = new Map();
const linkedFnNames: Set<string> = new Set();
const routeNames: Set<string> = new Set();
let complexity = 0;
let routerOptions: RouterOptions = {...DEFAULT_ROUTE_OPTIONS};
let isRouterInitialized = false;
let allExecutablesIds: string[] | undefined;

/** Global linkedFns to be run before and after any other linkedFns or routes set using `registerRoutes` */
const defaultStartLinkedFns = {mionDeserializeRequest: serializerLinkedFns.mionDeserializeRequest};
const defaultEndLinkedFns = {
    mionSerializeResponse: serializerLinkedFns.mionSerializeResponse,
};
let startLinkedFnsDef: LinkedFnsCollection = {...defaultStartLinkedFns};
let endLinkedFnsDef: LinkedFnsCollection = {...defaultEndLinkedFns};
export let startLinkedFns: RemoteMethod[] = [];
export let endLinkedFns: RemoteMethod[] = [];

// ############# PUBLIC METHODS #############

export const getRouteExecutionPath = (path: string) => flatRouter.get(path);
export const getRouteEntries = () => flatRouter.entries();
export const geRoutesSize = () => flatRouter.size;
export const getRouteExecutable = (id: string) => routesById.get(id);
export const getLinkedFnExecutable = (id: string) => linkedFnsById.get(id);
export const geLinkedFnsSize = () => linkedFnsById.size;
export const getComplexity = () => complexity;
export const getRouterOptions = <Opts extends RouterOptions>(): Readonly<Opts> => routerOptions as Opts;
export const getAnyExecutable = (id: string) => routesById.get(id) || linkedFnsById.get(id) || rawLinkedFnsById.get(id);

export const resetRouter = () => {
    flatRouter.clear();
    linkedFnsById.clear();
    routesById.clear();
    rawLinkedFnsById.clear();
    linkedFnNames.clear();
    routeNames.clear();
    complexity = 0;
    routerOptions = {...DEFAULT_ROUTE_OPTIONS};
    startLinkedFnsDef = {...defaultStartLinkedFns};
    endLinkedFnsDef = {...defaultEndLinkedFns};
    startLinkedFns = [];
    endLinkedFns = [];
    isRouterInitialized = false;
    allExecutablesIds = undefined;
    resetRemoteMethodsMetadata();
    resetPersistedMethods();
    resetDefaultAOTCachesState();
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
    return registerRoutes(routes);
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
    // In AOT mode, load the default AOT caches (router cache + JIT functions)
    // This must happen before registering any routes
    if (routerOptions.aot) await loadDefaultAOTCaches();
    isRouterInitialized = true;
    await registerRoutes({...mionErrorsRoutes});
    if (!routerOptions.skipClientRoutes) await registerRoutes({...mionClientRoutes});
    return routerOptions;
}

export async function registerRoutes<R extends Routes>(routes: R): Promise<PublicApi<R>> {
    if (!isRouterInitialized) throw new Error('initRouter should be called first');
    startLinkedFns = await getExecutablesFromLinkedFnsCollectionAsync(startLinkedFnsDef);
    endLinkedFns = await getExecutablesFromLinkedFnsCollectionAsync(endLinkedFnsDef);
    await recursiveFlatRoutesAsync(routes);
    // we only want to get information about the routes when creating api spec
    if (shouldFullGenerateSpec()) return getPublicApi(routes);
    return {} as PublicApi<R>;
}

/** Add linkedFns at the start af the execution path, adds them before any other existing start linkedFns by default */
export function addStartLinkedFns(linkedFnsDef: LinkedFnsCollection, appendBeforeExisting = true) {
    if (isRouterInitialized) throw new Error('Can not add start linkedFns after the router has been initialized');
    if (appendBeforeExisting) {
        startLinkedFnsDef = {...linkedFnsDef, ...startLinkedFnsDef};
        return;
    }
    startLinkedFnsDef = {...startLinkedFnsDef, ...linkedFnsDef};
}

/** Add linkedFns at the end af the execution path, adds them after any other existing end linkedFns by default */
export function addEndLinkedFns(linkedFnsDef: LinkedFnsCollection, prependAfterExisting = true) {
    if (isRouterInitialized) throw new Error('Can not add end linkedFns after the router has been initialized');
    if (prependAfterExisting) {
        endLinkedFnsDef = {...endLinkedFnsDef, ...linkedFnsDef};
        return;
    }
    endLinkedFnsDef = {...linkedFnsDef, ...endLinkedFnsDef};
}

export function isPrivateDefinition(entry: RouterEntry, id: string): entry is PrivateDef {
    if (isRoute(entry)) return false;
    if (isRawLinkedFnDef(entry)) return true;
    try {
        const executable = getLinkedFnExecutable(id) || getRouteExecutable(id);
        if (!executable)
            throw new Error(`Route or LinkedFn ${id} not found. Please check you have called router.registerRoutes first.`);
        return isPrivateExecutable(executable);
    } catch {
        // error thrown because entry is a Routes object and does not have any handler
        return false;
    }
}

export function isPrivateExecutable(executable: RemoteMethod): boolean {
    if (executable.type === HandlerType.rawLinkedFn) return true;
    if (executable.type === HandlerType.route) return false;
    const hasPublicParams = !!executable.paramNames?.length;
    const hasHeaderParams = !!(executable as HeaderMethod).headersParam?.headerNames?.length;
    return !hasPublicParams && !hasHeaderParams && !executable.hasReturnData;
}

export function getTotalExecutables(): number {
    return routesById.size + linkedFnsById.size + rawLinkedFnsById.size;
}

export function getAllExecutablesIds(): string[] {
    if (allExecutablesIds) return allExecutablesIds;
    allExecutablesIds = [...routesById.keys(), ...linkedFnsById.keys(), ...rawLinkedFnsById.keys()];
    return allExecutablesIds;
}

// used by codegen
export function shouldFullGenerateSpec(): boolean {
    return routerOptions.getPublicRoutesData || getENV('GENERATE_ROUTER_SPEC') === 'true';
}

export function getRouteExecutableFromPath(path: string): RouteMethod {
    const executionPath = flatRouter.get(path);
    if (!executionPath) {
        // Return the not-found route executable
        return getAnyExecutable(MION_ROUTES.notFound) as RouteMethod;
    }
    return executionPath.methods[executionPath.routeIndex] as RouteMethod;
}

// ############# PRIVATE METHODS #############

/**
 * Optimized algorithm to flatten the routes object into a list of Executable objects.
 * @param routes
 * @param currentPointer current pointer in the routes object i.e. ['users', 'get']
 * @param preLinkedFns linkedFns one level up preceding current pointer
 * @param postLinkedFns linkedFns one level up  following the current pointer
 * @param nestLevel
 */
async function recursiveFlatRoutesAsync(
    routes: Routes,
    currentPointer: string[] = [],
    preLinkedFns: RemoteMethod[] = [],
    postLinkedFns: RemoteMethod[] = [],
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

        // generates a linkedFn
        if (isAnyLinkedFnDef(item)) {
            routeEntry = await getExecutableFromAnyLinkedFn(item, newPointer, nestLevel);
            if (linkedFnNames.has(routeEntry.id))
                throw new Error(
                    `Invalid linkedFn: ${join(...newPointer)}. Naming collision, Naming collision, duplicated linkedFn.`
                );
            linkedFnNames.add(routeEntry.id);
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
        minus1Props = await recursiveCreateExecutionPathAsync(
            routeEntry,
            newPointer,
            preLinkedFns,
            postLinkedFns,
            nestLevel,
            index,
            entries,
            minus1Props
        );

        complexity++;
    }
}

async function recursiveCreateExecutionPathAsync(
    routeEntry: RemoteMethod | RoutesWithId,
    currentPointer: string[],
    preLinkedFns: RemoteMethod[],
    postLinkedFns: RemoteMethod[],
    nestLevel: number,
    index: number,
    routeKeyedEntries: RouterKeyEntryList,
    minus1Props: ReturnType<typeof getRouteEntryProperties> | null
) {
    const minus1 = getEntry(index - 1, routeKeyedEntries);
    const plus1 = getEntry(index + 1, routeKeyedEntries);
    const props = getRouteEntryProperties(minus1, routeEntry, plus1);

    if (props.isBetweenRoutes && minus1Props) {
        props.preLevelLinkedFns = minus1Props.preLevelLinkedFns;
        props.postLevelLinkedFns = minus1Props.postLevelLinkedFns;
    } else {
        for (let i = 0; i < routeKeyedEntries.length; i++) {
            const [k, entry] = routeKeyedEntries[i];
            complexity++;
            if (!isAnyLinkedFnDef(entry)) continue;
            const newPointer = [...currentPointer.slice(0, -1), k];
            const executable = await getExecutableFromAnyLinkedFn(entry, newPointer, nestLevel);
            if (i < index) props.preLevelLinkedFns.push(executable);
            if (i > index) props.postLevelLinkedFns.push(executable);
        }
    }
    const isExec = isExecutable(routeEntry);

    if (isExec && props.isRoute) {
        const path = getRoutePath(routeEntry.pointer, routerOptions);
        const levelMethods = [
            ...preLinkedFns,
            ...props.preLevelLinkedFns,
            routeEntry,
            ...props.postLevelLinkedFns,
            ...postLinkedFns,
        ];
        const methods = [...startLinkedFns, ...levelMethods, ...endLinkedFns];
        const routeMethod = routeEntry as RouteMethod;
        const executionPath: MethodsExecutionList = {
            routeIndex: startLinkedFns.length + preLinkedFns.length + props.preLevelLinkedFns.length,
            methods,
            serializer: getSerializerCodeFromMode(routeMethod.options.serializer),
        };
        flatRouter.set(path, executionPath);
    } else if (!isExec) {
        await recursiveFlatRoutesAsync(
            routeEntry.routes,
            routeEntry.pathPointer,
            [...preLinkedFns, ...props.preLevelLinkedFns],
            [...props.postLevelLinkedFns, ...postLinkedFns],
            nestLevel + 1
        );
    }

    return props;
}

async function getExecutableFromAnyLinkedFn(
    linkedFn: LinkedFnDef | HeaderLinkedFnDef | RawLinkedFnDef,
    linkedFnPointer: string[],
    nestLevel: number
) {
    if (isRawLinkedFnDef(linkedFn)) return getExecutableFromRawLinkedFn(linkedFn, linkedFnPointer, nestLevel);
    return getExecutableFromLinkedFn(linkedFn, linkedFnPointer, nestLevel);
}

export async function getExecutableFromLinkedFn(
    linkedFn: LinkedFnDef | HeaderLinkedFnDef,
    linkedFnPointer: string[],
    nestLevel: number
): Promise<LinkedFnMethod | HeaderMethod> {
    const isHeader = isHeaderLinkedFnDef(linkedFn);
    // todo fix header id should be same as any other one and then maybe map from id to header name
    const linkedFnId = getRouterItemId(linkedFnPointer);
    const existing = linkedFnsById.get(linkedFnId);
    if (existing) return existing as LinkedFnMethod;

    type MixedLinkedFn = (Omit<LinkedFnMethod, 'type'> | Omit<HeaderMethod, 'type'>) & {
        type: typeof HandlerType.linkedFn | typeof HandlerType.headerLinkedFn;
    };

    const compiledMethod = getPersistedMethod(linkedFnId, linkedFn.handler);
    let executable: MixedLinkedFn;
    if (compiledMethod) {
        executable = compiledMethod as MixedLinkedFn;
    } else {
        const reflectionData = await getHandlerReflection(linkedFn.handler, linkedFnId, routerOptions, isHeader);
        executable = {
            id: linkedFnId,
            type: isHeader ? HandlerType.headerLinkedFn : HandlerType.linkedFn,
            nestLevel,
            handler: linkedFn.handler,
            pointer: linkedFnPointer,
            ...reflectionData,
            options: {
                runOnError: !!linkedFn.options?.runOnError,
                validateParams: linkedFn.options?.validateParams ?? true,
                validateReturn: linkedFn.options?.validateReturn ?? false,
                description: linkedFn.options?.description,
            },
        };
        addToPersistedMethods(linkedFnId, executable);
    }

    linkedFnsById.set(linkedFnId, executable as any);
    return executable as any;
}

export async function getExecutableFromRawLinkedFn(
    linkedFn: RawLinkedFnDef,
    linkedFnPointer: string[],
    nestLevel: number
): Promise<RawMethod> {
    const linkedFnId = getRouterItemId(linkedFnPointer);
    const existing = rawLinkedFnsById.get(linkedFnId);
    if (existing) return existing as RawMethod;
    const reflectionData = await getRawMethodReflection(linkedFn.handler, linkedFnId, routerOptions);
    const executable: RawMethod = {
        id: linkedFnId,
        type: HandlerType.rawLinkedFn,
        nestLevel,
        handler: linkedFn.handler,
        pointer: linkedFnPointer,
        ...reflectionData,
        options: {
            runOnError: !!linkedFn.options?.runOnError,
            validateParams: false,
            validateReturn: false,
            description: linkedFn.options?.description,
        },
    };
    rawLinkedFnsById.set(linkedFnId, executable);
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
            },
        };
        addToPersistedMethods(routeId, executable);
    }
    routesById.set(routeId, executable);
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
        preLevelLinkedFns: [] as RemoteMethod[],
        postLevelLinkedFns: [] as RemoteMethod[],
    };
}

async function getExecutablesFromLinkedFnsCollectionAsync(
    linkedFnsDef: LinkedFnsCollection
): Promise<(RawMethod | LinkedFnMethod | HeaderMethod)[]> {
    const results: (RawMethod | LinkedFnMethod | HeaderMethod)[] = [];
    for (const [key, linkedFn] of Object.entries(linkedFnsDef)) {
        if (isRawLinkedFnDef(linkedFn)) {
            results.push(await getExecutableFromRawLinkedFn(linkedFn, [key], 0));
        } else if (isHeaderLinkedFnDef(linkedFn) || isLinkedFnDef(linkedFn)) {
            results.push(await getExecutableFromLinkedFn(linkedFn, [key], 0));
        } else {
            throw new Error(`Invalid linkedFn: ${key}. Invalid linkedFn definition`);
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
