/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {join} from 'path';
import type {Route, RouterOptions, Routes, RouterEntry} from './types/general';
import type {RemoteMethod, MethodsExecutionList, RawMethod, HeaderMethod, HookMethod, RouteMethod} from './types/remoteMethods';
import type {PublicApi, PrivateDef, HooksCollection} from './types/publicMethods';
import type {HeaderHookDef, HookDef, RawHookDef} from './types/definitions';
import {DEFAULT_ROUTE_OPTIONS, MAX_ROUTE_NESTING} from './constants';
import {isRawHookDef, isHeaderHookDef, isExecutable, isHookDef, isRoute, isRoutes, isAnyHookDef} from './types/guards';
import {HandlerType} from '@mionkit/core';
import {getRawMethodReflection, getHandlerReflection} from './lib/reflection';
import {serializerHooks} from './routes/serializer.routes';
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
const hooksById: Map<string, HookMethod | HeaderMethod | RawMethod> = new Map();
const routesById: Map<string, RouteMethod> = new Map();
const rawHooksById: Map<string, RawMethod> = new Map();
const hookNames: Set<string> = new Set();
const routeNames: Set<string> = new Set();
let complexity = 0;
let routerOptions: RouterOptions = {...DEFAULT_ROUTE_OPTIONS};
let isRouterInitialized = false;
let allExecutablesIds: string[] | undefined;

/** Global hooks to be run before and after any other hooks or routes set using `registerRoutes` */
const defaultStartHooks = {mionDeserializeRequest: serializerHooks.mionDeserializeRequest};
const defaultEndHooks = {
    mionSerializeResponse: serializerHooks.mionSerializeResponse,
};
let startHooksDef: HooksCollection = {...defaultStartHooks};
let endHooksDef: HooksCollection = {...defaultEndHooks};
export let startHooks: RemoteMethod[] = [];
export let endHooks: RemoteMethod[] = [];

// ############# PUBLIC METHODS #############

export const getRouteExecutionPath = (path: string) => flatRouter.get(path);
export const getRouteEntries = () => flatRouter.entries();
export const geRoutesSize = () => flatRouter.size;
export const getRouteExecutable = (id: string) => routesById.get(id);
export const getHookExecutable = (id: string) => hooksById.get(id);
export const geHooksSize = () => hooksById.size;
export const getComplexity = () => complexity;
export const getRouterOptions = <Opts extends RouterOptions>(): Readonly<Opts> => routerOptions as Opts;
export const getAnyExecutable = (id: string) => routesById.get(id) || hooksById.get(id) || rawHooksById.get(id);

export const resetRouter = () => {
    flatRouter.clear();
    hooksById.clear();
    routesById.clear();
    rawHooksById.clear();
    hookNames.clear();
    routeNames.clear();
    complexity = 0;
    routerOptions = {...DEFAULT_ROUTE_OPTIONS};
    startHooksDef = {...defaultStartHooks};
    endHooksDef = {...defaultEndHooks};
    startHooks = [];
    endHooks = [];
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
    startHooks = await getExecutablesFromHooksCollectionAsync(startHooksDef);
    endHooks = await getExecutablesFromHooksCollectionAsync(endHooksDef);
    await recursiveFlatRoutesAsync(routes);
    // we only want to get information about the routes when creating api spec
    if (shouldFullGenerateSpec()) return getPublicApi(routes);
    return {} as PublicApi<R>;
}

/** Add hooks at the start af the execution path, adds them before any other existing start hooks by default */
export function addStartHooks(hooksDef: HooksCollection, appendBeforeExisting = true) {
    if (isRouterInitialized) throw new Error('Can not add start hooks after the router has been initialized');
    if (appendBeforeExisting) {
        startHooksDef = {...hooksDef, ...startHooksDef};
        return;
    }
    startHooksDef = {...startHooksDef, ...hooksDef};
}

/** Add hooks at the end af the execution path, adds them after any other existing end hooks by default */
export function addEndHooks(hooksDef: HooksCollection, prependAfterExisting = true) {
    if (isRouterInitialized) throw new Error('Can not add end hooks after the router has been initialized');
    if (prependAfterExisting) {
        endHooksDef = {...endHooksDef, ...hooksDef};
        return;
    }
    endHooksDef = {...hooksDef, ...endHooksDef};
}

export function isPrivateDefinition(entry: RouterEntry, id: string): entry is PrivateDef {
    if (isRoute(entry)) return false;
    if (isRawHookDef(entry)) return true;
    try {
        const executable = getHookExecutable(id) || getRouteExecutable(id);
        if (!executable)
            throw new Error(`Route or Hook ${id} not found. Please check you have called router.registerRoutes first.`);
        return isPrivateExecutable(executable);
    } catch {
        // error thrown because entry is a Routes object and does not have any handler
        return false;
    }
}

export function isPrivateExecutable(executable: RemoteMethod): boolean {
    if (executable.type === HandlerType.rawHook) return true;
    if (executable.type === HandlerType.route) return false;
    const hasPublicParams = !!executable.paramNames?.length;
    const hasHeaderParams = !!(executable as HeaderMethod).headersParam?.headerNames?.length;
    return !hasPublicParams && !hasHeaderParams && !executable.hasReturnData;
}

export function getTotalExecutables(): number {
    return routesById.size + hooksById.size + rawHooksById.size;
}

export function getAllExecutablesIds(): string[] {
    if (allExecutablesIds) return allExecutablesIds;
    allExecutablesIds = [...routesById.keys(), ...hooksById.keys(), ...rawHooksById.keys()];
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
 * @param preHooks hooks one level up preceding current pointer
 * @param postHooks hooks one level up  following the current pointer
 * @param nestLevel
 */
async function recursiveFlatRoutesAsync(
    routes: Routes,
    currentPointer: string[] = [],
    preHooks: RemoteMethod[] = [],
    postHooks: RemoteMethod[] = [],
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

        // generates a hook
        if (isAnyHookDef(item)) {
            routeEntry = await getExecutableFromAnyHookAsync(item, newPointer, nestLevel);
            if (hookNames.has(routeEntry.id))
                throw new Error(`Invalid hook: ${join(...newPointer)}. Naming collision, Naming collision, duplicated hook.`);
            hookNames.add(routeEntry.id);
        }

        // generates a route
        else if (isRoute(item)) {
            routeEntry = await getExecutableFromRouteAsync(item, newPointer, nestLevel);
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
            preHooks,
            postHooks,
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
    preHooks: RemoteMethod[],
    postHooks: RemoteMethod[],
    nestLevel: number,
    index: number,
    routeKeyedEntries: RouterKeyEntryList,
    minus1Props: ReturnType<typeof getRouteEntryProperties> | null
) {
    const minus1 = getEntry(index - 1, routeKeyedEntries);
    const plus1 = getEntry(index + 1, routeKeyedEntries);
    const props = getRouteEntryProperties(minus1, routeEntry, plus1);

    if (props.isBetweenRoutes && minus1Props) {
        props.preLevelHooks = minus1Props.preLevelHooks;
        props.postLevelHooks = minus1Props.postLevelHooks;
    } else {
        for (let i = 0; i < routeKeyedEntries.length; i++) {
            const [k, entry] = routeKeyedEntries[i];
            complexity++;
            if (!isAnyHookDef(entry)) continue;
            const newPointer = [...currentPointer.slice(0, -1), k];
            const executable = await getExecutableFromAnyHookAsync(entry, newPointer, nestLevel);
            if (i < index) props.preLevelHooks.push(executable);
            if (i > index) props.postLevelHooks.push(executable);
        }
    }
    const isExec = isExecutable(routeEntry);

    if (isExec && props.isRoute) {
        const path = getRoutePath(routeEntry.pointer, routerOptions);
        const levelMethods = [...preHooks, ...props.preLevelHooks, routeEntry, ...props.postLevelHooks, ...postHooks];
        const methods = [...startHooks, ...levelMethods, ...endHooks];
        const executionPath: MethodsExecutionList = {
            routeIndex: startHooks.length + preHooks.length + props.preLevelHooks.length,
            methods,
        };
        flatRouter.set(path, executionPath);
    } else if (!isExec) {
        await recursiveFlatRoutesAsync(
            routeEntry.routes,
            routeEntry.pathPointer,
            [...preHooks, ...props.preLevelHooks],
            [...props.postLevelHooks, ...postHooks],
            nestLevel + 1
        );
    }

    return props;
}

async function getExecutableFromAnyHookAsync(
    hook: HookDef | HeaderHookDef | RawHookDef,
    hookPointer: string[],
    nestLevel: number
) {
    if (isRawHookDef(hook)) return getExecutableFromRawHookAsync(hook, hookPointer, nestLevel);
    return getExecutableFromHookAsync(hook, hookPointer, nestLevel);
}

export async function getExecutableFromHookAsync(
    hook: HookDef | HeaderHookDef,
    hookPointer: string[],
    nestLevel: number
): Promise<HookMethod | HeaderMethod> {
    const isHeader = isHeaderHookDef(hook);
    // todo fix header id should be same as any other one and then maybe map from id to header name
    const hookId = getRouterItemId(hookPointer);
    const existing = hooksById.get(hookId);
    if (existing) return existing as HookMethod;

    type MixedHook = (Omit<HookMethod, 'type'> | Omit<HeaderMethod, 'type'>) & {
        type: typeof HandlerType.hook | typeof HandlerType.headerHook;
    };

    const compiledMethod = getPersistedMethod(hookId, hook.handler);
    let executable: MixedHook;
    if (compiledMethod) {
        executable = compiledMethod as MixedHook;
    } else {
        const reflectionData = await getHandlerReflection(hook.handler, hookId, routerOptions, isHeader);
        executable = {
            id: hookId,
            type: isHeader ? HandlerType.headerHook : HandlerType.hook,
            nestLevel,
            handler: hook.handler,
            pointer: hookPointer,
            ...reflectionData,
            serialize: routerOptions.serialize,
            options: {
                runOnError: !!hook.options?.runOnError,
                validateParams: hook.options?.validateParams ?? true,
                validateReturn: hook.options?.validateReturn ?? false,
                description: hook.options?.description,
            },
        };
        addToPersistedMethods(hookId, executable);
    }

    hooksById.set(hookId, executable as any);
    return executable as any;
}

export async function getExecutableFromRawHookAsync(
    hook: RawHookDef,
    hookPointer: string[],
    nestLevel: number
): Promise<RawMethod> {
    const hookId = getRouterItemId(hookPointer);
    const existing = rawHooksById.get(hookId);
    if (existing) return existing as RawMethod;
    const reflectionData = await getRawMethodReflection(hook.handler, hookId, routerOptions);
    const executable: RawMethod = {
        id: hookId,
        type: HandlerType.rawHook,
        nestLevel,
        handler: hook.handler,
        pointer: hookPointer,
        ...reflectionData,
        serialize: routerOptions.serialize,
        options: {
            runOnError: !!hook.options?.runOnError,
            validateParams: false,
            validateReturn: false,
            description: hook.options?.description,
        },
    };
    rawHooksById.set(hookId, executable);
    return executable;
}

export async function getExecutableFromRouteAsync(route: Route, routePointer: string[], nestLevel: number): Promise<RouteMethod> {
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
            serialize: routerOptions.serialize,
            options: {
                runOnError: false,
                validateParams: route.options?.validateParams ?? true,
                validateReturn: route.options?.validateReturn ?? false,
                description: route.options?.description,
                serializer: route.options?.serializer,
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
        preLevelHooks: [] as RemoteMethod[],
        postLevelHooks: [] as RemoteMethod[],
    };
}

async function getExecutablesFromHooksCollectionAsync(
    hooksDef: HooksCollection
): Promise<(RawMethod | HookMethod | HeaderMethod)[]> {
    const results: (RawMethod | HookMethod | HeaderMethod)[] = [];
    for (const [key, hook] of Object.entries(hooksDef)) {
        if (isRawHookDef(hook)) {
            results.push(await getExecutableFromRawHookAsync(hook, [key], 0));
        } else if (isHeaderHookDef(hook) || isHookDef(hook)) {
            results.push(await getExecutableFromHookAsync(hook, [key], 0));
        } else {
            throw new Error(`Invalid hook: ${key}. Invalid hook definition`);
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
